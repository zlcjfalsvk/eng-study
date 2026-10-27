import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Entry, Level, Progress } from '../src/data/types.ts'
import type { IndexItem } from '../src/lib/content.ts'
import { selectStudyCards } from '../src/lib/learning-order.ts'
import { blankOut, buildQuestions, quizPool } from '../src/lib/quiz.ts'
import { newProgress, todayKey } from '../src/lib/srs.ts'
import { advanceSession, studySessionSchema, type StudySession } from '../src/lib/study-session.ts'
import { matchesTopic } from '../src/lib/topics.ts'
import { useStore } from '../src/store/progress.ts'

function entry(h: string, meaning = `${h}의 뜻`, pos = 'v.', level: Level = 'beginner'): Entry {
  return { id: `${level[0]}-w-${h.replaceAll(' ', '-')}`, headword: h, type: 'word', level,
    senses: [{ pos, context: '일상 대화', meaningKo: meaning, meaningEn: `A definition of ${h}.`, examples: [{ en: `They ${h} every day.`, ko: '예문 번역' }] }] }
}
function index(e: Entry): IndexItem {
  return { id: e.id, h: e.headword, l: e.level, t: e.type, m: e.senses[0].meaningKo, n: e.senses.length,
    c: e.senses.map((s) => s.context), g: e.tags ?? [], k: e.senses.map((s) => s.meaningKo).join('|'), s: 0, r: 1, p: e.senses.map((s) => s.pos) }
}
const go = entry('go', '가다')
go.forms = ['went', 'gone', 'goes', 'going']
go.senses[0].examples = [{ en: 'They went to school yesterday.', ko: '그들은 어제 학교에 갔다.' }]
const others = [entry('walk', '걷다'), entry('run', '달리다'), entry('drive', '운전하다'), entry('eat', '먹다'), entry('send', '보내다')]
function session(ids = ['b-w-go', 'b-w-run']): StudySession {
  return { token: 'test', scope: 'all', topic: 'all', kind: 'due', startedAt: 1, initialIds: ids, remaining: ids, reviewedIds: [], attempts: {}, again: 0, good: 0 }
}

test('mixed-level review sorts by due date, obeys 10/20 limits, and never inserts new cards into review-only', () => {
  const pool = Array.from({ length: 25 }, (_, i) => index(entry(`word${i}`, `뜻${i}`, 'n.', i % 2 ? 'business' : 'beginner')))
  const progress = Object.fromEntries(pool.map((e, i) => [e.id, { ...newProgress(), status: 'review', due: i + 1 }])) as Record<string, Progress>
  const fresh = index(entry('fresh'))
  assert.equal(selectStudyCards([...pool, fresh], progress, 'due', 15, 100, 10).length, 10)
  assert.equal(selectStudyCards(pool, progress, 'due', 15, 100, 20).length, 20)
  assert.deepEqual(selectStudyCards(pool, progress, 'due', 15, 100, 10).map((e) => e.id), pool.slice(0, 10).map((e) => e.id))
  assert.equal(selectStudyCards([...pool, fresh], progress, 'mixed', 15, 100, 20).some((e) => e.id === fresh.id), false)
})

test('difficult sessions terminate after at most one extra attempt per card and round-trip through JSON', () => {
  let current = session()
  let steps = 0
  while (current.remaining.length) { current = advanceSession(current, 'again'); steps++; assert.ok(steps <= 4) }
  assert.equal(steps, 4)
  assert.deepEqual(current.reviewedIds, ['b-w-go', 'b-w-run'])
  assert.deepEqual(studySessionSchema.parse(JSON.parse(JSON.stringify(current))), current)
  assert.equal(studySessionSchema.safeParse({ ...current, remaining: ['b-w-unknown'] }).success, false)
})

test('blank answers preserve actual irregular/regular/plural forms and never use approximate stems', () => {
  assert.deepEqual(blankOut(go.senses[0].examples[0].en, go, go.senses[0]), { prompt: 'They _____ to school yesterday.', answer: 'went', form: 'past' })
  const run = others[1]
  assert.equal(blankOut('A rural road leads home.', run, run.senses[0]), null)
  assert.equal(blankOut('The runner waved.', run, run.senses[0]), null)
  const look = entry('look for'); look.type = 'phrasal'
  assert.equal(blankOut('I am looking for my keys.', look, look.senses[0])?.answer, 'looking for')
  const turn = entry('turn off'); turn.type = 'phrasal'
  assert.equal(blankOut('She turned the light off.', turn, turn.senses[0]), null)
  const child = entry('child', '아이', 'n.')
  assert.equal(blankOut('The children are here.', child, child.senses[0])?.answer, 'children')
  const panic = entry('panic')
  assert.equal(blankOut('He panicked yesterday.', panic, panic.senses[0])?.answer, 'panicked')
})

