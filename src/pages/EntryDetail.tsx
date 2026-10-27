import { useState } from 'react'
import { Link, useParams } from 'react-router'
import type { Entry, Sense } from '../data/types'
import { LEVEL_META, loadEntry, loadIndex } from '../lib/content'
import { useAsync } from '../lib/hooks'
import { STATUS_LABEL } from '../lib/srs'
import { useStore } from '../store/progress'
import { RelatedWords } from '../components/RelatedWords'
import { SpeakButton } from '../components/SpeakButton'
import { Button, Card, Empty, LevelBadge, Page, Spinner, StatusDot, TypeBadge, cx } from '../components/ui'

export default function EntryDetail() {
  const { id = '' } = useParams()
  const { data: entry, loading } = useAsync(() => loadEntry(id), [id])
  if (loading) return <Page title=" " back><Spinner /></Page>
  if (!entry) return <Page title="단어" back><Empty title="항목을 찾을 수 없습니다" /></Page>
  return <EntryView entry={entry} />
}

function EntryView({ entry }: { entry: Entry }) {
  const p = useStore((s) => s.progress[entry.id])
  const markKnown = useStore((s) => s.markKnown)
  const resetEntry = useStore((s) => s.resetEntry)
  const toggleBookmark = useStore((s) => s.toggleBookmark)
  const [active, setActive] = useState(0)
  const sense = entry.senses[active] ?? entry.senses[0]
  const m = LEVEL_META[entry.level]

  const { data: siblings } = useAsync(() => loadIndex(entry.level), [entry.level])
  const related = (siblings ?? []).filter((e) => e.id !== entry.id && e.g.some((t) => entry.tags?.includes(t))).slice(0, 6)

  return (
    <Page
      title={entry.headword}
      back
      right={
        <button type="button" aria-label="북마크" onClick={() => toggleBookmark(entry.id)} className={cx('rounded-full p-2 text-xl leading-none', p?.bookmarked ? 'text-amber-500' : 'text-slate-300')}>
          {p?.bookmarked ? '★' : '☆'}
        </button>
      }
    >
      {/* 헤더 */}
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <LevelBadge level={entry.level} />
            <TypeBadge type={entry.type} />
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <StatusDot status={p?.status} /> {STATUS_LABEL[p?.status ?? 'new']}
            </span>
          </div>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{entry.headword}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            {entry.ipa && <span className="font-mono">{entry.ipa}</span>}
            {entry.forms?.length ? <span>변화형: {entry.forms.join(', ')}</span> : null}
          </div>
        </div>
        <SpeakButton text={entry.headword} size="lg" />
      </div>

      {/* 뜻 탭 (상황별) */}
      {entry.senses.length > 1 && (
        <>
          <p className="mb-1.5 text-xs font-medium text-slate-500">상황별 뜻 {entry.senses.length}개 — 탭을 눌러 비교하세요</p>
          <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 sm:flex-wrap sm:overflow-visible">
            {entry.senses.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                className={cx(
                  'shrink-0 rounded-xl border px-3 py-2 text-left transition',
                  i === active ? cx('border-transparent ring-2', m.bg, m.ring) : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
                )}
              >
                <p className={cx('text-[11px] font-semibold', i === active ? m.color : 'text-slate-500')}>
                  {i + 1}. {s.context}
                </p>
                <p className="max-w-[9rem] truncate text-sm font-medium">{s.meaningKo}</p>
              </button>
            ))}
          </div>
        </>
      )}

      <SenseCard sense={sense} index={active} total={entry.senses.length} levelColor={m.color} />

      {/* 전체 뜻 요약 */}
      {entry.senses.length > 1 && (
        <Card className="mt-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">한눈에 보기</p>
          <ol className="flex flex-col gap-1.5">
            {entry.senses.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <button type="button" onClick={() => setActive(i)} className={cx('shrink-0 font-semibold', i === active ? m.color : 'text-slate-400')}>
                  {i + 1}
                </button>
                <span>
                  <span className="text-slate-500">[{s.context}]</span> {s.meaningKo}
                  <span className="ml-1 text-xs text-slate-400">{s.pos}</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* 학습 상태 액션 */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {p?.status === 'known' ? (
          <Button variant="secondary" onClick={() => resetEntry(entry.id)}>다시 학습하기</Button>
        ) : (
          <Button variant="secondary" onClick={() => markKnown(entry.id)}>✓ 이미 아는 단어</Button>
        )}
        <Link to={`/study/${entry.level}`} className="rounded-xl bg-brand-600 px-4 py-2.5 text-center text-sm font-semibold text-white active:scale-[0.98]">
          이 레벨 학습하기
        </Link>
      </div>
      {p && p.reps > 0 && (
        <p className="mt-2 text-center text-xs text-slate-400">
          복습 {p.reps}회 · 간격 {p.interval}일 · 다음 복습 {new Date(p.due).toLocaleDateString('ko-KR')}
        </p>
      )}

      <RelatedWords id={entry.id} level={entry.level} />

      {related.length > 0 && (
        <>
          <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-500">같은 주제 {entry.tags ? `(#${entry.tags.join(' #')})` : ''}</h3>
          <div className="flex flex-wrap gap-2">
            {related.map((r) => (
              <Link key={r.id} to={`/entry/${r.id}`} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">
                {r.h} <span className="text-slate-400">· {r.m.split(',')[0]}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </Page>
  )
}

const REGISTER_LABEL: Record<string, string> = { neutral: '중립', formal: '격식', informal: '비격식', slang: '속어', technical: '전문용어' }

export function SenseCard({ sense, index, total, levelColor, compact }: { sense: Sense; index: number; total: number; levelColor?: string; compact?: boolean }) {
  return (
    <Card className="animate-pop">
      <div className="flex items-center gap-2 text-xs">
        <span className={cx('font-semibold', levelColor ?? 'text-brand-600')}>
          {total > 1 ? `${index + 1}/${total} · ` : ''}
          {sense.context}
        </span>
        <span className="text-slate-400">{sense.pos}</span>
        {sense.register && sense.register !== 'neutral' && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{REGISTER_LABEL[sense.register]}</span>}
      </div>
      <p className="mt-1.5 text-xl font-bold">{sense.meaningKo}</p>
      <p className="text-sm text-slate-500">{sense.meaningEn}</p>

      <ul className={cx('mt-3 flex flex-col', compact ? 'gap-2' : 'gap-3')}>
        {sense.examples.map((x, i) => (
          <li key={i} className="flex gap-2.5 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
            <SpeakButton text={x.en} size="sm" className="mt-0.5" />
            <div className="min-w-0">
              <p className="text-[15px] leading-snug">{x.en}</p>
              <p className="mt-0.5 text-sm text-slate-500">{x.ko}</p>
            </div>
          </li>
        ))}
      </ul>

      {(sense.synonyms?.length || sense.antonyms?.length) ? (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {sense.synonyms?.length ? <p><span className="text-slate-400">유의어</span> {sense.synonyms.join(', ')}</p> : null}
          {sense.antonyms?.length ? <p><span className="text-slate-400">반의어</span> {sense.antonyms.join(', ')}</p> : null}
        </div>
      ) : null}
      {sense.note && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          💡 {sense.note}
        </p>
      )}
    </Card>
  )
}
