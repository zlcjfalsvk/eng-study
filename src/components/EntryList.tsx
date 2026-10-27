import { Link } from 'react-router'
import type { Entry } from '../data/types'
import { useStore } from '../store/progress'
import { SpeakButton } from './SpeakButton'
import { ChevronRight, StatusDot, TypeBadge, cx } from './ui'

export function EntryRow({ entry, showLevel }: { entry: Entry; showLevel?: boolean }) {
  const p = useStore((s) => s.progress[entry.id])
  const first = entry.senses[0]
  const contexts = Array.from(new Set(entry.senses.map((s) => s.context)))
  return (
    <Link to={`/entry/${entry.id}`} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 active:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:active:bg-slate-800">
      <SpeakButton text={entry.headword} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <StatusDot status={p?.status} />
          <span className="truncate text-[15px] font-semibold">{entry.headword}</span>
          {p?.bookmarked && <span className="text-amber-500">★</span>}
          {entry.type !== 'word' && <TypeBadge type={entry.type} />}
          {showLevel && <span className="text-[11px] text-slate-400">{entry.level}</span>}
        </div>
        <div className="mt-0.5 truncate text-sm text-slate-600 dark:text-slate-300">
          {first.meaningKo}
          {entry.senses.length > 1 && <span className="ml-1 text-xs text-slate-400">외 {entry.senses.length - 1}개 뜻</span>}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {contexts.slice(0, 3).map((c) => (
            <span key={c} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {c}
            </span>
          ))}
        </div>
      </div>
      <ChevronRight className="shrink-0 text-slate-300" />
    </Link>
  )
}

export function EntryList({ entries, showLevel, className }: { entries: Entry[]; showLevel?: boolean; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      {entries.map((e) => (
        <EntryRow key={e.id} entry={e} showLevel={showLevel} />
      ))}
    </div>
  )
}
