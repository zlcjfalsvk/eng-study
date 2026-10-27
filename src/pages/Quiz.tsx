import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { LEVELS, type Entry, type Level } from '../data/types'
import { LEVEL_META, loadLevel } from '../lib/content'
import { useAsync } from '../lib/hooks'
import { shuffle } from '../lib/srs'
import { speak } from '../lib/tts'
import { useStore } from '../store/progress'
import { SpeakButton } from '../components/SpeakButton'
import { Button, Card, Chip, Empty, Page, Spinner, cx } from '../components/ui'

type Kind = 'meaning' | 'word' | 'blank'
interface Q {
  kind: Kind
  entry: Entry
  senseIdx: number
  prompt: string
  promptSub?: string
  speakText?: string
  options: string[]
  answer: string
}

const KIND_LABEL: Record<Kind, string> = { meaning: '뜻 고르기', word: '단어 고르기', blank: '빈칸 채우기' }

function blankOut(sentence: string, entry: Entry) {
  const cands = [entry.headword, ...(entry.forms ?? [])].sort((a, b) => b.length - a.length)
  for (const c of cands) {
    const re = new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (re.test(sentence)) return sentence.replace(re, '_____')
  }
  // 변화형이 목록에 없을 때 (runs, running 등) 첫 단어 어간으로 시도
  const stem = entry.headword.split(' ')[0]
  const re = new RegExp(`\\b${stem.slice(0, Math.max(3, stem.length - 1))}\\w*`, 'i')
  return re.test(sentence) ? sentence.replace(re, '_____') : null
}

function pickHeadwords(others: Entry[], entry: Entry) {
  const same = others.filter((e) => e.type === entry.type).map((e) => e.headword)
  const rest = others.filter((e) => e.type !== entry.type).map((e) => e.headword)
  return [...same, ...rest].slice(0, 3)
}

function buildQuestions(pool: Entry[], all: Entry[], n: number, kinds: Kind[]): Q[] {
  const qs: Q[] = []
  for (const entry of shuffle(pool).slice(0, n)) {
    const senseIdx = Math.floor(Math.random() * entry.senses.length)
    const sense = entry.senses[senseIdx]
    const others = shuffle(all.filter((e) => e.id !== entry.id))
    const kind = kinds[Math.floor(Math.random() * kinds.length)]
    if (kind === 'meaning') {
      const distract = others.map((e) => e.senses[0].meaningKo).filter((m) => m !== sense.meaningKo).slice(0, 3)
      qs.push({ kind, entry, senseIdx, prompt: entry.headword, promptSub: `[${sense.context}] ${sense.pos}`, speakText: entry.headword, options: shuffle([sense.meaningKo, ...distract]), answer: sense.meaningKo })
    } else if (kind === 'word') {
      const distract = pickHeadwords(others, entry)
      qs.push({ kind, entry, senseIdx, prompt: sense.meaningKo, promptSub: `[${sense.context}] ${sense.meaningEn}`, options: shuffle([entry.headword, ...distract]), answer: entry.headword })
    } else {
      const ex = sense.examples[Math.floor(Math.random() * sense.examples.length)]
      const blanked = blankOut(ex.en, entry)
      if (!blanked) {
        const distract = others.map((e) => e.senses[0].meaningKo).filter((m) => m !== sense.meaningKo).slice(0, 3)
        qs.push({ kind: 'meaning', entry, senseIdx, prompt: entry.headword, promptSub: `[${sense.context}]`, speakText: entry.headword, options: shuffle([sense.meaningKo, ...distract]), answer: sense.meaningKo })
        continue
      }
      const distract = pickHeadwords(others, entry)
      qs.push({ kind, entry, senseIdx, prompt: blanked, promptSub: ex.ko, speakText: ex.en, options: shuffle([entry.headword, ...distract]), answer: entry.headword })
    }
  }
  return qs
}

