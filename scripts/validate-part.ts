// 부분 파일 검증: pnpm validate:part <file.jsonl> --level <level>
// 에이전트가 쓴 JSONL 조각을 본 콘텐츠에 합치기 전에 검사한다 (스키마·규칙·기존 콘텐츠와의 중복).
import { readFileSync } from 'node:fs'
import { entrySchema } from '../src/data/schema.ts'
import type { Entry, Level } from '../src/data/types.ts'
import { LEVELS, readLevel } from './lib/content-io.ts'
import { checkEntries } from './validate.ts'

const file = process.argv[2]
const li = process.argv.indexOf('--level')
const level = (li > 0 ? process.argv[li + 1] : '') as Level
if (!file || !LEVELS.includes(level)) {
  console.error('사용법: pnpm validate:part <file.jsonl> --level <beginner|intermediate|advanced|business>')
  process.exit(1)
}

const lines = readFileSync(file, 'utf8').split('\n')
const entries: Entry[] = []
let failed = false
lines.forEach((raw, i) => {
  const line = raw.trim()
  if (!line) return
  let obj: unknown
  try {
    obj = JSON.parse(line)
  } catch (e) {
    failed = true
    console.error(`✗ ${i + 1}행: JSON 파싱 실패 — ${(e as Error).message}`)
    return
  }
  const r = entrySchema.safeParse(obj)
  if (!r.success) {
    failed = true
    const hw = (obj as { headword?: string })?.headword ?? '?'
    console.error(`✗ ${i + 1}행 (${hw}): ${r.error.issues.slice(0, 3).map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}`)
    return
  }
  entries.push(r.data as Entry)
})

const existing = readLevel(level)
const seenIds = new Set(existing.map((e) => e.id))
const existingHeadwords = new Set(existing.map((e) => e.headword.toLowerCase()))
const problems = checkEntries(entries, level, seenIds, existingHeadwords)
for (const p of problems) console.error(`✗ ${p}`)
if (problems.length) failed = true

const senses = entries.reduce((n, e) => n + e.senses.length, 0)
if (failed) {
  console.error(`검증 실패 — ${file}`)
  process.exit(1)
}
console.log(`✓ ${file}: 표제어 ${entries.length}개, 의미 ${senses}개 (기존 ${existing.length}개와 중복 없음)`)
