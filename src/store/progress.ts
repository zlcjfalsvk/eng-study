import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Entry, Level, Progress } from '../data/types'
import { grade as srsGrade, markKnown as srsMarkKnown, newProgress, todayKey, type Grade } from '../lib/srs'
import { progressStorage } from './storage'
import { advanceSession, studySessionSchema, type StudySession } from '../lib/study-session'

export interface Settings {
  voiceURI?: string
  rate: number // 0.6 ~ 1.3
  autoSpeak: boolean // 카드 뒤집을 때 자동 재생
  dailyNew: number // 하루 새 단어 수
  frontSide: 'en' | 'ko' // 플래시카드 앞면
  level: Level // 마지막 선택 레벨
  theme: 'system' | 'light' | 'dark'
  sessionSize?: 10 | 20
}

export interface DailyStat {
  reviews: number
  newCards: number
  quizCorrect: number
  quizTotal: number
}

interface State {
  progress: Record<string, Progress>
  daily: Record<string, DailyStat>
  grammarRead: Record<string, number>
  settings: Settings
  studySession: StudySession | null
  lastStudyIds: string[]

  beginStudy: (session: StudySession) => void
  cacheStudyCards: (token: string, cards: Entry[]) => void
  answerStudy: (token: string, id: string, g: Grade, step: number) => void
  finishStudy: () => void

  grade: (id: string, g: Grade) => void
  markKnown: (id: string) => void
  resetEntry: (id: string) => void
  toggleBookmark: (id: string) => void
  recordQuiz: (correct: boolean) => void
  markGrammarRead: (id: string) => void
  setSettings: (patch: Partial<Settings>) => void
  importAll: (data: unknown) => { ok: boolean; message: string }
  exportAll: () => string
  resetAll: () => void
}

const defaultSettings: Settings = {
  rate: 0.95,
  autoSpeak: true,
  dailyNew: 15,
  frontSide: 'en',
  level: 'beginner',
  theme: 'system',
  sessionSize: 20,
}

function bumpDaily(daily: Record<string, DailyStat>, patch: Partial<DailyStat>) {
  const k = todayKey()
  const cur = daily[k] ?? { reviews: 0, newCards: 0, quizCorrect: 0, quizTotal: 0 }
  return { ...daily, [k]: { ...cur, ...Object.fromEntries(Object.entries(patch).map(([key, v]) => [key, (cur[key as keyof DailyStat] ?? 0) + (v ?? 0)])) } }
}

export const STORAGE_KEY = 'eng-progress-v1'

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      progress: {},
      daily: {},
      grammarRead: {},
      settings: defaultSettings,
      studySession: null,
      lastStudyIds: [],

      beginStudy: (session) => set({ studySession: studySessionSchema.parse(session) }),
      cacheStudyCards: (token, cards) => set((s) => {
        if (!s.studySession || s.studySession.token !== token) return s
        const parsed = studySessionSchema.safeParse({ ...s.studySession, cards })
        return parsed.success ? { studySession: parsed.data } : s
      }),
      answerStudy: (token, id, g, step) => set((s) => {
        const session = s.studySession
        if (!session || session.token !== token || session.remaining[0] !== id || session.again + session.good !== step) return s
        const prev = s.progress[id]
        const next = srsGrade(prev, g)
        if (prev?.bookmarked) next.bookmarked = true
        const updated = advanceSession(session, g)
        return {
          progress: { ...s.progress, [id]: next },
          daily: bumpDaily(s.daily, { reviews: 1, newCards: !prev || prev.status === 'new' ? 1 : 0 }),
          studySession: updated,
          ...(updated.remaining.length === 0 ? { lastStudyIds: updated.reviewedIds } : {}),
        }
      }),
      finishStudy: () => set((s) => s.studySession ? {
        studySession: { ...s.studySession, remaining: [] }, lastStudyIds: s.studySession.reviewedIds,
      } : {}),

      grade: (id, g) =>
        set((s) => {
          const prev = s.progress[id]
          const wasNew = !prev || prev.status === 'new'
          const next = srsGrade(prev, g)
          if (prev?.bookmarked) next.bookmarked = true
          return {
            progress: { ...s.progress, [id]: next },
            daily: bumpDaily(s.daily, { reviews: 1, newCards: wasNew ? 1 : 0 }),
          }
        }),

      markKnown: (id) =>
        set((s) => {
          const next = srsMarkKnown(s.progress[id])
          if (s.progress[id]?.bookmarked) next.bookmarked = true
          return { progress: { ...s.progress, [id]: next } }
        }),

      resetEntry: (id) =>
        set((s) => {
          const np = newProgress()
          if (s.progress[id]?.bookmarked) np.bookmarked = true
          return { progress: { ...s.progress, [id]: np } }
        }),

      toggleBookmark: (id) =>
        set((s) => {
          const prev = s.progress[id] ?? newProgress()
          return { progress: { ...s.progress, [id]: { ...prev, bookmarked: !prev.bookmarked } } }
        }),

      recordQuiz: (correct) => set((s) => ({ daily: bumpDaily(s.daily, { quizTotal: 1, quizCorrect: correct ? 1 : 0 }) })),

      markGrammarRead: (id) => set((s) => ({ grammarRead: { ...s.grammarRead, [id]: Date.now() } })),

      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      exportAll: () => {
        const { progress, daily, grammarRead, settings, studySession, lastStudyIds } = get()
        return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), progress, daily, grammarRead, settings, studySession, lastStudyIds }, null, 2)
      },

      importAll: (data) => {
        if (!data || typeof data !== 'object') return { ok: false, message: '올바른 JSON 이 아닙니다.' }
        const d = data as Partial<State> & { version?: number }
        if (!d.progress || typeof d.progress !== 'object') return { ok: false, message: 'progress 필드가 없습니다.' }
        set((s) => ({
          progress: { ...s.progress, ...d.progress },
          daily: { ...s.daily, ...(d.daily ?? {}) },
          grammarRead: { ...s.grammarRead, ...(d.grammarRead ?? {}) },
          settings: { ...s.settings, ...(d.settings ?? {}) },
          ...(d.studySession && studySessionSchema.safeParse(d.studySession).success && !s.studySession?.remaining.length
            ? { studySession: studySessionSchema.parse(d.studySession) } : {}),
          ...(Array.isArray(d.lastStudyIds) ? { lastStudyIds: d.lastStudyIds.filter((id): id is string => typeof id === 'string').slice(0, 20) } : {}),
        }))
        return { ok: true, message: `${Object.keys(d.progress).length}개 항목의 학습 기록을 불러왔습니다.` }
      },

      resetAll: () => set({ progress: {}, daily: {}, grammarRead: {}, studySession: null, lastStudyIds: [] }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => progressStorage),
      version: 1,
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<State>
        const parsed = studySessionSchema.safeParse(saved.studySession)
        return {
          ...current, ...saved,
          settings: { ...defaultSettings, ...(saved.settings ?? {}) },
          studySession: parsed.success ? parsed.data : null,
          lastStudyIds: Array.isArray(saved.lastStudyIds) ? saved.lastStudyIds.filter((id) => typeof id === 'string').slice(0, 20) : [],
        }
      },
    },
  ),
)

export function useProgress(id: string) {
  return useStore((s) => s.progress[id])
}

export function useToday(): DailyStat {
  return useStore((s) => s.daily[todayKey()]) ?? { reviews: 0, newCards: 0, quizCorrect: 0, quizTotal: 0 }
}
