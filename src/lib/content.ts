import type { Entry, EntryType, GrammarTopic, Level } from '../data/types'
import { LEVELS } from '../data/types'

// 콘텐츠는 빌드 시 public/data/ 에 생성된 정적 JSON 을 런타임에 fetch 한다 (scripts/build-data.ts 참고).
// 목록·검색·학습 대상 선정은 레벨별 경량 색인(index.json)만으로 처리하고,
// 전체 항목(뜻·예문)은 추천순 32개 단위 샤드에서 필요한 것만 받는다. 이전 200개 샤드도 지원한다.

export interface IndexItem {
  id: string
  h: string // headword
  t: EntryType
  l: Level // 로드 시 부여
  m: string // 첫 뜻
  n: number // 뜻 개수
  c: string[] // 상황 라벨
  g: string[] // 태그
  k: string // 검색 키워드
  s: number // 샤드 번호
  x?: number // 추천순 compact 샤드 번호 (이전 색인에는 없음)
  r?: number // 레벨 안의 추천 학습 순서 (이전 캐시에는 없을 수 있음)
  p?: string[] // 품사 (퀴즈 보기 구성)
}

export interface Manifest {
  generatedAt: string
  shardSize: number
  levels: Record<Level, { total: number; shards: number; byType: Record<string, number> }>
  grammar: number
}

const baseURL = import.meta.env?.BASE_URL ?? '/'
const BASE = baseURL.endsWith('/') ? baseURL : baseURL + '/'
const memo = new Map<string, Promise<unknown>>()

function getJSON<T>(path: string): Promise<T> {
  const cached = memo.get(path)
  if (cached) return cached as Promise<T>
  const p = fetch(`${BASE}data/${path}`, { cache: 'no-cache' })
    .then((r) => {
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
      return r.json() as Promise<T>
    })
    .catch((e) => {
      memo.delete(path) // 실패는 캐시하지 않는다
      throw e
    })
  memo.set(path, p)
  return p
}

export function loadManifest(): Promise<Manifest> {
  return getJSON<Manifest>('manifest.json')
}

export async function loadIndex(level: Level): Promise<IndexItem[]> {
  const key = `index:${level}`
  const cached = memo.get(key)
  if (cached) return cached as Promise<IndexItem[]>
  // 작은 샤드 정보가 없는 이전 서비스 워커 색인과 구분한다.
  // 오프라인일 때는 이미 받아 둔 이전 색인으로도 계속 탐색할 수 있다.
  const p = getJSON<Omit<IndexItem, 'l'>[]>(`${level}/index.json?order=3`)
    .catch(() => getJSON<Omit<IndexItem, 'l'>[]>(`${level}/index.json?order=2`))
    .catch(() => getJSON<Omit<IndexItem, 'l'>[]>(`${level}/index.json?order=1`))
    .catch(() => getJSON<Omit<IndexItem, 'l'>[]>(`${level}/index.json`))
    .then((items) => items.map((i) => ({ ...i, l: level })))
    .catch(() => [] as IndexItem[]) // 콘텐츠가 없는 레벨은 빈 목록
  memo.set(key, p)
  return p
}

export async function loadAllIndexes(): Promise<IndexItem[]> {
  const key = 'index:all'
  let cached = memo.get(key) as Promise<IndexItem[]> | undefined
  if (!cached) {
    cached = Promise.all(LEVELS.map((l) => loadIndex(l))).then((lists) => lists.flat())
    memo.set(key, cached)
  }
  return cached
}

export function loadShard(level: Level, shard: number): Promise<Entry[]> {
  return getJSON<Entry[]>(`${level}/${shard}.json`)
}

function loadItemShard(item: IndexItem): Promise<Entry[]> {
  // Keep the old URLs and numbering: cached old indexes still point at 200-item shards.
  if (item.x == null) return loadShard(item.l, item.s)
  return getJSON<Entry[]>(`${item.l}/compact/${item.x}.json`)
    .then((entries) => entries.some((e) => e.id === item.id) ? entries : loadShard(item.l, item.s))
    .catch(() => loadShard(item.l, item.s))
}

export function levelOfId(id: string): Level {
  switch (id[0]) {
    case 'b':
      return 'beginner'
    case 'i':
      return 'intermediate'
    case 'a':
      return 'advanced'
    default:
      return 'business'
  }
}

