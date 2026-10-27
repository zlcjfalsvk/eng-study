// 워드리스트 도구
//   pnpm wordlist check                 — 레벨별 목록 통계, 레벨 간 중복, 기존 콘텐츠와의 중복 보고
//   pnpm wordlist dedupe                — 레벨 간 중복을 낮은 레벨에 남기고 높은 레벨에서 제거(파일 수정). business 는 유지
//   pnpm wordlist batches <level> <n> <size> <outdir> — 아직 콘텐츠가 없는 표제어를 size 개씩 n 개 배치 파일로 출력
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EntryType, Level } from '../src/data/types.ts'
import { LEVELS, ROOT, readLevel } from './lib/content-io.ts'

type Item = { headword: string; type: EntryType; line: string }
const dir = join(ROOT, 'scripts/wordlists')

function read(level: Level): { items: Item[]; raw: string[] } {
  let raw: string[] = []
  try {
    raw = readFileSync(join(dir, `${level}.txt`), 'utf8').split('\n')
  } catch {
    return { items: [], raw: [] }
  }
  const items: Item[] = []
  for (const line of raw) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const [h, ty] = t.split(',').map((x) => x.trim())
    items.push({ headword: h, type: (ty as EntryType) || 'word', line })
  }
  return { items, raw }
}

const cmd = process.argv[2]
if (cmd === 'check' || cmd === 'dedupe') {
  const lists = Object.fromEntries(LEVELS.map((l) => [l, read(l)])) as Record<Level, ReturnType<typeof read>>
  const general: Level[] = ['beginner', 'intermediate', 'advanced']
  const owner = new Map<string, Level>() // 일반 레벨에서 처음 나온 레벨
  const removals: Record<Level, Set<string>> = { beginner: new Set(), intermediate: new Set(), advanced: new Set(), business: new Set() }
  for (const lv of general) {
    for (const it of lists[lv].items) {
      const k = it.headword.toLowerCase()
      if (owner.has(k)) removals[lv].add(k)
      else owner.set(k, lv)
    }
  }
  for (const lv of LEVELS) {
    const items = lists[lv].items
    const existing = new Set(readLevel(lv).map((e) => e.headword.toLowerCase()))
    const types: Record<string, number> = {}
    for (const it of items) types[it.type] = (types[it.type] ?? 0) + 1
    const dupExisting = items.filter((it) => existing.has(it.headword.toLowerCase())).length
    console.log(`${lv}: ${items.length}개 ${JSON.stringify(types)} · 기존 콘텐츠와 중복 ${dupExisting} · 낮은 레벨과 중복 ${removals[lv].size}`)
    if (removals[lv].size) console.log(`   예: ${[...removals[lv]].slice(0, 15).join(', ')}`)
  }
  if (cmd === 'dedupe') {
    for (const lv of general) {
      if (!removals[lv].size) continue
      const out = lists[lv].raw.filter((line) => {
        const t = line.trim()
        if (!t || t.startsWith('#')) return true
        return !removals[lv].has(t.split(',')[0].trim().toLowerCase())
      })
      writeFileSync(join(dir, `${lv}.txt`), out.join('\n'))
      console.log(`→ ${lv}.txt 에서 ${removals[lv].size}개 제거`)
    }
  }
} else if (cmd === 'batches') {
  const level = process.argv[3] as Level
  const n = Number(process.argv[4] ?? 10)
  const size = Number(process.argv[5] ?? 40)
  const outdir = process.argv[6]
  if (!LEVELS.includes(level) || !outdir) {
    console.error('사용법: pnpm wordlist batches <level> <n> <size> <outdir>')
    process.exit(1)
  }
  const existing = new Set(readLevel(level).map((e) => e.headword.toLowerCase()))
  const seen = new Set<string>()
  const todo = read(level).items.filter((it) => {
    const k = it.headword.toLowerCase()
    if (existing.has(k) || seen.has(k)) return false
    seen.add(k)
    return true
  })
  mkdirSync(outdir, { recursive: true })
  let written = 0
  for (let b = 0; b < n; b++) {
    const chunk = todo.slice(b * size, (b + 1) * size)
    if (!chunk.length) break
    writeFileSync(join(outdir, `${level}-${String(b + 1).padStart(2, '0')}.txt`), chunk.map((it) => `${it.headword},${it.type}`).join('\n') + '\n')
    written += chunk.length
  }
  console.log(`${level}: 남은 표제어 ${todo.length}개 중 ${written}개를 ${Math.ceil(written / size)}개 배치로 출력 → ${outdir}`)
} else {
  console.error('사용법: pnpm wordlist check | dedupe | batches <level> <n> <size> <outdir>')
  process.exit(1)
}