export default function Quiz() {
  const nav = useNavigate()
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const level = settings.level as Level
  const { data, loading } = useAsync(() => loadLevel(level), [level])
  const progress = useStore((s) => s.progress)
  const recordQuiz = useStore((s) => s.recordQuiz)
  const gradeCard = useStore((s) => s.grade)

  const [kinds, setKinds] = useState<Kind[]>(['meaning', 'word', 'blank'])
  const [scope, setScope] = useState<'studied' | 'all'>('studied')
  const [qs, setQs] = useState<Q[] | null>(null)
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [wrong, setWrong] = useState<Entry[]>([])

  const studied = useMemo(() => (data ?? []).filter((e) => progress[e.id] && progress[e.id].status !== 'new'), [data, progress])

  function start() {
    if (!data || data.length < 4) return
    const pool = scope === 'studied' && studied.length >= 4 ? studied : data
    setQs(buildQuestions(pool, data, 10, kinds.length ? kinds : ['meaning']))
    setI(0)
    setPicked(null)
    setScore(0)
    setWrong([])
  }

  if (loading || !data) return <Page title="퀴즈"><Spinner /></Page>

  if (qs && i >= qs.length) {
    const pct = Math.round((score / qs.length) * 100)
    return (
      <Page title="퀴즈 결과">
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <div className="text-5xl">{pct >= 80 ? '🏆' : pct >= 50 ? '👍' : '💪'}</div>
          <p className="text-4xl font-bold">{pct}%</p>
          <p className="text-slate-500">{qs.length}문제 중 {score}개 정답</p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => setQs(null)}>설정으로</Button>
            <Button onClick={start}>다시 풀기</Button>
          </div>
        </div>
        {wrong.length > 0 && (
          <>
            <h3 className="mb-2 text-sm font-semibold text-slate-500">틀린 단어 — 복습 큐에 넣었습니다</h3>
            <div className="flex flex-col gap-2">
              {wrong.map((e) => (
                <Link key={e.id} to={`/entry/${e.id}`} className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 dark:border-rose-900 dark:bg-rose-950/40">
                  <span><b>{e.headword}</b> <span className="text-sm text-slate-600 dark:text-slate-300">{e.senses[0].meaningKo}</span></span>
                  <SpeakButton text={e.headword} size="sm" />
                </Link>
              ))}
            </div>
          </>
        )}
      </Page>
    )
  }

  if (qs) {
    const q = qs[i]
    const m = LEVEL_META[level]
    const correct = picked === q.answer
    return (
      <Page title={<span className="text-sm font-medium text-slate-500">{i + 1} / {qs.length} · {KIND_LABEL[q.kind]}</span>} right={<button type="button" onClick={() => setQs(null)} className="px-2 text-sm text-slate-500">종료</button>}>
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div className="h-full bg-brand-500 transition-all" style={{ width: `${(i / qs.length) * 100}%` }} />
        </div>
        <Card className="min-h-[30dvh]">
          <p className={cx('text-xs font-semibold', m.color)}>{m.label} · {KIND_LABEL[q.kind]}</p>
          <div className="mt-3 flex items-start gap-3">
            <p className={cx('flex-1 font-bold leading-snug', q.kind === 'blank' ? 'text-xl' : 'text-3xl')}>{q.prompt}</p>
            {q.speakText && <SpeakButton text={q.speakText} />}
          </div>
          {q.promptSub && <p className="mt-2 text-sm text-slate-500">{q.kind === 'blank' && !picked ? '힌트: ' : ''}{q.promptSub}</p>}
        </Card>

        <div className="mt-3 flex flex-col gap-2">
          {q.options.map((opt) => {
            const isAns = opt === q.answer
            const state = !picked ? 'idle' : isAns ? 'correct' : opt === picked ? 'wrong' : 'dim'
            return (
              <button
                key={opt}
                type="button"
                disabled={!!picked}
                onClick={() => {
                  setPicked(opt)
                  const ok = opt === q.answer
                  recordQuiz(ok)
                  if (ok) setScore((s) => s + 1)
                  else setWrong((w) => [...w, q.entry])
                  const p = progress[q.entry.id]
                  // 학습한 카드에만 SRS 반영. 새 단어는 틀린 경우에만 학습 큐에 올린다.
                  if (p && p.status !== 'new') gradeCard(q.entry.id, ok ? 'good' : 'again')
                  else if (!ok) gradeCard(q.entry.id, 'again')
                  if (q.kind !== 'meaning' && ok) speak(q.entry.headword, { rate: settings.rate, voiceURI: settings.voiceURI })
                }}
                className={cx(
                  'rounded-xl border px-4 py-3 text-left text-[15px] font-medium transition',
                  state === 'idle' && 'border-slate-200 bg-white active:bg-slate-50 dark:border-slate-700 dark:bg-slate-900',
                  state === 'correct' && 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100',
                  state === 'wrong' && 'border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-100',
                  state === 'dim' && 'border-slate-200 bg-white opacity-50 dark:border-slate-800 dark:bg-slate-900',
                )}
              >
                {opt}
              </button>
            )
          })}
        </div>

        {picked && (
          <div className="animate-pop mt-3">
            <Card className={cx(correct ? 'border-emerald-200 dark:border-emerald-900' : 'border-rose-200 dark:border-rose-900')}>
              <p className="font-semibold">{correct ? '정답! 🎉' : `아쉬워요. 정답은 "${q.answer}"`}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                <b>{q.entry.headword}</b> [{q.entry.senses[q.senseIdx].context}] {q.entry.senses[q.senseIdx].meaningKo}
              </p>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <SpeakButton text={q.entry.senses[q.senseIdx].examples[0].en} size="sm" />
                <span className="text-slate-700 dark:text-slate-200">{q.entry.senses[q.senseIdx].examples[0].en}</span>
              </div>
              <Link to={`/entry/${q.entry.id}`} className="mt-2 inline-block text-xs text-brand-600 underline dark:text-brand-100">자세히 보기</Link>
            </Card>
            <Button className="mt-3 w-full py-3.5" onClick={() => { setPicked(null); setI(i + 1) }}>
              {i + 1 < qs.length ? '다음 문제' : '결과 보기'}
            </Button>
          </div>
        )}
      </Page>
    )
  }

  return (
    <Page title="퀴즈" back="/">
      <div className="no-scrollbar -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 sm:flex-wrap sm:overflow-visible">
        {LEVELS.map((lv) => (
          <Chip key={lv} active={level === lv} onClick={() => setSettings({ level: lv })}>{LEVEL_META[lv].label}</Chip>
        ))}
      </div>
      {data.length < 4 ? (
        <Empty title="단어가 4개 이상 필요합니다" />
      ) : (
        <div className="flex flex-col gap-3">
          <Card>
            <p className="text-sm font-semibold">문제 유형</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(['meaning', 'word', 'blank'] as Kind[]).map((k) => (
                <Chip key={k} active={kinds.includes(k)} onClick={() => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]))}>
                  {KIND_LABEL[k]}
                </Chip>
              ))}
            </div>
          </Card>
          <Card>
            <p className="text-sm font-semibold">출제 범위</p>
            <div className="mt-2 flex gap-2">
              <Chip active={scope === 'studied'} onClick={() => setScope('studied')}>학습한 단어 ({studied.length})</Chip>
              <Chip active={scope === 'all'} onClick={() => setScope('all')}>레벨 전체 ({data.length})</Chip>
            </div>
            {scope === 'studied' && studied.length < 4 && <p className="mt-2 text-xs text-amber-600">학습한 단어가 4개 미만이면 레벨 전체에서 출제됩니다.</p>}
          </Card>
          <Button className="py-3.5 text-base" onClick={start} disabled={kinds.length === 0}>10문제 시작</Button>
          <Button variant="ghost" onClick={() => nav('/study')}>먼저 플래시카드로 학습하기</Button>
        </div>
      )}
    </Page>
  )
}
