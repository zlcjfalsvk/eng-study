import type { IndexItem } from './content'

export const TOPICS = [
  { key: 'all', label: '모든 상황', tags: [], context: /$^/ },
  { key: 'daily', label: '일상 대화', tags: ['daily', 'home', 'family', 'food', 'shopping', 'school', 'feelings'], context: /일상|가족|친구|음식|쇼핑/ },
  { key: 'travel', label: '여행', tags: ['travel', 'transport', 'transportation', 'hotel', 'tourism', 'directions'], context: /여행|공항|호텔|교통|길 안내/ },
  { key: 'meetings', label: '회의', tags: ['meeting', 'meetings', 'presentation', 'presentations'], context: /회의|발표/ },
  { key: 'email', label: '이메일', tags: ['email', 'emails', 'correspondence'], context: /이메일|메일|서신/ },
] as const

export type Topic = typeof TOPICS[number]['key']
export function parseTopic(value: string | null): Topic {
  return TOPICS.find((t) => t.key === value)?.key ?? 'all'
}
export function topicLabel(topic: Topic): string {
  return TOPICS.find((t) => t.key === topic)!.label
}
export function matchesTopic(item: IndexItem, topic: Topic): boolean {
  const spec = TOPICS.find((t) => t.key === topic)!
  return topic === 'all' || item.g.some((tag) => (spec.tags as readonly string[]).includes(tag)) || item.c.some((c) => spec.context.test(c))
}
