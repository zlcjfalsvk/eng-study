import { memo } from 'react'
import { Link } from 'react-router'
import type { IndexItem } from '../lib/content'
import { useStore } from '../store/progress'
import { SpeakButton } from './SpeakButton'
import { ChevronRight, LevelBadge, StatusDot, TypeBadge, cx } from './ui'

export const EntryRow = memo(function EntryRow({ item, showLevel }: { item: IndexItem; showLevel?: boolean }) {
  const p = useStore((s) => s.progress[item.id])
  return (
    <Link to={`/entry/${item.id}`} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 active:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:active:bg-slate-800">
      <SpeakButton text={item.h} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <StatusDot status={p?.status} />
          <span className="truncate text-[15px] font-semibold">{item.h}</span>
          {p?.bookmarked && <span className="text-amber-500">★</span>}
          {item.t !== 'word' && <TypeBadge type={item.t} />}
          {showLevel && <LevelBadge level={item.l} />}
        </div>
        <div className="mt-0.5 truncate text-sm text-slate-600 dark:text-slate-300">
          {item.m}
          {item.n > 1 && <span className="ml-1 text-xs text-slate-400">외 {item.n - 1}개 뜻</span>}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {item.c.map((c) => (
            <span key={c} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {c}
            </span>
          ))}
        </div>
      </div>
      <ChevronRight className="shrink-0 text-slate-300" />
    </Link>
  )
})

export const EntryList = memo(function EntryList({ items, showLevel, className }: { items: IndexItem[]; showLevel?: boolean; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      {items.map((e) => (
        <EntryRow key={e.id} item={e} showLevel={showLevel} />
      ))}
    </div>
  )
})
