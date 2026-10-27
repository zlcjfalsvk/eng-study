// ─── Claude API 로 레벨별 어휘 콘텐츠를 대량 생성하는 스크립트 ─────────────────
//
// 사용법:
//   export ANTHROPIC_API_KEY=...   (또는 `ant auth login`)
//   pnpm generate --level intermediate --count 200
//   pnpm generate --level business --count 50 --types word,phrasal --wordlist scripts/wordlists/business.txt
//
// 옵션:
//   --level        beginner | intermediate | advanced | business   (필수)
//   --count        이번 실행에서 추가할 표제어 수 (기본 50)
//   --batch        요청 1회당 표제어 수 (기본 8; 다의어가 많은 초급은 6 권장)
//   --concurrency  동시 요청 수 (기본 3)
//   --types        생성할 유형 비율. 예: word:70,phrasal:20,idiom:7,collocation:3 (기본값)
//   --wordlist     표제어 목록 파일(한 줄에 하나, `headword[,type]`). 없으면 모델이 후보를 제안
//   --model        기본 claude-opus-5-5
//   --effort       low | medium | high (기본 medium — 창작/번역 작업에 충분)
//   --dry-run      API 를 호출하지 않고 후보/프롬프트만 출력
//
// 결과는 src/data/content/<level>.json 에 배치마다 즉시 append 되므로 중단해도 안전하다.
// 끝나면 자동으로 검증(scripts/validate.ts)을 실행해 manifest.json 을 갱신한다.

import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { entrySchema, LEVEL_PREFIX, TYPE_PREFIX } from '../src/data/schema.ts'
import type { Entry, EntryType, Level } from '../src/data/types.ts'

// ─── 인자 파싱 ───────────────────────────────────────────────────────────────
const args = new Map<string, string>()
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a.startsWith('--')) {
    const next = process.argv[i + 1]
    if (next && !next.startsWith('--')) {
      args.set(a.slice(2), next)
      i++
    } else args.set(a.slice(2), 'true')
  }
}
const level = args.get('level') as Level | undefined
if (!level || !(level in LEVEL_PREFIX)) {
  console.error('--level 은 beginner | intermediate | advanced | business 중 하나여야 합니다.')
  process.exit(1)
}
const count = Number(args.get('count') ?? 50)
const batchSize = Number(args.get('batch') ?? 8)
const concurrency = Number(args.get('concurrency') ?? 3)
const model = args.get('model') ?? 'claude-opus-5-5'
const effort = (args.get('effort') ?? 'medium') as 'low' | 'medium' | 'high'
const dryRun = args.has('dry-run')
const typeMix: Record<EntryType, number> = { word: 70, phrasal: 20, idiom: 7, collocation: 3 }
if (args.get('types')) {
  for (const k of Object.keys(typeMix) as EntryType[]) typeMix[k] = 0
  for (const part of args.get('types')!.split(',')) {
    const [t, w] = part.split(':')
    if (t in typeMix) typeMix[t as EntryType] = Number(w ?? 1)
  }
}

// ─── 레벨 설명 (프롬프트용) ───────────────────────────────────────────────────
const LEVEL_GUIDE: Record<Level, string> = {
  beginner:
    'CEFR A1–A2. 한국 초등 고학년~중1 수준의 핵심 어휘. 일상·가족·학교·음식·시간·날씨·쇼핑. 흔한 기본 동사(get, take, make...)는 상황별 뜻을 2~4개로 나눈다. 예문은 6~12단어의 구어체.',
  intermediate:
    'CEFR B1–B2. 고등~대학 교양 수준. 뉴스·여행·감정·의견 표현·추상어 입문. 상황별 뜻 2~3개. 예문 8~14단어.',
  advanced:
    'CEFR C1–C2. 학술·시사·에세이·문학. 뉘앙스 차이와 격식(register)이 중요. 단순 유의어와 어떻게 다른지 note 에 설명. 예문 8~16단어, 사설/학술/문학 문체.',
  business:
    '직장·회의·이메일·협상·재무·마케팅·프로젝트/IT. 일상 뜻과 비즈니스 뜻이 다르면 반드시 별도 sense 로 분리. 격식/비격식을 register 로 표시하고, 고객 이메일에 부적절한 표현은 note 로 경고. 예문 8~16단어의 실제 업무 문장.',
}

const CONTEXTS = ['일상 대화', '가족/집', '학교/학습', '음식/식당', '쇼핑', '여행/교통', '건강/병원', '감정/관계', '직장/회의', '이메일/문서', '협상/영업', '재무/회계', '마케팅', '프로젝트/IT', '뉴스/시사', '정치/사회', '학술/글쓰기', '문학/묘사', '스포츠/취미', '기술/과학', '법률']

