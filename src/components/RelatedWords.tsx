import { Link } from 'react-router'
import type { Level } from '../data/types'
import { useAsync } from '../lib/hooks'
import { getRelated, REL_LABEL, type RelCard } from '../lib/relations'
import { LevelBadge, TypeBadge } from './ui'

export function RelatedWords({ id, level }: { id: string; level: Level }) {
  const { data } = useAsync(() => getRelated(id), [id])
  if (!data?.length) return null
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-sm font-semibold text-slate-500">함께 익히기</h3>
      <div className="flex flex-col gap-3">
        {data.map((g) => (
          <div key={g.kind}>
            <p className="mb-1.5 text-xs text-slate-400">{REL_LABEL[g.kind]}</p>
            <div className="flex flex-wrap gap-2">
              {g.items.map((c) => (
                <RelChip key={c.id} card={c} currentLevel={level} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function RelChip({ card, currentLevel }: { card: RelCard; currentLevel: Level }) {
  return (
    <Link to={`/entry/${card.id}`} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm active:bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
      <span className="font-semibold">{card.h}</span>
      <span className="max-w-[9rem] truncate text-slate-500">{card.m.split(',')[0]}</span>
      {card.t !== 'word' && <TypeBadge type={card.t} />}
      {card.l !== currentLevel && <LevelBadge level={card.l} />}
    </Link>
  )
}
