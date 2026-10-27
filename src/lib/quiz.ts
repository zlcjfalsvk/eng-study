import type { Entry, Example, Progress, Sense } from '../data/types'
import type { IndexItem } from './content'
import { todayKey } from './srs'

export type Kind = 'meaning' | 'word' | 'blank'
export type QuizScope = 'studied' | 'all' | 'today' | 'session'
export interface Question {
  kind: Kind
  entry: Entry
  senseIdx: number
  prompt: string
  promptSub?: string
  speakText?: string
  options: string[]
  answer: string
  example: Example
}

type Form = 'base' | 'past' | 'participle' | 'ing' | 'third' | 'plural' | 'other'
const irregular: Record<string, [string, string, string?, string?]> = {
  be: ['was', 'been', 'being', 'is'], have: ['had', 'had', 'having', 'has'], do: ['did', 'done', 'doing', 'does'],
  go: ['went', 'gone'], get: ['got', 'gotten', 'getting'], make: ['made', 'made'], take: ['took', 'taken'],
  come: ['came', 'come'], give: ['gave', 'given'], see: ['saw', 'seen'], know: ['knew', 'known'],
  think: ['thought', 'thought'], say: ['said', 'said'], tell: ['told', 'told'], find: ['found', 'found'],
  buy: ['bought', 'bought'], bring: ['brought', 'brought'], catch: ['caught', 'caught'], teach: ['taught', 'taught'],
  leave: ['left', 'left'], keep: ['kept', 'kept'], feel: ['felt', 'felt'], meet: ['met', 'met'],
  send: ['sent', 'sent'], spend: ['spent', 'spent'], build: ['built', 'built'], mean: ['meant', 'meant'],
  run: ['ran', 'run', 'running'], sit: ['sat', 'sat', 'sitting'], stand: ['stood', 'stood'],
  write: ['wrote', 'written'], read: ['read', 'read'], speak: ['spoke', 'spoken'], eat: ['ate', 'eaten'],
  drink: ['drank', 'drunk'], drive: ['drove', 'driven'], ride: ['rode', 'ridden'], rise: ['rose', 'risen'],
  fall: ['fell', 'fallen'], break: ['broke', 'broken'], choose: ['chose', 'chosen'], begin: ['began', 'begun', 'beginning'],
  hold: ['held', 'held'], lose: ['lost', 'lost'], win: ['won', 'won', 'winning'], pay: ['paid', 'paid'],
  put: ['put', 'put', 'putting'], set: ['set', 'set', 'setting'], cut: ['cut', 'cut', 'cutting'],
  hit: ['hit', 'hit', 'hitting'], let: ['let', 'let', 'letting'], lead: ['led', 'led'], sell: ['sold', 'sold'],
  wear: ['wore', 'worn'], forget: ['forgot', 'forgotten', 'forgetting'], understand: ['understood', 'understood'],
}
const plurals: Record<string, string> = { child: 'children', person: 'people', man: 'men', woman: 'women', foot: 'feet', tooth: 'teeth', mouse: 'mice', goose: 'geese' }
const doubleFinal = new Set(['stop', 'plan', 'drop', 'shop', 'grab', 'rub', 'nod', 'slip', 'step', 'chat', 'clap', 'drag', 'wrap', 'tap', 'fit', 'commit', 'admit', 'refer', 'occur', 'prefer', 'permit', 'regret'])
const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").trim()
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const posFamily = (pos: string) => pos.includes('phr.') || /^v\./.test(pos) ? 'v' : pos.startsWith('adj') ? 'adj' : pos.startsWith('adv') ? 'adv' : pos.startsWith('n.') ? 'n' : pos

function inflect(phrase: string, form: Form): string | null {
  const [root, ...tail] = phrase.split(' ')
  const base = root.toLowerCase()
  let word: string
  const plural = () => /[^aeiou]y$/.test(base) ? base.slice(0, -1) + 'ies' : /(s|x|z|ch|sh|o)$/.test(base) ? base + 'es' : base + 's'
  const past = () => /e$/.test(base) ? base + 'd' : /c$/.test(base) ? base + 'ked' : /[^aeiou]y$/.test(base) ? base.slice(0, -1) + 'ied' : doubleFinal.has(base) ? base + base.at(-1) + 'ed' : base + 'ed'
  if (form === 'base') return phrase
  if (form === 'other') return null
  if (form === 'plural') word = plurals[base] ?? plural()
  else if (form === 'third') word = irregular[base]?.[3] ?? plural()
  else if (form === 'past') word = irregular[base]?.[0] ?? past()
  else if (form === 'participle') word = irregular[base]?.[1] ?? past()
  else word = irregular[base]?.[2] ?? (/ie$/.test(base) ? base.slice(0, -2) + 'ying' : /c$/.test(base) ? base + 'king' : /[^e]e$/.test(base) ? base.slice(0, -1) + 'ing' : doubleFinal.has(base) ? base + base.at(-1) + 'ing' : base + 'ing')
  return [word, ...tail].join(' ')
}

