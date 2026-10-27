// 단어 간 연관 색인을 빌드 시점에 미리 계산한다 → src/data/content/relations.json
// 런타임은 이 파일 하나만 읽으면 되므로, 상세 화면에서 다른 레벨의 큰 JSON 을 내려받지 않아도 된다.
//
// 연관 종류
//   d (derived)  : 이 단어를 어근으로 쓰는 구동사·연어·관용구   take → take off, take a break
//   b (base)     : 이 표현의 어근 단어                          take off → take
//   s (synonym)  : 어떤 뜻의 유의어로 적힌 표제어
//   a (antonym)  : 어떤 뜻의 반의어로 적힌 표제어
//   r (related)  : 콘텐츠에 명시된 related 표제어
//   e (equal)    : 다른 레벨에 같은 표제어로 수록된 항목
import type { Entry, EntryType, Level } from '../src/data/types.ts'

export type RelKind = 'd' | 'b' | 's' | 'a' | 'r' | 'e'
export interface RelCard {
  h: string // headword
  m: string // 첫 뜻(meaningKo)
  l: Level
  t: EntryType
}
export interface RelationsFile {
  generatedAt: string
  rel: Record<string, Partial<Record<RelKind, string[]>>>
  cards: Record<string, RelCard>
}

const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'up', 'down', 'out', 'off', 'over', 'into', 'onto', 'about', 'around', 'through', 'and', 'or', 'it', "it's", 'its', 'be', 'is', 'are', 'was', 'were', 'been', 'being', 'one', "one's", 'someone', "someone's", 'something', 'somebody', 'sb', 'sth', 'your', 'you', 'my', 'me', 'i', 'as', 'so', 'not', 'no', 'all', 'do', 'does', 'did', 'have', 'has', 'had', 'get', 'got', 'go', 'went', 'make', 'made', 'take', 'took', 'put', 'come', 'came', 'give', 'gave'])
// 주의: get/make/take/put/come/give/go/have/do 를 STOP 에 넣은 이유 — 이들은 "첫 번째 토큰"으로만 어근 취급한다(아래 참고).
const LIGHT_VERBS = new Set(['do', 'does', 'did', 'have', 'has', 'had', 'get', 'got', 'go', 'went', 'make', 'made', 'take', 'took', 'put', 'come', 'came', 'give', 'gave', 'be'])

function norm(w: string) {
  return w.toLowerCase().replace(/[^a-z'\-]/g, '')
}
function variants(tok: string): string[] {
  const v = new Set([tok])
  for (const suf of ['ing', 'ies', 'es', 'ed', 's', 'd']) {
    if (tok.endsWith(suf) && tok.length - suf.length >= 3) {
      const stem = tok.slice(0, -suf.length)
      v.add(stem)
      if (suf === 'ies') v.add(stem + 'y')
      if (suf === 'ing' || suf === 'ed') v.add(stem + 'e')
      if (suf === 'ing' && stem.length > 3 && stem[stem.length - 1] === stem[stem.length - 2]) v.add(stem.slice(0, -1)) // running → run
    }
  }
  return [...v]
}

export function buildRelations(all: Entry[]): RelationsFile {
  // 표제어(및 변화형) → 단어 엔트리 id
  const wordIndex = new Map<string, string[]>()
  const headIndex = new Map<string, string[]>()
  const add = (map: Map<string, string[]>, k: string, id: string) => {
    const arr = map.get(k) ?? []
    if (!arr.includes(id)) arr.push(id)
    map.set(k, arr)
  }
  for (const e of all) {
    add(headIndex, e.headword.toLowerCase(), e.id)
    if (e.type === 'word') {
      add(wordIndex, e.headword.toLowerCase(), e.id)
      for (const f of e.forms ?? []) add(wordIndex, f.toLowerCase(), e.id)
    }
  }

  const rel: RelationsFile['rel'] = {}
  const push = (id: string, kind: RelKind, target: string) => {
    if (id === target) return
    const r = (rel[id] ??= {})
    const arr = (r[kind] ??= [])
    if (!arr.includes(target)) arr.push(target)
  }

  for (const e of all) {
    // 어근: 다단어 표현의 내용어 토큰이 단어 표제어와 일치하면 연결 (양방향)
    if (e.type !== 'word') {
      const toks = e.headword.split(/\s+/).map(norm).filter(Boolean)
      toks.forEach((tok, i) => {
        // 경동사(get/take/make...)는 첫 토큰일 때만 어근으로 본다 (take a break → take, 하지만 "give it a go" 의 go 는 제외)
        if (STOP.has(tok) && !(i === 0 && LIGHT_VERBS.has(tok))) return
        for (const v of variants(tok)) {
          for (const wid of wordIndex.get(v) ?? []) {
            push(e.id, 'b', wid)
            push(wid, 'd', e.id)
          }
        }
      })
    }
    // 유의어/반의어: 수록 표제어와 일치하면 연결
    for (const s of e.senses) {
      for (const syn of s.synonyms ?? []) for (const id of headIndex.get(syn.toLowerCase()) ?? []) push(e.id, 's', id)
      for (const ant of s.antonyms ?? []) for (const id of headIndex.get(ant.toLowerCase()) ?? []) push(e.id, 'a', id)
    }
    // 명시적 related
    for (const r of e.related ?? []) for (const id of headIndex.get(r.toLowerCase()) ?? []) push(e.id, 'r', id)
    // 다른 레벨의 같은 표제어
    for (const id of headIndex.get(e.headword.toLowerCase()) ?? []) push(e.id, 'e', id)
  }

  // 카드 정보는 연관에 등장하는 id 만 담는다
  const byId = new Map(all.map((e) => [e.id, e]))
  const cards: RelationsFile['cards'] = {}
  for (const r of Object.values(rel)) {
    for (const ids of Object.values(r)) {
      for (const id of ids ?? []) {
        if (cards[id]) continue
        const e = byId.get(id)!
        cards[id] = { h: e.headword, m: e.senses[0].meaningKo, l: e.level, t: e.type }
      }
    }
  }
  return { generatedAt: new Date().toISOString(), rel, cards }
}
