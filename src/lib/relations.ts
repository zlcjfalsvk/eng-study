import type { EntryType, Level } from '../data/types'
import { levelOfId } from './content'
import { relationShard } from './relation-shard'

// scripts/relations.ts 가 빌드 시 만든 색인. 상세 화면에서 다른 레벨 파일을 내려받지 않고 연관 단어를 보여 준다.
export type RelKind = 'd' | 'b' | 's' | 'a' | 'r' | 'e'
export interface RelCard {
  id: string
  h: string
  m: string
  l: Level
  t: EntryType
}
interface RelationsFile {
  rel: Record<string, Partial<Record<RelKind, string[]>>>
  cards: Record<string, Omit<RelCard, 'id'>>
}

export const REL_LABEL: Record<RelKind, string> = {
  d: '이 단어로 만든 표현',
  b: '어근 단어',
  s: '유의어',
  a: '반의어',
  r: '함께 익히면 좋은 표현',
  e: '다른 레벨의 같은 단어',
}
export const REL_ORDER: RelKind[] = ['d', 'b', 'r', 's', 'a', 'e']

const baseURL = import.meta.env?.BASE_URL ?? '/'
const BASE = baseURL.endsWith('/') ? baseURL : baseURL + '/'
const cache = new Map<string, Promise<RelationsFile>>()
function loadFile(path: string): Promise<RelationsFile> {
  let pending = cache.get(path)
  if (!pending) {
    pending = fetch(`${BASE}data/${path}`, { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<RelationsFile>
      })
      .catch((error) => { cache.delete(path); throw error })
    cache.set(path, pending)
  }
  return pending
}

export async function getRelated(id: string): Promise<{ kind: RelKind; items: RelCard[] }[]> {
  const f = await loadFile(`relations/${levelOfId(id)}/${relationShard(id)}.json`)
    .catch(() => loadFile('relations.json')) // previously cached offline data
    .catch(() => null)
  if (!f) return []
  const r = f.rel[id]
  if (!r) return []
  return REL_ORDER.flatMap((kind) => {
    const ids = r[kind]
    if (!ids?.length) return []
    return [{ kind, items: ids.map((i) => ({ id: i, ...f.cards[i] })).filter((c) => c.h) }]
  })
}

/** 플래시카드 뒷면용 한 줄 요약: 표현·어근·related 만, 최대 n개 */
export async function getRelatedBrief(id: string, n = 4): Promise<RelCard[]> {
  const groups = await getRelated(id)
  return groups
    .filter((g) => g.kind === 'd' || g.kind === 'b' || g.kind === 'r')
    .flatMap((g) => g.items)
    .slice(0, n)
}
