import { NavLink } from 'react-router'
import { cx } from './ui'

const tabs = [
  { to: '/', label: '홈', icon: HomeIcon },
  { to: '/browse', label: '단어장', icon: BookIcon },
  { to: '/study', label: '학습', icon: CardsIcon },
  { to: '/grammar', label: '문법', icon: GrammarIcon },
  { to: '/settings', label: '설정', icon: GearIcon },
]

export function BottomNav() {
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="mx-auto grid max-w-xl grid-cols-5">
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-brand-600 dark:text-brand-100' : 'text-slate-500 dark:text-slate-400')}
          >
            {({ isActive }) => (
              <>
                <Icon active={isActive} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

type IconProps = { active: boolean }
const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

function HomeIcon({ active }: IconProps) {
  return (
    <svg {...base} fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0}>
      <path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}
function BookIcon({ active }: IconProps) {
  return (
    <svg {...base} fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0}>
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" />
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    </svg>
  )
}
function CardsIcon({ active }: IconProps) {
  return (
    <svg {...base} fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0}>
      <rect x="3" y="7" width="14" height="14" rx="2" />
      <path d="M7 3h12a2 2 0 0 1 2 2v12" />
    </svg>
  )
}
function GrammarIcon({ active }: IconProps) {
  return (
    <svg {...base} fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0}>
      <path d="M4 4h16v16H4z" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  )
}
function GearIcon({ active }: IconProps) {
  return (
    <svg {...base} fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}
