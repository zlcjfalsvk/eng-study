// ─── 콘텐츠 데이터 모델 ───────────────────────────────────────────────
// 모든 콘텐츠 JSON(src/data/content/*.json)은 이 타입을 따른다.
// 검증: pnpm validate  (scripts/validate.ts, zod 스키마는 src/data/schema.ts)

export type Level = 'beginner' | 'intermediate' | 'advanced' | 'business'
export const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced', 'business']

export type EntryType = 'word' | 'phrasal' | 'idiom' | 'collocation'
export type Register = 'neutral' | 'formal' | 'informal' | 'slang' | 'technical'

export interface Example {
  en: string // 자연스러운 영어 예문 (headword 포함)
  ko: string // 자연스러운 한국어 번역
}

export interface Sense {
  pos: string // 'n.' | 'v.' | 'adj.' | 'adv.' | 'prep.' | 'conj.' | 'phr. v.' | 'idiom' | 'colloc.' 등
  context: string // 상황 라벨(한국어). 예: "일상 대화", "직장/회의", "이메일", "뉴스/시사", "학술/글쓰기", "여행", "금융"
  meaningKo: string // 한국어 뜻 (간결)
  meaningEn: string // 영어 정의 (한 문장)
  register?: Register
  examples: Example[] // 2개 이상 권장
  synonyms?: string[]
  antonyms?: string[]
  note?: string // 뉘앙스/용법/흔한 실수 메모(한국어)
}

export interface Entry {
  id: string // `${레벨약자}-${타입약자}-${slug}` 예: b-w-run, i-p-put-off, a-i-hit-the-ground-running, z-w-leverage
  headword: string // 표제어 (phrasal/idiom은 전체 표현)
  type: EntryType
  level: Level
  ipa?: string // 발음기호(미국식), 예: /rʌn/
  forms?: string[] // 변화형: ["ran", "running"] / 복수형 등
  senses: Sense[] // 1~6개. 상황에 따라 뜻이 갈리는 경우 반드시 여러 개로 분리
  tags?: string[] // 주제 태그(영문 소문자): "travel", "email", "finance", "health" ...
}

export interface GrammarExample {
  en: string
  ko: string
  wrong?: string // 흔한 오류 문장(있을 때만)
}

export interface GrammarSection {
  heading: string // 소제목(한국어)
  body: string // 설명(한국어, 간단한 마크다운 허용: **굵게**, `코드`, 줄바꿈)
  examples: GrammarExample[]
}

export interface GrammarTopic {
  id: string // 예: g-present-perfect
  title: string // 영어 제목
  titleKo: string // 한국어 제목
  level: Level
  category: string // "시제" | "조동사" | "관사/명사" | "전치사" | "문장구조" | "가정법" | "비즈니스 글쓰기" ...
  summary: string // 한두 문장 요약(한국어)
  sections: GrammarSection[]
  pitfalls?: string[] // 한국인 학습자가 자주 틀리는 포인트
}

// ─── 학습 진도(브라우저 저장) ─────────────────────────────────────────
export type Status = 'new' | 'learning' | 'review' | 'known'

export interface Progress {
  status: Status
  ease: number // SM-2 ease factor (기본 2.5)
  interval: number // 일 단위
  due: number // epoch ms
  reps: number
  lapses: number
  lastReviewed?: number
  bookmarked?: boolean
}
