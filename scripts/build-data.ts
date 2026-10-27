// 콘텐츠 빌드: pnpm data
// content/ 원본을 검증한 뒤 public/data/ 에 런타임용 파일을 만든다.
//   data/manifest.json          레벨별 개수
//   data/relations.json         단어 간 연관 색인
//   data/grammar.json           문법 주제
//   data/<level>/index.json     목록·검색용 경량 색인 (id, 표제어, 첫 뜻, 상황, 검색 키워드, 샤드 번호)
//   data/<level>/<n>.json       200개 단위 샤드 (전체 Entry)
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Entry } from '../src/data/types.ts'
import { LEVELS, OUT_DIR, SHARD_SIZE } from './lib/content-io.ts'
import { buildRelations } from './relations.ts'
import { validateAll } from './validate.ts'

export interface IndexItem {
  id: string
  h: string // headword
  t: Entry['type']
  m: string // 첫 뜻(meaningKo)
  n: number // 뜻 개수
  c: string[] // 상황 라벨(중복 제거, 최대 3)
  g: string[] // 태그
  k: string // 검색 키워드: 변화형 | 모든 meaningKo | 유의어 (소문자)
  s: number // 샤드 번호
}

const r = validateAll()
for (const m of r.messages) (m.startsWith('✗') || m.startsWith('   ') ? console.error : console.log)(m)
if (!r.ok) {
  console.error('검증 실패 — 데이터 빌드를 중단합니다.')
  process.exit(1)
}

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

const manifest = { generatedAt: new Date().toISOString(), shardSize: SHARD_SIZE, levels: {} as Record<string, { total: number; shards: number; byType: Record<string, number> }>, grammar: r.grammar.length }
const all: Entry[] = []

for (const lv of LEVELS) {
  const list = r.levels[lv].slice().sort((a, b) => a.headword.localeCompare(b.headword, 'en') || a.id.localeCompare(b.id))
  all.push(...list)
  const dir = join(OUT_DIR, lv)
  mkdirSync(dir, { recursive: true })
  const index: IndexItem[] = []
  const byType: Record<string, number> = {}
  for (let i = 0; i < list.length; i += SHARD_SIZE) {
    const shard = i / SHARD_SIZE
    const chunk = list.slice(i, i + SHARD_SIZE)
    writeFileSync(join(dir, `${shard}.json`), JSON.stringify(chunk))
    for (const e of chunk) {
      byType[e.type] = (byType[e.type] ?? 0) + 1
      const kw = new Set<string>()
      for (const f of e.forms ?? []) kw.add(f.toLowerCase())
      for (const s of e.senses) {
        kw.add(s.meaningKo)
        for (const sy of s.synonyms ?? []) kw.add(sy.toLowerCase())
      }
      index.push({
        id: e.id,
        h: e.headword,
        t: e.type,
        m: e.senses[0].meaningKo,
        n: e.senses.length,
        c: Array.from(new Set(e.senses.map((s) => s.context))).slice(0, 3),
        g: e.tags ?? [],
        k: Array.from(kw).join('|'),
        s: shard,
      })
    }
  }
  writeFileSync(join(dir, 'index.json'), JSON.stringify(index))
  manifest.levels[lv] = { total: list.length, shards: Math.ceil(list.length / SHARD_SIZE), byType }
}

writeFileSync(join(OUT_DIR, 'grammar.json'), JSON.stringify(r.grammar))
const relations = buildRelations(all)
writeFileSync(join(OUT_DIR, 'relations.json'), JSON.stringify(relations))
writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))

const relCount = Object.values(relations.rel).reduce((n, x) => n + Object.values(x).reduce((m, a) => m + (a?.length ?? 0), 0), 0)
console.log(`→ public/data/: 표제어 ${all.length}개 (샤드 ${Object.values(manifest.levels).reduce((n, l) => n + l.shards, 0)}개), 문법 ${r.grammar.length}개, 연관 ${relCount}개`)
