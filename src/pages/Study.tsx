import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { LEVELS, type Entry, type Level } from '../data/types'
import { LEVEL_META, loadLevel } from '../lib/content'
import { useAsync } from '../lib/hooks'
import { isDue, previewInterval, shuffle, todayKey, type Grade } from '../lib/srs'
import { getRelatedBrief } from '../lib/relations'
import { speak } from '../lib/tts'
import { useStore } from '../store/progress'
import { SpeakButton } from '../components/SpeakButton'
import { Button, Card, Chip, Empty, Page, Spinner, cx } from '../components/ui'
import { SenseCard } from './EntryDetail'

export default function Study() {
  const params = useParams<{ level?: string }>()
  const nav = useNavigate()
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const level = (LEVELS.find((l) => l === params.level) ?? settings.level) as Level
  const { data, loading } = useAsync(() => loadLevel(level), [level])
  const progress = useStore((s) => s.progress)
  const daily = useStore((s) => s.daily[todayKey()])

  // 세션 큐는 처음 한 번만 구성한다 (진도 변화로 카드가 중간에 사라지지 않도록)
  const [queue, setQueue] = useState<Entry[] | null>(null)
  const [done, setDone] = useState<{ again: number; good: number }>({ again: 0, good: 0 })
  const [mode, setMode] = useState<'pick' | 'session' | 'summary'>('pick')

  const stats = useMemo(() => {
    const now = Date.now()
    let due = 0
    let fresh = 0
    for (const e of data ?? []) {
      const p = progress[e.id]
      if (isDue(p, now)) due++
      else if (!p || p.status === 'new') fresh++
    }
    return { due, fresh }
  }, [data, progress])

  const newLeft = Math.max(0, settings.dailyNew - (daily?.newCards ?? 0))

  function start(kind: 'mixed' | 'due' | 'new', count?: number) {
    if (!data) return
    const now = Date.now()
    const dueCards = data.filter((e) => isDue(progress[e.id], now))
    const newCards = data.filter((e) => !progress[e.id] || progress[e.id].status === 'new')
    let q: Entry[] = []
    if (kind === 'due') q = shuffle(dueCards)
    else if (kind === 'new') q = shuffle(newCards).slice(0, count ?? 10)
    else q = shuffle([...dueCards, ...shuffle(newCards).slice(0, Math.min(newLeft, 20))])
    if (q.length === 0) return
    setQueue(q)
    setDone({ again: 0, good: 0 })
    setMode('session')
  }

  if (loading || !data) return <Page title="학습"><Spinner /></Page>

  if (mode === 'session' && queue) {
    return (
      <Session
        level={level}
        queue={queue}
        onFinish={(r) => {
          setDone(r)
          setMode('summary')
        }}
        onQuit={() => setMode('pick')}
      />
    )
  }

  if (mode === 'summary') {
    const total = done.again + done.good
    return (
      <Page title="학습 완료">
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="text-5xl">🎉</div>
          <h2 className="text-2xl font-bold">수고했어요!</h2>
          <p className="text-slate-500">카드 {total}장을 복습했습니다.</p>
          <div className="mt-2 grid w-full max-w-xs grid-cols-2 gap-2">
            <Card className="text-center"><p className="text-xs text-slate-500">기억함</p><p className="text-2xl font-bold text-emerald-600">{done.good}</p></Card>
            <Card className="text-center"><p className="text-xs text-slate-500">다시</p><p className="text-2xl font-bold text-rose-500">{done.again}</p></Card>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" onClick={() => setMode('pick')}>계속 학습</Button>
            <Button onClick={() => nav('/quiz')}>퀴즈로 확인</Button>
          </div>
        </div>
      </Page>
    )
  }

  const m = LEVEL_META[level]
  return (
    <Page title="학습">
      <div className="no-scrollbar -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 sm:flex-wrap sm:overflow-visible">
        {LEVELS.map((lv) => (
          <Chip key={lv} active={level === lv} onClick={() => { setSettings({ level: lv }); nav(`/study/${lv}`, { replace: true }) }}>
            {LEVEL_META[lv].label}
          </Chip>
        ))}
      </div>

      {data.length === 0 ? (
        <Empty title="이 레벨에 콘텐츠가 없습니다" desc="scripts/generate.ts 로 단어를 생성하세요." />
      ) : (
        <div className="flex flex-col gap-3">
          <Card className={cx('border-0 ring-1', m.bg, m.ring)}>
            <p className={cx('text-xs font-semibold', m.color)}>{m.label} · {data.length.toLocaleString()}개 수록</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div><p className="text-xs text-slate-500">복습 예정</p><p className="text-2xl font-bold">{stats.due}</p></div>
              <div><p className="text-xs text-slate-500">아직 안 본 단어</p><p className="text-2xl font-bold">{stats.fresh}</p></div>
            </div>
          </Card>

          <Button className="py-3.5 text-base" onClick={() => start('mixed')} disabled={stats.due === 0 && (stats.fresh === 0 || newLeft === 0)}>
            오늘의 학습 시작 <span className="font-normal opacity-80">(복습 {stats.due} + 새 단어 {Math.min(newLeft, stats.fresh, 20)})</span>
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => start('due')} disabled={!stats.due}>복습만 ({stats.due})</Button>
            <Button variant="secondary" onClick={() => start('new', 10)} disabled={!stats.fresh}>새 단어 10개</Button>
          </div>
          <p className="text-center text-xs text-slate-400">
            하루 새 단어 목표 {settings.dailyNew}개 · 오늘 {daily?.newCards ?? 0}개 학습 · <Link to="/settings" className="underline">변경</Link>
          </p>

          <Card className="mt-2">
            <p className="text-sm font-semibold">플래시카드 사용법</p>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-sm text-slate-600 dark:text-slate-300">
              <li>카드를 탭하면 뒤집혀 상황별 뜻과 예문이 나옵니다. 🔊 로 발음을 들어 보세요.</li>
              <li><b>다시</b>는 몇 분 뒤 이 세션에서 다시 나오고, <b>알겠음</b>·<b>쉬움</b>은 며칠 뒤 복습으로 넘어갑니다.</li>
              <li>간격이 3주를 넘으면 "아는 단어"로 분류됩니다.</li>
            </ul>
          </Card>
        </div>
      )}
    </Page>
  )
}

