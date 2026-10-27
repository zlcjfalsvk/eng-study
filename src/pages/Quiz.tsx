import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { LEVELS, type Level } from '../data/types'
import { LEVEL_META, loadAllIndexes, loadEntries } from '../lib/content'
import { useAsync } from '../lib/hooks'
import { shuffle } from '../lib/srs'
import { buildQuestions, quizPool, type Kind, type Question, type QuizScope } from '../lib/quiz'
import { speak } from '../lib/tts'
import { useStore } from '../store/progress'
import { SpeakButton } from '../components/SpeakButton'
import { Button, Card, Chip, Empty, Page, Spinner, cx } from '../components/ui'

const KIND_LABEL: Record<Kind, string> = { meaning: '뜻 고르기', word: '단어 고르기', blank: '빈칸 채우기' }

export default function Quiz() {
  const level = useStore((s) => s.settings.level)
  const [sp] = useSearchParams()
  const [kinds, setKinds] = useState<Kind[]>(['meaning', 'word', 'blank'])
  return <QuizView key={`${level}:${sp.get('scope') ?? 'studied'}`} kinds={kinds} setKinds={setKinds} />
}

function QuizView({ kinds, setKinds }: { kinds: Kind[]; setKinds: Dispatch<SetStateAction<Kind[]>> }) {
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const rawScope = sp.get('scope')
  const scope: QuizScope = rawScope === 'all' || rawScope === 'today' || rawScope === 'session' ? rawScope : 'studied'
  const lastStudyIds = useStore((s) => s.lastStudyIds)
  const [error, setError] = useState('')
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const level = settings.level as Level
  const { data, loading } = useAsync(loadAllIndexes, [])
  const [starting, setStarting] = useState(false)
  const progress = useStore((s) => s.progress)
  const recordQuiz = useStore((s) => s.recordQuiz)
  const gradeCard = useStore((s) => s.grade)

  const setScope = (value: QuizScope) => { setSp({ scope: value }, { replace: true }); setError('') }
  const [qs, setQs] = useState<Question[] | null>(null)
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [wrong, setWrong] = useState<Question[]>([])
  const answered = useRef(false)

  const pools = useMemo(() => ({
    studied: quizPool(data ?? [], progress, 'studied', level, lastStudyIds),
    all: quizPool(data ?? [], progress, 'all', level, lastStudyIds),
    today: quizPool(data ?? [], progress, 'today', level, lastStudyIds),
    session: quizPool(data ?? [], progress, 'session', level, lastStudyIds),
  }), [data, progress, level, lastStudyIds])
  const pool = pools[scope]

  async function start() {
    if (!data || !pool.length || starting || !kinds.length) return
    setStarting(true)
    setError('')
    try {
      const entries = await loadEntries(shuffle(pool).slice(0, 10).map((e) => e.id))
      const questions = buildQuestions(entries, data, kinds)
      if (!questions.length) { setError('이 범위에서 보기를 구성하지 못했어요. 다른 문제 유형을 선택해 주세요.'); return }
      setQs(questions)
      setI(0)
      setPicked(null)
      setScore(0)
      setWrong([])
      answered.current = false
    } catch {
      setError('문제를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.')
    } finally {
      setStarting(false)
    }
  }

  if (loading || !data) return <Page title="퀴즈"><Spinner /></Page>

  if (qs && i >= qs.length) {
    const pct = Math.round((score / qs.length) * 100)
    return (
      <Page title="퀴즈 결과">
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <div className="text-5xl">{pct >= 80 ? '🏆' : pct >= 50 ? '👍' : '💪'}</div>
          <p className="text-4xl font-bold">{pct}%</p>
          <p className="text-slate-500">{qs.length}문제 중 {score}개 정답</p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => setQs(null)}>설정으로</Button>
            <Button disabled={starting} onClick={start}>{starting ? '문제 준비 중…' : '다시 풀기'}</Button>
          </div>
        </div>
        {wrong.length > 0 && (
          <>
            <h3 className="mb-2 text-sm font-semibold text-slate-500">틀린 단어 — 복습 큐에 넣었습니다</h3>
            <div className="flex flex-col gap-2">
              {wrong.map((q) => (
                <Link key={q.entry.id} to={`/entry/${q.entry.id}`} className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 dark:border-rose-900 dark:bg-rose-950/40">
                  <span><b>{q.entry.headword}</b> <span className="text-sm text-slate-600 dark:text-slate-300">{q.entry.senses[q.senseIdx].meaningKo}</span></span>
                  <SpeakButton text={q.entry.headword} size="sm" />
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
    const m = LEVEL_META[q.entry.level]
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
                  if (answered.current) return
                  answered.current = true
                  setPicked(opt)
                  const ok = opt === q.answer
                  recordQuiz(ok)
                  if (ok) setScore((s) => s + 1)
                  else setWrong((w) => [...w, q])
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
                <SpeakButton text={q.example.en} size="sm" />
                <span className="text-slate-700 dark:text-slate-200">{q.example.en}</span>
              </div>
              <Link to={`/entry/${q.entry.id}`} className="mt-2 inline-block text-xs text-brand-600 underline dark:text-brand-100">자세히 보기</Link>
            </Card>
            <Button className="mt-3 w-full py-3.5" onClick={() => { answered.current = false; setPicked(null); setI(i + 1) }}>
              {i + 1 < qs.length ? '다음 문제' : '결과 보기'}
            </Button>
          </div>
        )}
      </Page>
    )
  }

  return (
    <Page title="퀴즈" back="/">
      {(scope === 'studied' || scope === 'all') && <div className="no-scrollbar -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 sm:flex-wrap sm:overflow-visible">
        {LEVELS.map((lv) => <Chip key={lv} active={level === lv} onClick={() => setSettings({ level: lv })}>{LEVEL_META[lv].label}</Chip>)}
      </div>}
      <div className="flex flex-col gap-3">
        <Card>
          <p className="text-sm font-semibold">문제 유형</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['meaning', 'word', 'blank'] as Kind[]).map((k) => (
              <Chip key={k} active={kinds.includes(k)} onClick={() => setKinds((ks) => ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k])}>{KIND_LABEL[k]}</Chip>
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">빈칸을 정확히 만들 수 없는 예문은 뜻 고르기로 확인합니다.</p>
        </Card>
        <Card>
          <p className="text-sm font-semibold">출제 범위</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip active={scope === 'studied'} onClick={() => setScope('studied')}>학습한 단어 ({pools.studied.length})</Chip>
            <Chip active={scope === 'all'} onClick={() => setScope('all')}>레벨 전체 ({pools.all.length})</Chip>
            <Chip active={scope === 'today'} onClick={() => setScope('today')}>오늘 학습 ({pools.today.length})</Chip>
            {pools.session.length > 0 && <Chip active={scope === 'session'} onClick={() => setScope('session')}>이번 학습 ({pools.session.length})</Chip>}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            {scope === 'today' || scope === 'session' ? '전체 레벨에서 해당 범위의 단어만 출제합니다.' : `${LEVEL_META[level].label}의 선택한 범위에서만 출제합니다.`}
            {' '}보기에는 아직 배우지 않은 단어가 포함될 수 있습니다.
          </p>
        </Card>
        {pool.length === 0 && <Empty title="출제할 단어가 없습니다" desc="먼저 학습하거나 출제 범위를 직접 바꿔 주세요." />}
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        <Button className="py-3.5 text-base" onClick={start} disabled={!pool.length || kinds.length === 0 || starting}>
          {starting ? '문제 준비 중…' : `${Math.min(pool.length, 10)}문제 시작`}
        </Button>
        <Button variant="ghost" onClick={() => nav('/study')}>먼저 플래시카드로 학습하기</Button>
      </div>
    </Page>
  )
}