// ─── 구조화 출력 스키마 (JSON Schema 제약 때문에 optional 대신 nullable 사용) ───
const genExample = z.object({ en: z.string(), ko: z.string() })
const genSense = z.object({
  pos: z.string(),
  context: z.string(),
  meaningKo: z.string(),
  meaningEn: z.string(),
  register: z.enum(['neutral', 'formal', 'informal', 'slang', 'technical']).nullable(),
  examples: z.array(genExample),
  synonyms: z.array(z.string()).nullable(),
  antonyms: z.array(z.string()).nullable(),
  note: z.string().nullable(),
})
const genEntry = z.object({
  headword: z.string(),
  type: z.enum(['word', 'phrasal', 'idiom', 'collocation']),
  ipa: z.string().nullable(),
  forms: z.array(z.string()).nullable(),
  senses: z.array(genSense),
  tags: z.array(z.string()).nullable(),
  related: z.array(z.string()).nullable(),
})
const genBatch = z.object({ entries: z.array(genEntry) })
const candidateBatch = z.object({ candidates: z.array(z.object({ headword: z.string(), type: z.enum(['word', 'phrasal', 'idiom', 'collocation']) })) })

// ─── 파일 IO ─────────────────────────────────────────────────────────────────
const contentDir = join(import.meta.dirname, '../src/data/content')
const outFile = join(contentDir, `${level}.json`)
const existing: Entry[] = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : []
const existingHeadwords = new Set(existing.map((e) => e.headword.toLowerCase()))
const existingIds = new Set(existing.map((e) => e.id))

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
function makeId(type: EntryType, headword: string) {
  let base = `${LEVEL_PREFIX[level!]}-${TYPE_PREFIX[type]}-${slugify(headword)}`
  let id = base
  let n = 2
  while (existingIds.has(id)) id = `${base}-${n++}`
  return id
}
function exampleHasHeadword(headword: string, forms: string[] | undefined, en: string) {
  const first = headword.toLowerCase().split(' ')[0]
  const stems = [first.slice(0, Math.max(3, first.length - 2)), ...(forms ?? []).map((f) => f.toLowerCase())]
  const lower = en.toLowerCase()
  return stems.some((s) => lower.includes(s))
}

// ─── 후보 표제어 ──────────────────────────────────────────────────────────────
type Candidate = { headword: string; type: EntryType }

function readWordlist(path: string): Candidate[] {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [hw, t] = l.split(',').map((s) => s.trim())
      const type = (['word', 'phrasal', 'idiom', 'collocation'].includes(t) ? t : hw.includes(' ') ? 'phrasal' : 'word') as EntryType
      return { headword: hw, type }
    })
}

const client = new Anthropic()
const usage = { input: 0, output: 0, cacheRead: 0, requests: 0 }

async function proposeCandidates(need: number, exclude: string[]): Promise<Candidate[]> {
  const total = Object.values(typeMix).reduce((a, b) => a + b, 0) || 1
  const want = Object.fromEntries((Object.keys(typeMix) as EntryType[]).map((t) => [t, Math.round((need * typeMix[t]) / total)]))
  const prompt = `당신은 한국인 영어 학습자용 어휘 교재를 설계하는 전문가입니다.
레벨: ${level} — ${LEVEL_GUIDE[level!]}

이 레벨에서 가장 먼저 익혀야 할 고빈도·고가치 표제어 후보를 제안하세요. 유형별 개수:
${(Object.entries(want) as [EntryType, number][]).filter(([, n]) => n > 0).map(([t, n]) => `- ${t}: ${n}개`).join('\n')}

규칙:
- word: 단일 단어(기본형). phrasal: 구동사(예: put off). idiom: 관용구. collocation: 연어(예: meet a deadline).
- 상황에 따라 뜻이 갈리는 다의어를 우선한다.
- 아래 "이미 있는 표제어"와 중복되지 않게 한다 (대소문자 무시).
- 흔한 고유명사·욕설·너무 전문적인 용어는 제외.

이미 있는 표제어 (${exclude.length}개):
${exclude.join(', ') || '(없음)'}`
  if (dryRun) {
    console.log('--- [dry-run] 후보 제안 프롬프트 ---\n' + prompt.slice(0, 1500) + '\n...')
    return []
  }
  const stream = client.messages.stream({
    model,
    max_tokens: 16000,
    output_config: { effort, format: zodOutputFormat(candidateBatch) },
    messages: [{ role: 'user', content: prompt }],
  })
  const msg = await stream.finalMessage()
  track(msg)
  if (msg.stop_reason === 'refusal') throw new Error('후보 제안 요청이 거부되었습니다.')
  const text = msg.content.find((b) => b.type === 'text')?.text ?? '{}'
  const parsed = candidateBatch.safeParse(JSON.parse(text))
  if (!parsed.success) throw new Error('후보 응답 파싱 실패: ' + parsed.error.message)
  const seen = new Set(exclude.map((s) => s.toLowerCase()))
  const out: Candidate[] = []
  for (const c of parsed.data.candidates) {
    const k = c.headword.trim().toLowerCase()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push({ headword: c.headword.trim(), type: c.type })
  }
  return out
}