function Session({ level, queue: initial, onFinish, onQuit }: { level: Level; queue: Entry[]; onFinish: (r: { again: number; good: number }) => void; onQuit: () => void }) {
  const settings = useStore((s) => s.settings)
  const gradeCard = useStore((s) => s.grade)
  const progress = useStore((s) => s.progress)
  const [queue, setQueue] = useState(initial)
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [result, setResult] = useState({ again: 0, good: 0 })
  const [senseIdx, setSenseIdx] = useState(0)
  const total = initial.length
  const card = queue[idx]
  const m = LEVEL_META[level]

  useEffect(() => {
    setFlipped(false)
    setSenseIdx(0)
  }, [idx, card?.id])

  useEffect(() => {
    if (flipped && settings.autoSpeak && card) speak(card.headword, { rate: settings.rate, voiceURI: settings.voiceURI })
  }, [flipped]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!card) {
    onFinish(result)
    return null
  }

  function answer(g: Grade) {
    gradeCard(card.id, g)
    const next = { ...result, [g === 'again' ? 'again' : 'good']: result[g === 'again' ? 'again' : 'good'] + 1 }
    setResult(next)
    if (g === 'again' || g === 'hard') {
      // 세션 뒤쪽에 다시 넣는다
      const q = queue.slice()
      q.splice(Math.min(queue.length, idx + 1 + 3 + Math.floor(Math.random() * 3)), 0, card)
      setQueue(q)
    }
    if (idx + 1 >= (g === 'again' || g === 'hard' ? queue.length + 1 : queue.length)) {
      onFinish(next)
      return
    }
    setIdx(idx + 1)
  }

  const prog = progress[card.id]
  const remaining = queue.length - idx
  const frontIsEn = settings.frontSide === 'en'

  return (
    <Page
      title={
        <span className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <span className={cx('font-semibold', m.color)}>{m.label}</span>
          <span>남은 카드 {remaining}</span>
        </span>
      }
      right={
        <button type="button" onClick={onQuit} className="rounded-lg px-2 py-1 text-sm text-slate-500">
          종료
        </button>
      }
    >
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className="h-full bg-brand-500 transition-all" style={{ width: `${Math.min(100, Math.round(((total - Math.min(remaining, total)) / total) * 100))}%` }} />
      </div>

      <div className="flip-card" onClick={() => !flipped && setFlipped(true)}>
        <div className={cx('flip-inner relative', flipped && 'flipped')}>
          {/* 앞면 */}
          <div className={cx('flip-face', flipped && 'pointer-events-none absolute inset-0')}>
            <Card className="flex min-h-[46dvh] flex-col items-center justify-center text-center">
              <p className="text-xs text-slate-400">{prog && prog.status !== 'new' ? `복습 · ${prog.reps}회` : '새 단어'}</p>
              {frontIsEn ? (
                <>
                  <h2 className="mt-3 text-3xl font-bold tracking-tight">{card.headword}</h2>
                  {card.ipa && <p className="mt-1 font-mono text-sm text-slate-400">{card.ipa}</p>}
                  <div className="mt-4" onClick={(e) => e.stopPropagation()}>
                    <SpeakButton text={card.headword} size="lg" />
                  </div>
                  <p className="mt-6 text-xs text-slate-400">뜻 {card.senses.length}개 · 탭하여 확인</p>
                </>
              ) : (
                <>
                  <p className="mt-3 text-xs text-slate-500">[{card.senses[0].context}]</p>
                  <h2 className="mt-1 text-2xl font-bold">{card.senses[0].meaningKo}</h2>
                  {card.senses.length > 1 && <p className="mt-2 text-sm text-slate-500">+ {card.senses.slice(1).map((s) => s.meaningKo.split(',')[0]).join(' · ')}</p>}
                  <p className="mt-6 text-xs text-slate-400">영어 단어를 떠올린 뒤 탭하세요</p>
                </>
              )}
            </Card>
          </div>
          {/* 뒷면 */}
          <div className={cx('flip-face flip-back', !flipped && 'pointer-events-none absolute inset-0')}>
            <div className="flex flex-col gap-2">
              <Card className="flex items-center justify-between py-3">
                <div>
                  <p className="text-2xl font-bold">{card.headword}</p>
                  {card.ipa && <p className="font-mono text-xs text-slate-400">{card.ipa}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Link to={`/entry/${card.id}`} onClick={(e) => e.stopPropagation()} className="text-xs text-brand-600 underline dark:text-brand-100">
                    자세히
                  </Link>
                  <SpeakButton text={card.headword} />
                </div>
              </Card>
              {card.senses.length > 1 && (
                <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:flex-wrap sm:overflow-visible">
                  {card.senses.map((s, i) => (
                    <Chip key={i} active={i === senseIdx} onClick={() => setSenseIdx(i)} className="!py-1 text-xs">
                      {i + 1}. {s.context}
                    </Chip>
                  ))}
                </div>
              )}
              <SenseCard sense={card.senses[senseIdx]} index={senseIdx} total={card.senses.length} levelColor={m.color} compact />
              <RelatedBrief id={card.id} />
            </div>
          </div>
        </div>
      </div>

      {/* 평가 버튼 */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto max-w-xl p-3">
          {flipped ? (
            <div className="grid grid-cols-4 gap-2">
              <GradeBtn label="다시" sub={previewInterval(prog, 'again')} color="bg-rose-500" onClick={() => answer('again')} />
              <GradeBtn label="어려움" sub={previewInterval(prog, 'hard')} color="bg-amber-500" onClick={() => answer('hard')} />
              <GradeBtn label="알겠음" sub={previewInterval(prog, 'good')} color="bg-emerald-500" onClick={() => answer('good')} />
              <GradeBtn label="쉬움" sub={previewInterval(prog, 'easy')} color="bg-sky-500" onClick={() => answer('easy')} />
            </div>
          ) : (
            <Button className="w-full py-3.5 text-base" onClick={() => setFlipped(true)}>
              정답 보기
            </Button>
          )}
        </div>
      </div>
    </Page>
  )
}

function RelatedBrief({ id }: { id: string }) {
  const { data } = useAsync(() => getRelatedBrief(id), [id])
  if (!data?.length) return null
  return (
    <p className="px-1 text-xs text-slate-500">
      함께 익히기:{' '}
      {data.map((c, i) => (
        <span key={c.id}>
          {i > 0 && ' · '}
          <Link to={`/entry/${c.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-slate-700 underline decoration-slate-300 dark:text-slate-200">
            {c.h}
          </Link>
        </span>
      ))}
    </p>
  )
}

function GradeBtn({ label, sub, color, onClick }: { label: string; sub: string; color: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cx('flex flex-col items-center rounded-xl py-2.5 text-white active:scale-95', color)}>
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-[11px] opacity-85">{sub}</span>
    </button>
  )
}
