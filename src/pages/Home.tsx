import { Link, useNavigate } from 'react-router'
import { LEVELS, type Level } from '../data/types'
import { LEVEL_META, loadManifest } from '../lib/content'
import { useAsync } from '../lib/hooks'
import { isDue } from '../lib/srs'
import { sessionPath } from '../lib/study-session'
import { TOPICS } from '../lib/topics'
import { useStore, useToday } from '../store/progress'
import { Card, ChevronRight, Page, ProgressBar, Spinner, cx } from '../components/ui'

export default function Home() {
  const nav = useNavigate()
  const manifest = useAsync(loadManifest, [])
  const progress = useStore((s) => s.progress)
  const setSettings = useStore((s) => s.setSettings)
  const today = useToday()
  const session = useStore((s) => s.studySession)

  const now = Date.now()
  const perLevel = {} as Record<Level, { known: number; learning: number; due: number }>
  for (const lv of LEVELS) perLevel[lv] = { known: 0, learning: 0, due: 0 }
  for (const [id, p] of Object.entries(progress)) {
    const lv: Level = id[0] === 'b' ? 'beginner' : id[0] === 'i' ? 'intermediate' : id[0] === 'a' ? 'advanced' : 'business'
    if (p.status === 'known') perLevel[lv].known++
    else if (p.status !== 'new') perLevel[lv].learning++
    if (isDue(p, now)) perLevel[lv].due++
  }
  const totalDue = LEVELS.reduce((n, l) => n + perLevel[l].due, 0)
  const totalKnown = LEVELS.reduce((n, l) => n + perLevel[l].known, 0)

  return (
    <Page>
      <div className="pt-safe">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <p className="text-sm text-slate-500">{new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}</p>
            <h1 className="text-2xl font-bold tracking-tight">오늘의 영어</h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">아는 단어</p>
            <p className="text-xl font-bold text-emerald-600">{totalKnown.toLocaleString()}</p>
          </div>
        </div>

        {/* 오늘 요약 */}
        <div className="mb-5 grid grid-cols-3 gap-2">
          <Stat label="오늘 복습" value={today.reviews} />
          <Stat label="새 단어" value={today.newCards} />
          <Stat label="퀴즈 정답" value={today.quizTotal ? `${Math.round((today.quizCorrect / today.quizTotal) * 100)}%` : '–'} />
        </div>

        {/* 복습 CTA */}
        <Card className={cx('mb-5 border-0 bg-gradient-to-br from-brand-600 to-indigo-500 text-white shadow-md')}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm/5 text-white/80">복습할 카드</p>
              <p className="text-3xl font-bold">{totalDue}</p>
              <p className="mt-1 text-xs text-white/70">{totalDue ? '잊기 전에 복습하면 기억이 오래 갑니다.' : '모두 복습했어요. 새 단어를 배워 보세요!'}</p>
            </div>
            <Link to={session?.remaining.length ? sessionPath(session) : totalDue ? '/study/all?mode=due' : '/study'} className="shrink-0 rounded-xl bg-white/95 px-4 py-2.5 text-sm font-semibold text-brand-700 shadow active:scale-95">
              {session?.remaining.length ? '학습 이어하기' : totalDue ? '복습 시작' : '학습 시작'}
            </Link>
          </div>
        </Card>

        {!!session?.remaining.length && <Card className="mb-5">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-sm font-semibold">지난 학습 이어하기</p><p className="mt-1 text-xs text-slate-500">남은 카드 {session.remaining.length}개 · 진행 상황이 저장되어 있어요.</p></div>
            <Link to={sessionPath(session)} className="shrink-0 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white">이어하기</Link>
          </div>
        </Card>}

        <h2 className="mb-2 text-sm font-semibold text-slate-500">레벨별 진도</h2>
        {manifest.loading ? (
          <Spinner />
        ) : (
          <div className="flex flex-col gap-2">
            {LEVELS.map((lv) => {
              const m = LEVEL_META[lv]
              const total = manifest.data?.levels[lv]?.total ?? 0
              const s = perLevel[lv]
              return (
                <Card
                  key={lv}
                  onClick={() => {
                    setSettings({ level: lv })
                    nav(`/browse/${lv}`)
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className={cx('flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ring-1', m.bg, m.color, m.ring)}>{m.code}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between">
                        <p className="font-semibold">
                          {m.label} <span className="ml-1 text-xs font-normal text-slate-400">{m.short}</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {s.known}/{total.toLocaleString()}
                        </p>
                      </div>
                      <p className="text-xs text-slate-500">{m.desc}</p>
                      <ProgressBar className="mt-2" value={s.known} max={total} color={m.bar} />
                      <div className="mt-1 flex gap-3 text-[11px] text-slate-500">
                        <span>학습 중 {s.learning}</span>
                        {s.due > 0 && <span className="text-brand-600 dark:text-brand-100">복습 {s.due}</span>}
                      </div>
                    </div>
                    <ChevronRight className="text-slate-300" />
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-500">상황별 학습</h2>
        <div className="grid grid-cols-2 gap-2">
          {TOPICS.filter((t) => t.key !== 'all').map((t) => <Quick key={t.key} to={`/study/all?topic=${t.key}`} emoji={t.key === 'daily' ? '💬' : t.key === 'travel' ? '✈️' : t.key === 'meetings' ? '🤝' : '✉️'} title={t.label} desc="관련 단어·표현 익히기" />)}
        </div>
        <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-500">바로가기</h2>
        <div className="grid grid-cols-2 gap-2">
          <Quick to="/quiz" emoji="🎯" title="퀴즈" desc="뜻·단어·빈칸 채우기" />
          <Quick to="/quiz?scope=today" emoji="✅" title="오늘 학습 퀴즈" desc="오늘 익힌 단어 확인하기" />
          <Quick to="/grammar" emoji="📘" title="문법 정리" desc={`${manifest.data?.grammar ?? 0}개 주제`} />
          <Quick to="/browse?filter=bookmarked" emoji="★" title="북마크" desc="표시한 단어 모아보기" />
          <Quick to="/browse?filter=learning" emoji="🔥" title="학습 중" desc="아직 익히는 단어" />
        </div>
      </div>
    </Page>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  )
}

function Quick({ to, emoji, title, desc }: { to: string; emoji: string; title: string; desc: string }) {
  return (
    <Link to={to} className="rounded-2xl border border-slate-200 bg-white p-3.5 active:bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xl">{emoji}</div>
      <p className="mt-1 font-semibold">{title}</p>
      <p className="text-xs text-slate-500">{desc}</p>
    </Link>
  )
}