export async function loadEntry(id: string): Promise<Entry | undefined> {
  const level = levelOfId(id)
  const index = await loadIndex(level)
  const item = index.find((i) => i.id === id)
  if (!item) return undefined
  const shard = await loadItemShard(item)
  return shard.find((e) => e.id === id)
}

/** 여러 항목을 샤드 단위로 묶어 받는다. 입력 순서를 유지한다. */
export async function loadEntries(ids: string[]): Promise<Entry[]> {
  const levels = [...new Set(ids.map(levelOfId))]
  const lists = await Promise.all(levels.map((lv) => loadIndex(lv)))
  const indexes = new Map(lists.flat().map((item) => [item.id, item]))
  const shards = new Map<string, IndexItem>()
  for (const id of ids) {
    const item = indexes.get(id)
    if (!item) continue
    // Include the legacy shard in the key so each can fall back independently.
    shards.set(`${item.l}:${item.x ?? 'legacy'}:${item.s}`, item)
  }
  const found = new Map<string, Entry>()
  await Promise.all(
    [...shards.values()].map(async (item) => {
      for (const e of await loadItemShard(item)) found.set(e.id, e)
    }),
  )
  // A stale compact shard may contain the group's first ID but miss another one.
  const missing = new Map<string, IndexItem>()
  for (const id of ids) {
    const item = indexes.get(id)
    if (!found.has(id) && item?.x != null) missing.set(`${item.l}:${item.s}`, item)
  }
  await Promise.all([...missing.values()].map(async (item) => {
    for (const e of await loadShard(item.l, item.s)) found.set(e.id, e)
  }))
  return ids.map((id) => found.get(id)).filter((e): e is Entry => !!e)
}

export function loadGrammar(): Promise<GrammarTopic[]> {
  return getJSON<GrammarTopic[]>('grammar.json').catch(() => [])
}

/** 검색: 표제어 > 변화형/뜻/유의어 순으로 가중치 */
export function searchIndex(list: IndexItem[], q: string): IndexItem[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return list
  const scored: { e: IndexItem; s: number }[] = []
  for (const e of list) {
    const hw = e.h.toLowerCase()
    let s = 0
    if (hw === needle) s = 100
    else if (hw.startsWith(needle)) s = 80
    else if (hw.includes(needle)) s = 60
    else if (e.k.includes(needle)) s = 40
    if (s) scored.push({ e, s })
  }
  // 같은 검색 점수라면 호출한 곳에서 선택한 정렬 순서를 유지한다.
  return scored.sort((a, b) => b.s - a.s).map((x) => x.e)
}

export const LEVEL_META: Record<Level, { label: string; short: string; code: string; desc: string; color: string; bg: string; ring: string; bar: string }> = {
  beginner: {
    label: '초급',
    short: 'A1–A2',
    code: 'A1',
    desc: '일상·가족·학교의 핵심 어휘',
    color: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-950/50',
    ring: 'ring-emerald-200 dark:ring-emerald-800',
    bar: 'bg-emerald-500',
  },
  intermediate: {
    label: '중급',
    short: 'B1–B2',
    code: 'B1',
    desc: '뉴스·여행·의견 표현',
    color: 'text-sky-700 dark:text-sky-300',
    bg: 'bg-sky-50 dark:bg-sky-950/50',
    ring: 'ring-sky-200 dark:ring-sky-800',
    bar: 'bg-sky-500',
  },
  advanced: {
    label: '고급',
    short: 'C1–C2',
    code: 'C1',
    desc: '시사·학술·문학의 뉘앙스',
    color: 'text-violet-700 dark:text-violet-300',
    bg: 'bg-violet-50 dark:bg-violet-950/50',
    ring: 'ring-violet-200 dark:ring-violet-800',
    bar: 'bg-violet-500',
  },
  business: {
    label: '비즈니스',
    short: 'Business',
    code: 'BIZ',
    desc: '회의·이메일·협상·재무',
    color: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-950/50',
    ring: 'ring-amber-200 dark:ring-amber-800',
    bar: 'bg-amber-500',
  },
}

export const TYPE_LABEL: Record<EntryType, string> = {
  word: '단어',
  phrasal: '구동사',
  idiom: '관용구',
  collocation: '연어',
}
