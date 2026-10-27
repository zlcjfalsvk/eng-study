import { z } from 'zod'
import { entrySchema } from '../data/schema'
import type { Grade } from './srs'

const ids = z.array(z.string().min(1).max(200)).max(40)
export const studySessionSchema = z.object({
  token: z.string(),
  scope: z.enum(['all', 'beginner', 'intermediate', 'advanced', 'business']),
  topic: z.enum(['all', 'daily', 'travel', 'meetings', 'email']),
  kind: z.enum(['mixed', 'due', 'new']),
  startedAt: z.number().finite(),
  initialIds: ids,
  remaining: ids,
  reviewedIds: ids,
  attempts: z.record(z.string(), z.number().int().min(0).max(2)),
  again: z.number().int().min(0),
  good: z.number().int().min(0),
  cards: z.array(entrySchema).max(20).optional(), // 오프라인 재개용 콘텐츠 스냅샷
}).refine((s) => s.initialIds.length <= 20 && new Set(s.initialIds).size === s.initialIds.length
  && [...s.remaining, ...s.reviewedIds].every((id) => s.initialIds.includes(id))
  && (!s.cards || s.cards.length === s.initialIds.length && s.cards.every((e, i) => e.id === s.initialIds[i])), '잘못된 세션 카드')

export type StudySession = z.infer<typeof studySessionSchema>

/** At most one retry per card keeps even a difficult session finite. */
export function advanceSession(session: StudySession, grade: Grade): StudySession {
  const id = session.remaining[0]
  if (!id) return session
  const remaining = session.remaining.slice(1)
  const attempts = { ...session.attempts, [id]: (session.attempts[id] ?? 0) + 1 }
  const weak = grade === 'again' || grade === 'hard'
  if (weak && attempts[id] < 2) remaining.splice(Math.min(3, remaining.length), 0, id)
  return {
    ...session, remaining, attempts,
    reviewedIds: session.reviewedIds.includes(id) ? session.reviewedIds : [...session.reviewedIds, id],
    again: session.again + (weak ? 1 : 0), good: session.good + (weak ? 0 : 1),
  }
}

export function sessionPath(session: StudySession): string {
  return `/study/${session.scope}?topic=${session.topic}&resume=1${session.kind === 'due' ? '&mode=due' : ''}`
}
