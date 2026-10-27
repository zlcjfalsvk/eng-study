// 콘텐츠 JSON 검증: pnpm validate [파일...]
// 인자가 없으면 src/data/content/*.json 전체를 검증한다.
import { readFileSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { entriesSchema, grammarTopicsSchema, LEVEL_PREFIX, TYPE_PREFIX } from '../src/data/schema.ts'

const dir = join(import.meta.dirname, '../src/data/content')
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'manifest.json').map((f) => join(dir, f))

let failed = false
const seenIds = new Set<string>()
const seenHeadwords = new Map<string, string>()

for (const file of files) {
  const name = basename(file)
  let json: unknown
  try {
    json = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    console.error(`✗ ${name}: JSON 파싱 실패 — ${(e as Error).message}`)
    failed = true
    continue
  }

  if (name.startsWith('grammar')) {
    const r = grammarTopicsSchema.safeParse(json)
    if (!r.success) {
      failed = true
      console.error(`✗ ${name}:`)
      for (const issue of r.error.issues.slice(0, 20)) console.error(`   ${issue.path.join('.')}: ${issue.message}`)
      continue
    }
    console.log(`✓ ${name}: 문법 주제 ${r.data.length}개`)
    continue
  }

  const r = entriesSchema.safeParse(json)
  if (!r.success) {
    failed = true
    console.error(`✗ ${name}:`)
    for (const issue of r.error.issues.slice(0, 20)) console.error(`   ${issue.path.join('.')}: ${issue.message}`)
    continue
  }
  const problems: string[] = []
  for (const e of r.data) {
    const expectedPrefix = `${LEVEL_PREFIX[e.level]}-${TYPE_PREFIX[e.type]}-`
    if (!e.id.startsWith(expectedPrefix)) problems.push(`${e.id}: id 접두사가 level/type과 불일치 (기대: ${expectedPrefix}...)`)
    if (seenIds.has(e.id)) problems.push(`${e.id}: 중복 id`)
    seenIds.add(e.id)
    const hw = e.headword.toLowerCase()
    const key = `${e.level}:${hw}`
    if (seenHeadwords.has(key)) problems.push(`${e.id}: 같은 레벨에 중복 headword "${e.headword}"`)
    seenHeadwords.set(key, e.id)
    // 예문에 표제어(또는 변화형)가 들어 있는지 확인. 첫 단어의 어간 + forms 로 느슨하게 검사한다.
    const first = hw.split(' ')[0]
    const stems = [first.slice(0, Math.max(3, first.length - 2)), ...(e.forms ?? []).map((f) => f.toLowerCase())]
    for (const [si, s] of e.senses.entries()) {
      for (const [xi, x] of s.examples.entries()) {
        const en = x.en.toLowerCase()
        if (!stems.some((st) => en.includes(st))) problems.push(`${e.id} senses[${si}].examples[${xi}]: 예문에 표제어(${e.headword})가 보이지 않음 — "${x.en}"`)
      }
    }
  }
  if (problems.length) {
    failed = true
    console.error(`✗ ${name}: ${problems.length}개 문제`)
    for (const p of problems.slice(0, 30)) console.error(`   ${p}`)
  } else {
    const senses = r.data.reduce((n, e) => n + e.senses.length, 0)
    console.log(`✓ ${name}: 표제어 ${r.data.length}개, 의미 ${senses}개`)
  }
}

// 전체 검증 통과 시 manifest.json 갱신 (홈 화면이 레벨 파일을 모두 내려받지 않고 개수를 알 수 있도록)
if (!failed && process.argv.slice(2).length === 0) {
  const { writeFileSync } = await import('node:fs')
  const manifest: { generatedAt: string; levels: Record<string, { total: number; byType: Record<string, number> }>; grammar: number } = {
    generatedAt: new Date().toISOString(),
    levels: {},
    grammar: 0,
  }
  for (const lv of ['beginner', 'intermediate', 'advanced', 'business']) {
    const byType: Record<string, number> = {}
    let total = 0
    try {
      const list = entriesSchema.parse(JSON.parse(readFileSync(join(dir, `${lv}.json`), 'utf8')))
      total = list.length
      for (const e of list) byType[e.type] = (byType[e.type] ?? 0) + 1
    } catch {
      /* 파일 없음 */
    }
    manifest.levels[lv] = { total, byType }
  }
  try {
    manifest.grammar = grammarTopicsSchema.parse(JSON.parse(readFileSync(join(dir, 'grammar.json'), 'utf8'))).length
  } catch {
    /* 파일 없음 */
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`→ manifest.json 갱신 (${Object.values(manifest.levels).reduce((n, l) => n + l.total, 0)}개 표제어, 문법 ${manifest.grammar}개)`)
}

process.exit(failed ? 1 : 0)
