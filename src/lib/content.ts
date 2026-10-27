import type { Entry, GrammarTopic, Level } from '../data/types'
import { LEVELS } from '../data/types'

// 레벨별 JSON 은 필요할 때만 로드한다 (레벨당 수천 개가 되어도 홈 화면이 무거워지지 않도록).
const entryModules = import.meta.glob<{ default: unknown }>('../data/content/{beginner,intermediate,advanced,business}.json')
const grammarModule = import.meta.glob<{ default: unknown }>('../data/content/grammar.json')

export interface Manifest {
  generatedAt: string
  levels: Record<Level, { total: number; byType: Record<string, number> }>
  grammar: number
}

let manifestCache: Manifest | null = null
export async function loadManifest(): Promise<Manifest> {
  if (manifestCache) return manifestCache
  try {
    const m = (await import('../data/content/manifest.json')) as { default: Manifest }
    manifestCache = m.default
  } catch {
    // manifest 가 없으면 레벨 파일을 직접 세어 만든다 (개발 편의용)
    const levels = {} as Manifest['levels']
    for (const lv of LEVELS) {
      const list = await loadLevel(lv)
      const byType: Record<string, number> = {}
      for (const e of list) byType[e.type] = (byType[e.type] ?? 0) + 1
      levels[lv] = { total: list.length, byType }
    }
    manifestCache = { generatedAt: '', levels, grammar: (await loadGrammar()).length }
  }
  return manifestCache
}

const levelCache = new Map<Level, Entry[]>()
const levelPromise = new Map<Level, Promise<Entry[]>>()

export function loadLevel(level: Level): Promise<Entry[]> {
  const cached = levelCache.get(level)
  if (cached) return Promise.resolve(cached)
  const pending = levelPromise.get(level)
  if (pending) return pending
  const key = Object.keys(entryModules).find((k) => k.endsWith(`/${level}.json`))
  const p = (async () => {
    if (!key) return []
    const mod = await entryModules[key]()
    const list = (mod.default as Entry[]) ?? []
    levelCache.set(level, list)
    return list
  })()
  levelPromise.set(level, p)
  return p
}

export async function loadAllLevels(): Promise<Entry[]> {
  const lists = await Promise.all(LEVELS.map((l) => loadLevel(l)))
  return lists.flat()
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
  const list = await loadLevel(levelOfId(id))
  return list.find((e) => e.id === id)
}

let grammarCache: GrammarTopic[] | null = null
export async function loadGrammar(): Promise<GrammarTopic[]> {
  if (grammarCache) return grammarCache
  const key = Object.keys(grammarModule)[0]
  if (!key) return (grammarCache = [])
  const mod = await grammarModule[key]()
  grammarCache = (mod.default as GrammarTopic[]) ?? []
  return grammarCache
}

/** 검색: 표제어 > 뜻(한/영) > 예문 순으로 가중치를 두어 정렬 */
export function searchEntries(list: Entry[], q: string): Entry[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return list
  const scored: { e: Entry; s: number }[] = []
  for (const e of list) {
    const hw = e.headword.toLowerCase()
    let s = 0
    if (hw === needle) s = 100
    else if (hw.startsWith(needle)) s = 80
    else if (hw.includes(needle)) s = 60
    else if (e.forms?.some((f) => f.toLowerCase().includes(needle))) s = 55
    else if (e.senses.some((se) => se.meaningKo.includes(needle) || se.meaningEn.toLowerCase().includes(needle))) s = 40
    else if (e.senses.some((se) => se.synonyms?.some((sy) => sy.toLowerCase().includes(needle)))) s = 30
    else if (e.senses.some((se) => se.examples.some((x) => x.en.toLowerCase().includes(needle) || x.ko.includes(needle)))) s = 10
    if (s) scored.push({ e, s })
  }
  return scored.sort((a, b) => b.s - a.s || a.e.headword.localeCompare(b.e.headword)).map((x) => x.e)
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

export const TYPE_LABEL: Record<Entry['type'], string> = {
  word: '단어',
  phrasal: '구동사',
  idiom: '관용구',
  collocation: '연어',
}