test('blank choices include the surface answer, use matching tense, and cannot reveal it with audio', () => {
  const [q] = buildQuestions([go], [go, ...others].map(index), ['blank'], () => 0)
  assert.equal(q.kind, 'blank')
  assert.equal(q.answer, 'went')
  assert.equal(q.prompt.replace('_____', q.answer), q.example.en)
  assert.equal(q.speakText, undefined)
  assert.ok(q.options.includes('went'))
  assert.ok(q.options.every((s) => ['went', 'walked', 'ran', 'drove', 'ate', 'sent'].includes(s)))
  assert.equal(new Set(q.options.map((s) => s.toLowerCase())).size, 4)
  const turn = entry('turn off', '끄다'); turn.type = 'phrasal'
  turn.senses[0].examples = [{ en: 'She turned the light off.', ko: '그녀는 불을 껐다.' }]
  assert.equal(buildQuestions([turn], [turn, ...others].map(index), ['blank'], () => 0)[0].kind, 'meaning')
})

test('known synonyms, alternate senses, forms, duplicate headwords, and duplicate choices are excluded', () => {
  const buy = entry('buy', '사다, 구매하다')
  buy.senses[0].synonyms = ['purchase']
  buy.forms = ['bought']
  const bad = [entry('purchase', '구입하다'), entry('shop', '사다'), entry('bought', '샀다'), entry('buy', '매수하다', 'v.', 'business')]
  const duplicate = entry('jog', others[1].senses[0].meaningKo)
  const all = [buy, ...bad, ...others, duplicate].map(index)
  for (const kind of ['meaning', 'word'] as const) {
    const [q] = buildQuestions([buy], all, [kind], () => 0)
    assert.equal(q.options.length, 4)
    assert.equal(new Set(q.options).size, 4)
    assert.equal(q.options.some((v) => ['purchase', 'shop', 'bought', '매수하다', '구입하다', '사다'].includes(v)), false)
  }
})

test('older offline indexes without part-of-speech metadata use meaning questions safely', () => {
  const legacy = [go, ...others].map((e) => { const item = index(e); delete item.p; return item })
  const [q] = buildQuestions([go], legacy, ['blank'], () => 0)
  assert.equal(q.kind, 'meaning')
  assert.equal(q.options.length, 4)
})

test('quiz choices prefer matching level and type, then exhaust other groups without replacement', () => {
  const target = entry('buy', '구매하다')
  target.senses[0].synonyms = ['purchase']
  const same = [entry('walk', '걷다'), entry('run', '달리다'), entry('drive', '운전하다')]
  const otherType = entry('look for', '찾다'); otherType.type = 'phrasal'
  const otherLevel = entry('budget', '예산', 'n.', 'business')
  const all = [target, entry('purchase', '사다'), ...same, otherType, otherLevel].map(index)
  const [preferred] = buildQuestions([target], all, ['word'], () => 0)
  assert.deepEqual(new Set(preferred.options), new Set(['buy', 'walk', 'run', 'drive']))
  const sparse = [target, same[0], otherType, otherLevel].map(index)
  const [fallback] = buildQuestions([target], sparse, ['word'], () => 0)
  assert.deepEqual(new Set(fallback.options), new Set(['buy', 'walk', 'look for', 'budget']))
  assert.deepEqual(buildQuestions([target], [target, same[0]].map(index), ['word'], () => 0), [])
})

test('ten questions sample a bounded number of candidates from a large index, including cached repeats', () => {
  const entries = Array.from({ length: 5000 }, (_, i) => entry(`word${i}`, `의미${i}`))
  const all = entries.map(index)
  let draws = 0
  const random = () => { draws++; return 0.37 }
  for (let repeat = 0; repeat < 2; repeat++) {
    draws = 0
    const questions = buildQuestions(entries.slice(0, 10), all, ['word'], random)
    assert.equal(questions.length, 10)
    assert.ok(draws < 200, `Should stop after choosing distractors; made ${draws} random draws`)
    for (const q of questions) {
      assert.equal(new Set(q.options.map((s) => s.toLowerCase())).size, 4)
      assert.ok(q.options.includes(q.answer))
    }
  }
})

