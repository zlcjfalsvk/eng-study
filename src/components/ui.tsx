import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { Entry, Level, Status } from '../data/types'
import { LEVEL_META, TYPE_LABEL } from '../lib/content'
import { STATUS_LABEL } from '../lib/srs'

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ')
}

export function Page({ title, back, right, children, className }: { title?: ReactNode; back?: string | boolean; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx('mx-auto flex min-h-dvh w-full max-w-xl flex-col', className)}>
      {(title || back || right) && (
        <header className="pt-safe sticky top-0 z-20 border-b border-slate-200/70 bg-slate-50/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
          <div className="flex h-12 items-center gap-2 px-3">
            {back && <BackButton to={typeof back === 'string' ? back : undefined} />}
            <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h1>
            {right}
          </div>
        </header>
      )}
      <main className="flex-1 px-4 pb-28 pt-3">{children}</main>
    </div>
  )
}

export function BackButton({ to }: { to?: string }) {
  if (to)
    return (
      <Link to={to} aria-label="뒤로" className="-ml-1 rounded-full p-2 text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800">
        <ChevronLeft />
      </Link>
    )
  return (
    <button type="button" aria-label="뒤로" onClick={() => history.back()} className="-ml-1 rounded-full p-2 text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800">
      <ChevronLeft />
    </button>
  )
}

export function ChevronLeft() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

export function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      className={cx(
        'block w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm dark:border-slate-800 dark:bg-slate-900',
        onClick && 'active:scale-[0.99] active:bg-slate-50 dark:active:bg-slate-800',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export function LevelBadge({ level, size = 'sm' }: { level: Level; size?: 'sm' | 'md' }) {
  const m = LEVEL_META[level]
  return <span className={cx('inline-flex items-center rounded-full font-medium ring-1', m.bg, m.color, m.ring, size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs')}>{m.label}</span>
}

export function TypeBadge({ type }: { type: Entry['type'] }) {
  const colors: Record<Entry['type'], string> = {
    word: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    phrasal: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
    idiom: 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/50 dark:text-fuchsia-300',
    collocation: 'bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300',
  }
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', colors[type])}>{TYPE_LABEL[type]}</span>
}

export function StatusDot({ status }: { status?: Status }) {
  const s = status ?? 'new'
  const colors: Record<Status, string> = {
    new: 'bg-slate-300 dark:bg-slate-600',
    learning: 'bg-amber-400',
    review: 'bg-sky-500',
    known: 'bg-emerald-500',
  }
  return <span title={STATUS_LABEL[s]} className={cx('inline-block size-2 rounded-full', colors[s])} />
}

export function Chip({ active, onClick, children, className }: { active?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition',
        active ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function ProgressBar({ value, max, className, color = 'bg-brand-500' }: { value: number; max: number; className?: string; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800', className)}>
      <div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Button({ children, onClick, variant = 'primary', className, disabled, type = 'button' }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; className?: string; disabled?: boolean; type?: 'button' | 'submit' }) {
  const v = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-slate-300 dark:disabled:bg-slate-700',
    secondary: 'bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-800',
    ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
  }[variant]
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={cx('rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98]', v, className)}>
      {children}
    </button>
  )
}

export function Empty({ title, desc, action }: { title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="text-3xl">🗂️</div>
      <p className="font-semibold">{title}</p>
      {desc && <p className="max-w-xs text-sm text-slate-500">{desc}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="size-7 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
    </div>
  )
}
