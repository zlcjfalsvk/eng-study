import type { Entry, EntryType, GrammarTopic, Level } from '../data/types'
import { LEVELS } from '../data/types'

// 콘텐츠는 빌드 시 public/data/ 에 생성된 정적 JSON 을 런타임에 fetch 한다 (scripts/build-data.ts 참고).
// 목록·검색·학습 대상 선정은 레벨별 경량 색인(index.json)만으로 처리하고,
// 전체 항목(뜻·예문)은 200개 단위 샤드에서 필요한 것만 받는다. 서비스 워커가 받은 파일을 캐시한다.

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
  r?: number // 레벨 안의 추천 학습 순서 (이전 캐시에는 없을 수 있음)
  p?: string[] // 품사 (퀴즈 보기 구성)
}

export interface Manifest {
  generatedAt: string
  shardSize: number
  levels: Record<Level, { total: number; shards: number; byType: Record<string, number> }>
  grammar: number
}

const BASE = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/'
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
  // 추천 순서·퀴즈 품사 정보가 없는 이전 서비스 워커 색인과 구분한다.
  // 오프라인일 때는 이미 받아 둔 이전 색인으로도 계속 탐색할 수 있다.
  const p = getJSON<Omit<IndexItem, 'l'>[]>(`${level}/index.json?order=2`)
    .catch(() => getJSON<Omit<IndexItem, 'l'>[]>(`${level}/index.json?order=1`))
    .catch(() => getJSON<Omit<IndexItem, 'l'>[]>(`${level}/index.json`))
    .then((items) => items.map((i) => ({ ...i, l: level })))
    .catch(() => [] as IndexItem[]) // 콘텐츠가 없는 레벨은 빈 목록
  memo.set(key, p)
  return p
}

export async function loadAllIndexes(): Promise<IndexItem[]> {
  const lists = await Promise.all(LEVELS.map((l) => loadIndex(l)))
  return lists.flat()
}

export function loadShard(level: Level, shard: number): Promise<Entry[]> {
  return getJSON<Entry[]>(`${level}/${shard}.json`)
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
  const shard = await loadShard(level, item.s)
  return shard.find((e) => e.id === id)
}

/** 여러 항목을 샤드 단위로 묶어 받는다. 입력 순서를 유지한다. */
export async function loadEntries(ids: string[]): Promise<Entry[]> {
  const byLevel = new Map<Level, Set<number>>()
  const indexes = new Map<Level, IndexItem[]>()
  for (const id of ids) {
    const lv = levelOfId(id)
    if (!indexes.has(lv)) indexes.set(lv, await loadIndex(lv))
    const item = indexes.get(lv)!.find((i) => i.id === id)
    if (!item) continue
    if (!byLevel.has(lv)) byLevel.set(lv, new Set())
    byLevel.get(lv)!.add(item.s)
  }
  const found = new Map<string, Entry>()
  await Promise.all(
    [...byLevel].flatMap(([lv, shards]) =>
      [...shards].map(async (s) => {
        for (const e of await loadShard(lv, s)) found.set(e.id, e)
      }),
    ),
  )
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
