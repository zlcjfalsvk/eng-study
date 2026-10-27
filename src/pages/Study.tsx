import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { LEVELS, type Entry, type Level } from '../data/types'
import { LEVEL_META, loadAllIndexes, loadEntries, loadIndex } from '../lib/content'
import { useAsync } from '../lib/hooks'
import { isDue, previewInterval, todayKey, type Grade } from '../lib/srs'
import { selectStudyCards } from '../lib/learning-order'
import { sessionPath, type StudySession } from '../lib/study-session'
import { TOPICS, matchesTopic, parseTopic, topicLabel } from '../lib/topics'
import { getRelatedBrief } from '../lib/relations'
import { speak } from '../lib/tts'
import { useStore } from '../store/progress'
import { SpeakButton } from '../components/SpeakButton'
import { Button, Card, Chip, Empty, Page, Spinner, cx } from '../components/ui'
import { SenseCard } from './EntryDetail'
import { LearningOrderInfo } from '../components/LearningOrderInfo'

export default function Study() {
  const params = useParams<{ level?: string }>()
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const scope: Level | 'all' = params.level === 'all' ? 'all' : LEVELS.find((l) => l === params.level) ?? settings.level
  const topic = parseTopic(sp.get('topic'))
  const dueOnly = sp.get('mode') === 'due'
  const sessionSize = settings.sessionSize === 10 ? 10 : 20
  const { data, loading } = useAsync(() => scope === 'all' ? loadAllIndexes() : loadIndex(scope), [scope])
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const progress = useStore((s) => s.progress)
  const daily = useStore((s) => s.daily[todayKey()])
  const saved = useStore((s) => s.studySession)
  const beginStudy = useStore((s) => s.beginStudy)
  const finishStudy = useStore((s) => s.finishStudy)
  const active = sp.get('resume') === '1'
  const ongoing = !!saved?.remaining.length
  const { data: loadedCards, loading: cardsLoading, error: cardsError } = useAsync(
    () => active && saved?.remaining.length
      ? loadEntries(saved.initialIds).then((entries) => ({ token: saved.token, entries }))
      : Promise.resolve(null),
    [active, saved?.token],
  )
  const list = useMemo(() => (data ?? []).filter((e) => matchesTopic(e, topic)), [data, topic])
  const stats = useMemo(() => {
    const now = Date.now()
    return { due: list.filter((e) => isDue(progress[e.id], now)).length,
      fresh: list.filter((e) => !progress[e.id] || progress[e.id].status === 'new').length }
  }, [list, progress])
  const newLeft = Math.max(0, settings.dailyNew - (daily?.newCards ?? 0))
  const preview = selectStudyCards(list, progress, dueOnly ? 'due' : 'mixed', newLeft, Date.now(), sessionSize)
  const previewDue = preview.filter((e) => isDue(progress[e.id])).length

  async function start(kind: 'mixed' | 'due' | 'new') {
    if (starting || ongoing) return
    const picked = selectStudyCards(list, progress, kind, kind === 'new' ? 10 : newLeft, Date.now(), sessionSize)
    if (!picked.length) return
    setStarting(true)
    setError('')
    try {
      const entries = await loadEntries(picked.map((i) => i.id))
      if (entries.length !== picked.length) throw new Error('일부 카드를 불러오지 못했습니다.')
      const ids = picked.map((i) => i.id)
      const session: StudySession = { token: crypto.randomUUID(), scope, topic, kind, startedAt: Date.now(), initialIds: ids,
        remaining: ids, reviewedIds: [], attempts: {}, again: 0, good: 0 }
      beginStudy(session)
      nav(sessionPath(session), { replace: true })
    } catch {
      setError('카드를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.')
    } finally {
      setStarting(false)
    }
  }

  function pause() {
    if (saved) nav(sessionPath(saved).replace('&resume=1', ''), { replace: true })
  }

  if (active && saved) {
    if (saved.remaining.length === 0) return (
      <Page title="학습 완료">
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="text-5xl">🎉</div><h2 className="text-2xl font-bold">수고했어요!</h2>
          <p className="text-slate-500">단어 {saved.reviewedIds.length}개를 학습했습니다.</p>
          <div className="grid w-full max-w-xs grid-cols-2 gap-2">
            <Card><p className="text-xs text-slate-500">기억함</p><p className="text-2xl font-bold text-emerald-600">{saved.good}</p></Card>
            <Card><p className="text-xs text-slate-500">다시 확인</p><p className="text-2xl font-bold text-rose-500">{saved.again}</p></Card>
          </div>
          <p className="text-xs text-slate-500">평가 횟수 기준 · 어려운 단어는 복습 일정에 반영했어요.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={pause}>계속 학습</Button>
            <Button disabled={!saved.reviewedIds.length} onClick={() => nav('/quiz?scope=session')}>이번 학습 퀴즈</Button>
          </div>
        </div>
      </Page>
    )
    if (cardsLoading || !cardsError && loadedCards?.token !== saved.token) return <Page title="이어갈 카드 준비 중"><Spinner /></Page>
    if (cardsError || !loadedCards || loadedCards.entries.length !== saved.initialIds.length) return (
      <Page title="학습"><Empty title="카드를 불러오지 못했어요" desc="진행 상황은 저장되어 있습니다. 연결을 확인한 뒤 다시 이어가세요." action={<Button onClick={pause}>학습 화면으로</Button>} /></Page>
    )
    const card = loadedCards.entries.find((e) => e.id === saved.remaining[0])!
    return <Session key={`${saved.token}:${saved.again + saved.good}`} card={card} session={saved} onPause={pause} />
  }

  return (
    <Page title={dueOnly ? scope === 'all' ? '전체 복습' : '복습' : '학습'}>
      {ongoing && saved && (
        <Card className="mb-4 border-brand-200 dark:border-brand-800">
          <h2 className="text-sm font-semibold">진행 중인 학습이 있어요</h2>
          <p className="mt-1 text-xs text-slate-500">{saved.scope === 'all' ? '전체 레벨' : LEVEL_META[saved.scope].label} · {topicLabel(saved.topic)} · 남은 카드 {saved.remaining.length}개</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => nav(sessionPath(saved))}>학습 이어하기</Button>
            <Button variant="ghost" onClick={() => { finishStudy(); nav(sessionPath(saved)) }}>이번 학습 마무리</Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">이어가거나 마무리한 뒤 새 학습을 시작하세요. 남은 단어의 진도는 바뀌지 않습니다.</p>
        </Card>
      )}
      <div className="no-scrollbar -mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 sm:flex-wrap sm:overflow-visible">
        {(['all', ...LEVELS] as const).map((lv) => (
          <Chip key={lv} active={scope === lv} onClick={() => { if (lv !== 'all') setSettings({ level: lv }); nav(`/study/${lv}?topic=${topic}`, { replace: true }) }}>
            {lv === 'all' ? '전체 레벨' : LEVEL_META[lv].label}
          </Chip>
        ))}
      </div>
      <label className="mb-3 flex items-center justify-between gap-3 text-sm">
        학습 상황
        <select aria-label="학습 상황" value={topic} onChange={(e) => { const next = new URLSearchParams(sp); next.set('topic', e.target.value); setSp(next, { replace: true }) }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
          {TOPICS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </label>
      {loading ? <Spinner /> : list.length === 0 ? <Empty title="이 상황의 단어가 없습니다" desc="레벨이나 학습 상황을 바꿔 보세요." /> : (
        <div className="flex flex-col gap-3">
          <Card>
            <p className="text-xs font-semibold text-slate-500">{scope === 'all' ? '전체 레벨' : LEVEL_META[scope].label} · {topicLabel(topic)} · {list.length.toLocaleString()}개</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div><p className="text-xs text-slate-500">복습 예정</p><p className="text-2xl font-bold">{stats.due}</p></div>
              <div><p className="text-xs text-slate-500">아직 안 본 단어</p><p className="text-2xl font-bold">{stats.fresh}</p></div>
            </div>
          </Card>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>한 번에 학습할 단어</span>
            <div className="flex gap-1.5">{([10, 20] as const).map((n) => <Chip key={n} active={sessionSize === n} onClick={() => setSettings({ sessionSize: n })}>{n}개</Chip>)}</div>
          </div>
          <Button className="py-3.5 text-base" onClick={() => start(dueOnly ? 'due' : 'mixed')} disabled={starting || ongoing || !preview.length}>
            {starting ? '카드 준비 중…' : dueOnly ? '복습 시작' : '오늘의 학습 시작'} <span className="font-normal opacity-80">(복습 {previewDue} + 새 단어 {preview.length - previewDue})</span>
          </Button>
          {!dueOnly && <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => start('due')} disabled={starting || ongoing || !stats.due}>복습만 (최대 {sessionSize}개)</Button>
            <Button variant="secondary" onClick={() => start('new')} disabled={starting || ongoing || !stats.fresh}>새 단어 10개</Button>
          </div>}
          {dueOnly && stats.due === 0 && <p className="text-center text-sm text-slate-500">예정된 복습을 모두 마쳤어요.</p>}
          {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
          <p className="text-center text-xs text-slate-500">하루 새 단어 목표 {settings.dailyNew}개 · 오늘 {daily?.newCards ?? 0}개 학습 · <Link to="/settings" className="underline">변경</Link></p>
          <p className="text-center text-xs leading-relaxed text-slate-500">복습할 카드를 먼저, 새 단어는 추천순으로 익힙니다. 진행 상황은 자동 저장됩니다.</p>
          <LearningOrderInfo />
          <Card className="mt-2">
            <p className="text-sm font-semibold">플래시카드 사용법</p>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-sm text-slate-600 dark:text-slate-300">
              <li>카드를 탭하면 상황별 뜻과 예문이 나옵니다. 🔊 로 발음을 들어 보세요.</li>
              <li><b>다시</b>·<b>어려움</b>은 이번 세션에서 한 번 더 확인하고, 이후 복습 일정에도 반영합니다.</li>
              <li><b>저장하고 나가기</b>를 누르거나 새로고침해도 남은 카드부터 이어갈 수 있습니다.</li>
            </ul>
          </Card>
        </div>
      )}
    </Page>
  )
}

function Session({ card, session, onPause }: { card: Entry; session: StudySession; onPause: () => void }) {
  const settings = useStore((s) => s.settings)
  const answerStudy = useStore((s) => s.answerStudy)
  const progress = useStore((s) => s.progress)
  const [flipped, setFlipped] = useState(false)
  const [senseIdx, setSenseIdx] = useState(0)
  const m = LEVEL_META[card.level]
  useEffect(() => {
    if (flipped && settings.autoSpeak) speak(card.headword, { rate: settings.rate, voiceURI: settings.voiceURI })
  }, [flipped, settings.autoSpeak, settings.rate, settings.voiceURI, card.headword])
  function answer(g: Grade) {
    answerStudy(session.token, card.id, g, session.again + session.good)
  }

  const prog = progress[card.id]
  const remaining = session.remaining.length
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
        <button type="button" onClick={onPause} className="rounded-lg px-2 py-1 text-sm text-slate-500">
          저장하고 나가기
        </button>
      }
    >
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className="h-full bg-brand-500 transition-all" style={{ width: `${Math.round(((session.again + session.good) / (session.again + session.good + remaining)) * 100)}%` }} />
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