/** Exact whole-word/whole-phrase matching only. Unsupported forms safely fall back. */
export function blankOut(sentence: string, entry: Entry, sense: Sense): { prompt: string; answer: string; form: Form } | null {
  const variants: { text: string; form: Form }[] = [{ text: entry.headword, form: 'base' }]
  const family = posFamily(sense.pos)
  const forms: Form[] = family === 'v' ? ['past', 'participle', 'ing', 'third'] : family === 'n' && !entry.headword.includes(' ') ? ['plural'] : []
  for (const form of forms) {
    const text = inflect(entry.headword, form)
    if (text) variants.push({ text, form })
  }
  // Explicit unrecognized forms are not guessed; a meaning question is safer.
  for (const text of entry.forms ?? []) {
    if (!variants.some((v) => norm(v.text) === norm(text))) variants.push({ text, form: 'other' })
  }
  const sorted = variants.sort((a, b) => b.text.length - a.text.length)
  for (const { text, form } of sorted) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escape(text)}(?![\\p{L}\\p{N}_])`, 'iu')
    const match = re.exec(sentence)
    if (!match) continue
    // A phrasal verb's forms may contain only its first verb (e.g. took).
    if (form === 'other' || (entry.type === 'phrasal' && !text.includes(' '))) return null
    return { prompt: sentence.slice(0, match.index) + '_____' + sentence.slice(match.index + match[0].length), answer: match[0], form }
  }
  return null
}

function aliases(meaning: string): string[] {
  return meaning.replace(/\([^)]*\)/g, '').split(/[,，;/·]/).map((s) => norm(s).replace(/[^\p{L}\p{N}]/gu, '')).filter((s) => s.length >= 2)
}
function overlaps(a: string[], b: string[]): boolean {
  return a.some((x) => b.some((y) => x === y || Math.min(x.length, y.length) >= 3 && (x.includes(y) || y.includes(x))))
}
function shuffled<T>(items: T[], random: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]] }
  return out
}

export function quizPool(items: IndexItem[], progress: Record<string, Progress>, scope: QuizScope, level: string, lastStudyIds: string[], now = Date.now()): IndexItem[] {
  const day = todayKey(new Date(now))
  const last = new Set(lastStudyIds)
  return items.filter((e) => {
    const p = progress[e.id]
    if (scope === 'session') return last.has(e.id)
    if (scope === 'today') return !!p?.lastReviewed && p.lastReviewed <= now && todayKey(new Date(p.lastReviewed)) === day
    return e.l === level && (scope === 'all' || !!p && p.status !== 'new')
  })
}

export function buildQuestions(entries: Entry[], all: IndexItem[], kinds: Kind[], random = Math.random): Question[] {
  if (!kinds.length) return []
  const questions: Question[] = []
  const prepared = all.map((e) => ({
    e, headword: norm(e.h), keywords: new Set(e.k.split('|').map(norm)),
    meanings: [e.m, ...e.k.split('|').filter((k) => /[가-힣]/.test(k))].flatMap(aliases),
  }))
  for (const entry of entries) {
    const senseIdx = Math.floor(random() * entry.senses.length)
    const sense = entry.senses[senseIdx]
    const family = posFamily(sense.pos)
    const excluded = new Set([entry.headword, ...(entry.forms ?? []), ...entry.senses.flatMap((s) => s.synonyms ?? [])].map(norm))
    const meanings = entry.senses.flatMap((s) => aliases(s.meaningKo))
    const candidates = shuffled(prepared.filter((c) => c.e.id !== entry.id && !excluded.has(c.headword)
      && !c.keywords.has(norm(entry.headword)) && !overlaps(meanings, c.meanings)).map((c) => c.e), random)
      .sort((a, b) => Number(b.l === entry.level) - Number(a.l === entry.level) || Number(b.t === entry.type) - Number(a.t === entry.type))
    const unique = (answer: string, values: string[]) => {
      const seen = new Set([norm(answer)])
      return values.filter((v) => { const key = norm(v); if (!key || seen.has(key)) return false; seen.add(key); return true }).slice(0, 3)
    }
    let kind = kinds[Math.floor(random() * kinds.length)]
    let example = sense.examples[0]
    let prompt = entry.headword
    let promptSub = `[${sense.context}] ${sense.pos}`
    let speakText: string | undefined = entry.headword
    let answer = sense.meaningKo
    let distract: string[] = []
    if (kind === 'blank') {
      example = sense.examples[Math.floor(random() * sense.examples.length)]
      const blank = blankOut(example.en, entry, sense)
      if (blank) {
        distract = unique(blank.answer, candidates.filter((e) => e.t === entry.type && e.p?.some((p) => posFamily(p) === family))
          .map((e) => inflect(e.h, blank.form)).filter((s): s is string => !!s))
        if (distract.length === 3) {
          prompt = blank.prompt; answer = blank.answer; promptSub = example.ko; speakText = undefined
        } else kind = 'meaning'
      } else kind = 'meaning'
    }
    if (kind === 'word') {
      prompt = sense.meaningKo; promptSub = `[${sense.context}] ${sense.meaningEn}`; speakText = undefined
      answer = entry.headword; distract = unique(answer, candidates.map((e) => e.h))
    } else if (kind === 'meaning') {
      prompt = entry.headword; promptSub = `[${sense.context}] ${sense.pos}`; speakText = entry.headword
      answer = sense.meaningKo; distract = unique(answer, candidates.map((e) => e.m))
    }
    if (distract.length < 3) continue
    questions.push({ kind, entry, senseIdx, prompt, promptSub, speakText, answer, example, options: shuffled([answer, ...distract], random) })
  }
  return questions
}