// ─── 엔트리 생성 ──────────────────────────────────────────────────────────────
const SYSTEM = `당신은 한국인 성인 영어 학습자를 위한 사전·교재 집필자입니다. 요청된 표제어 각각에 대해 "상황에 따라 달라지는 뜻"을 분리한 사전 항목을 JSON 으로 작성합니다.

작성 규칙:
1. 다의어는 senses 를 반드시 분리한다. 각 sense 는 하나의 상황(context)과 하나의 뜻만 담는다.
2. context 는 다음 중 하나의 한국어 라벨: ${CONTEXTS.join(', ')}
3. pos: n. / v. / adj. / adv. / prep. / conj. / phr. v. / idiom / colloc. 등 약어.
4. meaningKo: 사전식으로 간결하게 (예: "운영하다, 경영하다"). meaningEn: 영영사전식 한 문장.
5. examples: sense 당 2개(고급·비즈니스는 2~3개). 반드시 표제어(또는 변화형)가 문장에 들어가야 한다. 실제 말하듯 자연스러운 문장. ko 는 직역이 아닌 자연스러운 한국어 번역.
6. note: 뉘앙스·콜로케이션·한국인이 자주 하는 실수. 없으면 null.
7. ipa: 미국식, 슬래시 포함(/rʌn/). 구동사·관용구는 null. forms: 불규칙 변화형만, 없으면 null.
8. register: 격식 차이가 중요할 때만 표시(neutral 은 null 로). tags: 영문 소문자 주제 태그 1~3개.
9. related: 함께 익히면 좋은 표현 0~4개(표제어 문자열). 혼동하기 쉬운 단어(affect/effect), 짝 표현(borrow/lend), 자주 같이 쓰는 구동사 등. 없으면 null.
10. 표제어 철자·유형은 요청된 그대로 사용한다. 요청에 없는 표제어를 추가하지 않는다.`

async function generateBatch(cands: Candidate[]): Promise<Entry[]> {
  const prompt = `레벨: ${level} — ${LEVEL_GUIDE[level!]}

다음 ${cands.length}개 표제어의 사전 항목을 작성하세요:
${cands.map((c, i) => `${i + 1}. ${c.headword} (${c.type})`).join('\n')}`
  const stream = client.messages.stream({
    model,
    max_tokens: 32000,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { effort, format: zodOutputFormat(genBatch) },
    messages: [{ role: 'user', content: prompt }],
  })
  const msg = await stream.finalMessage()
  track(msg)
  if (msg.stop_reason === 'refusal') {
    console.warn(`  ! 거부됨 (${msg.stop_details?.category ?? '?'}): ${cands.map((c) => c.headword).join(', ')}`)
    return []
  }
  if (msg.stop_reason === 'max_tokens') console.warn('  ! max_tokens 도달 — 배치가 잘렸을 수 있습니다. --batch 를 줄이세요.')
  const text = msg.content.find((b) => b.type === 'text')?.text ?? '{}'
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    console.warn('  ! JSON 파싱 실패, 배치 건너뜀')
    return []
  }
  const parsed = genBatch.safeParse(raw)
  if (!parsed.success) {
    console.warn('  ! 스키마 불일치, 배치 건너뜀: ' + parsed.error.issues[0]?.message)
    return []
  }
  const out: Entry[] = []
  for (const g of parsed.data.entries) {
    const hw = g.headword.trim()
    if (existingHeadwords.has(hw.toLowerCase())) continue
    const forms = g.forms?.filter(Boolean) ?? undefined
    const senses = g.senses
      .map((s) => ({
        pos: s.pos,
        context: s.context,
        meaningKo: s.meaningKo,
        meaningEn: s.meaningEn,
        ...(s.register && s.register !== 'neutral' ? { register: s.register } : {}),
        examples: s.examples.filter((x) => exampleHasHeadword(hw, forms, x.en)),
        ...(s.synonyms?.length ? { synonyms: s.synonyms } : {}),
        ...(s.antonyms?.length ? { antonyms: s.antonyms } : {}),
        ...(s.note ? { note: s.note } : {}),
      }))
      .filter((s) => s.examples.length > 0)
    if (!senses.length) {
      console.warn(`  ! ${hw}: 유효한 예문이 없어 제외`)
      continue
    }
    const entry: Entry = {
      id: makeId(g.type, hw),
      headword: hw,
      type: g.type,
      level: level!,
      ...(g.ipa ? { ipa: g.ipa } : {}),
      ...(forms?.length ? { forms } : {}),
      senses,
      ...(g.tags?.length ? { tags: g.tags.map((t) => t.toLowerCase()) } : {}),
      ...(g.related?.length ? { related: g.related.map((r) => r.trim()).filter(Boolean) } : {}),
    }
    const v = entrySchema.safeParse(entry)
    if (!v.success) {
      console.warn(`  ! ${hw}: 검증 실패 — ${v.error.issues[0]?.path.join('.')}: ${v.error.issues[0]?.message}`)
      continue
    }
    existingHeadwords.add(hw.toLowerCase())
    existingIds.add(entry.id)
    out.push(v.data as Entry)
  }
  return out
}

