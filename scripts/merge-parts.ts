// 조각 병합: pnpm merge:parts <dir>
// <dir> 안의 <level>-*.jsonl 조각을 검증해 content/<level>.jsonl 에 합치고, 전체 검증 + 데이터 빌드를 돌린다.
// 검증에 실패한 조각은 건너뛰고 이름을 출력한다. 병합된 조각은 <dir>/merged/ 로 옮긴다.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { entrySchema } from '../src/data/schema.ts'
import type { Entry, Level } from '../src/data/types.ts'
import { LEVELS, readLevel, writeLevel } from './lib/content-io.ts'
import { checkEntries } from './validate.ts'

const dir = process.argv[2]
if (!dir) {
  console.error('사용법: pnpm merge:parts <dir>')
  process.exit(1)
}
mkdirSync(join(dir, 'merged'), { recursive: true })
const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()
let mergedTotal = 0
const skipped: string[] = []

for (const lv of LEVELS) {
  const parts = files.filter((f) => f.startsWith(`${lv}-`))
  if (!parts.length) continue
  const existing = readLevel(lv)
  const seenIds = new Set(existing.map((e) => e.id))
  const headwords = new Set(existing.map((e) => e.headword.toLowerCase()))
  const accepted: Entry[] = []
  for (const f of parts) {
    const entries: Entry[] = []
    let bad = false
    for (const raw of readFileSync(join(dir, f), 'utf8').split('\n')) {
      const line = raw.trim()
      if (!line) continue
      try {
        const r = entrySchema.safeParse(JSON.parse(line))
        if (!r.success) throw new Error(r.error.issues[0]?.message)
        entries.push(r.data as Entry)
      } catch (e) {
        console.error(`✗ ${f}: ${(e as Error).message}`)
        bad = true
      }
    }
    const ids = new Set(seenIds)
    const problems = bad ? ['파싱/스키마 오류'] : checkEntries(entries, lv as Level, ids, headwords)
    if (problems.length) {
      for (const p of problems.slice(0, 5)) console.error(`✗ ${f}: ${p}`)
      skipped.push(f)
      continue
    }
    for (const e of entries) {
      seenIds.add(e.id)
      headwords.add(e.headword.toLowerCase())
    }
    accepted.push(...entries)
    renameSync(join(dir, f), join(dir, 'merged', f))
    console.log(`+ ${f}: ${entries.length}개`)
  }
  if (accepted.length) {
    writeLevel(lv, [...existing, ...accepted])
    mergedTotal += accepted.length
    console.log(`→ content/${lv}.jsonl: ${existing.length} → ${existing.length + accepted.length}`)
  }
}

console.log(`\n병합 ${mergedTotal}개${skipped.length ? `, 건너뜀: ${skipped.join(', ')}` : ''}`)
const r = spawnSync('npx', ['tsx', join(import.meta.dirname, 'build-data.ts')], { stdio: 'inherit' })
process.exit(r.status ?? 1)
