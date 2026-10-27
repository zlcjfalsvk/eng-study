// 콘텐츠 검증: pnpm validate
// content/<level>.jsonl 과 content/grammar.json 을 스키마·규칙으로 검사한다. 출력 파일은 만들지 않는다 (→ scripts/build-data.ts).
import { entriesSchema, grammarTopicsSchema, LEVEL_PREFIX, TYPE_PREFIX } from '../src/data/schema.ts'
import type { Entry, GrammarTopic, Level } from '../src/data/types.ts'
import { LEVELS, readGrammar, readLevelRaw } from './lib/content-io.ts'

export interface ValidationResult {
  ok: boolean
  levels: Record<Level, Entry[]>
  grammar: GrammarTopic[]
  messages: string[]
}

export function validateAll(): ValidationResult {
  const messages: string[] = []
  let ok = true
  const levels = {} as Record<Level, Entry[]>
  const seenIds = new Set<string>()

  for (const lv of LEVELS) {
    const { entries, errors } = readLevelRaw(lv)
    for (const e of errors) {
      ok = false
      messages.push(`✗ ${lv}.jsonl:${e.line} JSON 파싱 실패 — ${e.error}`)
    }
    const r = entriesSchema.safeParse(entries)
    if (!r.success) {
      ok = false
      messages.push(`✗ ${lv}.jsonl: 스키마 오류`)
      for (const issue of r.error.issues.slice(0, 20)) {
        const idx = Number(issue.path[0])
        const hw = (entries[idx] as { headword?: string } | undefined)?.headword ?? '?'
        messages.push(`   [${idx}] ${hw} · ${issue.path.slice(1).join('.')}: ${issue.message}`)
      }
      levels[lv] = []
      continue
    }
    const list = r.data as Entry[]
    const problems: string[] = []
    const seenHeadwords = new Set<string>()
    for (const e of list) {
      const expectedPrefix = `${LEVEL_PREFIX[e.level]}-${TYPE_PREFIX[e.type]}-`
      if (e.level !== lv) problems.push(`${e.id}: level 이 "${e.level}" 인데 ${lv}.jsonl 에 있음`)
      if (!e.id.startsWith(expectedPrefix)) problems.push(`${e.id}: id 접두사가 level/type과 불일치 (기대: ${expectedPrefix}...)`)
      if (seenIds.has(e.id)) problems.push(`${e.id}: 중복 id`)
      seenIds.add(e.id)
      const hw = e.headword.toLowerCase()
      if (seenHeadwords.has(hw)) problems.push(`${e.id}: 같은 레벨에 중복 headword "${e.headword}"`)
      seenHeadwords.add(hw)
      // 예문에 표제어(또는 변화형)가 들어 있는지 — 첫 단어의 어간 + forms 로 느슨하게 검사
      const first = hw.split(' ')[0]
      const stems = [first.slice(0, Math.max(3, first.length - 2)), ...(e.forms ?? []).map((f) => f.toLowerCase())]
      e.senses.forEach((s, si) => {
        s.examples.forEach((x, xi) => {
          const en = x.en.toLowerCase()
          if (!stems.some((st) => en.includes(st))) problems.push(`${e.id} senses[${si}].examples[${xi}]: 예문에 표제어(${e.headword})가 보이지 않음 — "${x.en}"`)
        })
      })
    }
    if (problems.length) {
      ok = false
      messages.push(`✗ ${lv}.jsonl: ${problems.length}개 문제`)
      for (const p of problems.slice(0, 30)) messages.push(`   ${p}`)
    } else {
      const senses = list.reduce((n, e) => n + e.senses.length, 0)
      messages.push(`✓ ${lv}.jsonl: 표제어 ${list.length}개, 의미 ${senses}개`)
    }
    levels[lv] = list
  }

  let grammar: GrammarTopic[] = []
  try {
    const g = grammarTopicsSchema.safeParse(readGrammar())
    if (!g.success) {
      ok = false
      messages.push('✗ grammar.json:')
      for (const issue of g.error.issues.slice(0, 20)) messages.push(`   ${issue.path.join('.')}: ${issue.message}`)
    } else {
      grammar = g.data as GrammarTopic[]
      messages.push(`✓ grammar.json: 문법 주제 ${grammar.length}개`)
    }
  } catch (e) {
    ok = false
    messages.push(`✗ grammar.json: ${(e as Error).message}`)
  }

  return { ok, levels, grammar, messages }
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const r = validateAll()
  for (const m of r.messages) (m.startsWith('✗') || m.startsWith('   ') ? console.error : console.log)(m)
  process.exit(r.ok ? 1 - 1 : 1)
}
