import type { Progress, Status } from '../data/types'

// 단순화한 SM-2 간격 반복. 단위: interval = 일, due = epoch ms.
export type Grade = 'again' | 'hard' | 'good' | 'easy'

const DAY = 24 * 60 * 60 * 1000
const MIN = 60 * 1000

export function newProgress(): Progress {
  return { status: 'new', ease: 2.5, interval: 0, due: 0, reps: 0, lapses: 0 }
}

export function isDue(p: Progress | undefined, now = Date.now()) {
  return !!p && p.status !== 'new' && p.due <= now
}

function statusFor(interval: number): Status {
  if (interval >= 21) return 'known'
  if (interval >= 1) return 'review'
  return 'learning'
}

export function grade(prev: Progress | undefined, g: Grade, now = Date.now()): Progress {
  const p = { ...(prev ?? newProgress()) }
  p.reps += 1
  p.lastReviewed = now

  if (p.status === 'new' || p.interval < 1) {
    // 학습 단계: 분 단위로 짧게 반복하다가 good/easy 로 하루 이상으로 넘어간다
    switch (g) {
      case 'again':
        p.interval = 0
        p.due = now + 5 * MIN
        break
      case 'hard':
        p.interval = 0
        p.due = now + 20 * MIN
        break
      case 'good':
        p.interval = 1
        p.due = now + DAY
        break
      case 'easy':
        p.interval = 4
        p.ease = Math.min(3.2, p.ease + 0.15)
        p.due = now + 4 * DAY
        break
    }
  } else {
    switch (g) {
      case 'again':
        p.lapses += 1
        p.ease = Math.max(1.3, p.ease - 0.2)
        p.interval = 0
        p.due = now + 10 * MIN
        break
      case 'hard':
        p.ease = Math.max(1.3, p.ease - 0.15)
        p.interval = Math.max(1, Math.round(p.interval * 1.2))
        p.due = now + p.interval * DAY
        break
      case 'good':
        p.interval = Math.max(p.interval + 1, Math.round(p.interval * p.ease))
        p.due = now + p.interval * DAY
        break
      case 'easy':
        p.ease = Math.min(3.2, p.ease + 0.15)
        p.interval = Math.max(p.interval + 2, Math.round(p.interval * p.ease * 1.3))
        p.due = now + p.interval * DAY
        break
    }
  }
  p.status = statusFor(p.interval)
  return p
}

/** 수동으로 "이미 안다" 표시 */
export function markKnown(prev: Progress | undefined, now = Date.now()): Progress {
  const p = { ...(prev ?? newProgress()) }
  p.status = 'known'
  p.interval = Math.max(p.interval, 30)
  p.due = now + p.interval * DAY
  p.lastReviewed = now
  return p
}

export function previewInterval(prev: Progress | undefined, g: Grade): string {
  const next = grade(prev, g)
  const ms = next.due - Date.now()
  if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))}분`
  if (ms < DAY) return `${Math.round(ms / (60 * MIN))}시간`
  const d = Math.round(ms / DAY)
  if (d < 30) return `${d}일`
  return `${Math.round(d / 30)}개월`
}

export const STATUS_LABEL: Record<Status, string> = {
  new: '새 단어',
  learning: '학습 중',
  review: '복습',
  known: '아는 단어',
}

export function todayKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