function track(msg: Anthropic.Message) {
  usage.requests++
  usage.input += msg.usage.input_tokens
  usage.output += msg.usage.output_tokens
  usage.cacheRead += msg.usage.cache_read_input_tokens ?? 0
}

function save() {
  existing.sort((a, b) => a.headword.localeCompare(b.headword))
  writeFileSync(outFile, JSON.stringify(existing, null, 2) + '\n')
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`레벨 ${level}: 현재 ${existing.length}개 → +${count}개 목표 (model=${model}, effort=${effort}, batch=${batchSize}, concurrency=${concurrency})`)

  let candidates: Candidate[] = []
  const wordlist = args.get('wordlist')
  if (wordlist) {
    candidates = readWordlist(wordlist).filter((c) => !existingHeadwords.has(c.headword.toLowerCase()))
    console.log(`워드리스트에서 ${candidates.length}개 후보 (기존 제외)`)
  } else {
    // 후보는 100개 단위로 제안받는다 (여유분 20%)
    const need = Math.ceil(count * 1.2)
    while (candidates.length < need) {
      const got = await proposeCandidates(Math.min(100, need - candidates.length), [...existingHeadwords, ...candidates.map((c) => c.headword)])
      if (!got.length) break
      candidates.push(...got)
      console.log(`후보 ${candidates.length}/${need}`)
    }
  }
  candidates = candidates.slice(0, count)
  if (dryRun) {
    console.log('--- [dry-run] 후보 ---')
    console.log(candidates.map((c) => `${c.headword} (${c.type})`).join('\n'))
    return
  }
  if (!candidates.length) {
    console.log('생성할 후보가 없습니다.')
    return
  }

  const batches: Candidate[][] = []
  for (let i = 0; i < candidates.length; i += batchSize) batches.push(candidates.slice(i, i + batchSize))
  let done = 0
  let added = 0
  let cursor = 0
  const worker = async () => {
    while (cursor < batches.length) {
      const b = batches[cursor++]
      const label = b.map((c) => c.headword).join(', ')
      try {
        const entries = await generateBatch(b)
        existing.push(...entries)
        added += entries.length
        save()
        done++
        console.log(`[${done}/${batches.length}] +${entries.length}  ${label}`)
      } catch (e) {
        done++
        if (e instanceof Anthropic.RateLimitError) {
          console.warn(`  ! 429 rate limit — 20초 후 재시도: ${label}`)
          await new Promise((r) => setTimeout(r, 20000))
          batches.push(b)
        } else if (e instanceof Anthropic.APIError) console.warn(`  ! API 오류 ${e.status}: ${e.message}`)
        else console.warn(`  ! 오류: ${(e as Error).message}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker))

  console.log(`\n완료: ${added}개 추가 → ${existing.length}개 (${outFile})`)
  console.log(`토큰: 입력 ${usage.input.toLocaleString()} (캐시 ${usage.cacheRead.toLocaleString()}) / 출력 ${usage.output.toLocaleString()} / 요청 ${usage.requests}회`)
  const r = spawnSync('npx', ['tsx', join(import.meta.dirname, 'validate.ts')], { stdio: 'inherit' })
  if (r.status !== 0) console.warn('검증에서 문제가 발견되었습니다. 위 메시지를 확인하세요.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
