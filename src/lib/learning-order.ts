import { LEVELS, type Progress } from '../data/types'
import type { IndexItem } from './content'
import { isDue } from './srs'

export type BrowseOrder = 'recommended' | 'alphabetical'

export function compareRecommended(a: IndexItem, b: IndexItem): number {
  return LEVELS.indexOf(a.l) - LEVELS.indexOf(b.l)
    || (a.r ?? Number.MAX_SAFE_INTEGER) - (b.r ?? Number.MAX_SAFE_INTEGER)
    || a.h.localeCompare(b.h, 'en') || a.id.localeCompare(b.id)
}

export function orderIndex(items: IndexItem[], order: BrowseOrder = 'recommended'): IndexItem[] {
  return items.slice().sort(order === 'alphabetical'
    ? (a, b) => a.h.localeCompare(b.h, 'en') || compareRecommended(a, b)
    : compareRecommended)
}

/** Review overdue cards first; choose unseen cards in recommendation order. */
export function selectStudyCards(
  items: IndexItem[], progress: Record<string, Progress>,
  kind: 'mixed' | 'due' | 'new', newLimit: number, now = Date.now(),
): IndexItem[] {
  const due = items.filter((item) => isDue(progress[item.id], now))
    .sort((a, b) => progress[a.id].due - progress[b.id].due || compareRecommended(a, b))
  const fresh = orderIndex(items.filter((item) => !progress[item.id] || progress[item.id].status === 'new'))
    .slice(0, Math.max(0, Math.floor(newLimit)))
  if (kind === 'due') return due
  if (kind === 'new') return fresh
  return [...due, ...fresh]
}