test('a one-word studied scope stays one word; today and session scopes cross levels and respect local dates', () => {
  const now = new Date(2026, 9, 27, 12).getTime()
  const previousDay = new Date(2026, 9, 26, 23, 59).getTime()
  const business = index(entry('budget', '예산', 'n.', 'business'))
  const pool = [index(go), index(others[0]), business]
  const progress: Record<string, Progress> = {
    [go.id]: { ...newProgress(), status: 'review', lastReviewed: previousDay },
    [business.id]: { ...newProgress(), status: 'known', lastReviewed: now - 1 },
  }
  assert.deepEqual(quizPool(pool, progress, 'studied', 'beginner', [], now).map((e) => e.id), [go.id])
  assert.deepEqual(quizPool(pool, progress, 'today', 'beginner', [], now).map((e) => e.id), [business.id])
  assert.deepEqual(quizPool(pool, progress, 'session', 'beginner', [go.id, business.id], now).map((e) => e.id), [go.id, business.id])
  assert.equal(quizPool(pool, {}, 'studied', 'beginner', [], now).length, 0)
})

test('situation filters use travel, email, meetings and daily contexts without changing order', () => {
  const e = index(go)
  assert.equal(matchesTopic({ ...e, g: ['travel'], c: [] }, 'travel'), true)
  assert.equal(matchesTopic({ ...e, g: [], c: ['직장/회의'] }, 'meetings'), true)
  assert.equal(matchesTopic({ ...e, g: ['email'], c: [] }, 'email'), true)
  assert.equal(matchesTopic(e, 'daily'), true)
  assert.equal(matchesTopic({ ...e, g: ['law'], c: ['법률'] }, 'email'), false)
})

await useStore.persist.rehydrate()
test('session grading is atomic, rejects duplicate clicks and preserves bookmarks; backups restore sessions', () => {
  useStore.getState().resetAll()
  useStore.getState().toggleBookmark('b-w-go')
  useStore.getState().markGrammarRead('g-present-perfect')
  useStore.getState().beginStudy(session())
  useStore.getState().answerStudy('test', 'b-w-go', 'again', 0)
  useStore.getState().answerStudy('test', 'b-w-go', 'again', 0)
  assert.equal(useStore.getState().progress['b-w-go'].reps, 1)
  assert.equal(useStore.getState().progress['b-w-go'].bookmarked, true)
  const backup = JSON.parse(useStore.getState().exportAll())
  useStore.getState().resetAll()
  assert.equal(useStore.getState().studySession, null)
  assert.equal(useStore.getState().importAll(backup).ok, true)
  assert.deepEqual(useStore.getState().studySession?.remaining, ['b-w-run', 'b-w-go'])
  useStore.getState().answerStudy('test', 'b-w-run', 'good', 1)
  useStore.getState().answerStudy('test', 'b-w-go', 'good', 2)
  assert.deepEqual(useStore.getState().lastStudyIds, ['b-w-go', 'b-w-run'])
  assert.equal(useStore.getState().daily[todayKey()].newCards, 2)
  assert.equal(useStore.getState().daily[todayKey()].reviews, 3)
  assert.ok(useStore.getState().grammarRead['g-present-perfect'])
  useStore.getState().resetAll()
  assert.equal(useStore.getState().importAll({ progress: {}, settings: { level: 'advanced' } }).ok, true)
  assert.equal(useStore.getState().studySession, null)
  assert.equal(useStore.getState().settings.sessionSize, 20)
})

test('saved card snapshots survive grading and backup restore, and old sessions can acquire snapshots', () => {
  useStore.getState().resetAll()
  const card = entry('go'); const initial = session([card.id])
  useStore.getState().beginStudy(initial)
  useStore.getState().cacheStudyCards('wrong-token', [card])
  assert.equal(useStore.getState().studySession?.cards, undefined)
  useStore.getState().cacheStudyCards('test', [card])
  useStore.getState().answerStudy('test', card.id, 'again', 0)
  const backup = JSON.parse(useStore.getState().exportAll())
  useStore.getState().resetAll()
  useStore.getState().importAll(backup)
  assert.deepEqual(useStore.getState().studySession?.cards, [card])
  assert.deepEqual(useStore.getState().studySession?.remaining, [card.id])
  assert.equal(studySessionSchema.safeParse({ ...initial, cards: [entry('run')] }).success, false)
})
