import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { LEVELS, type Level, type Progress } from '../src/data/types.ts'
import type { IndexItem } from '../src/lib/content.ts'
import { compareRecommended, orderIndex, selectStudyCards } from '../src/lib/learning-order.ts'
import { newProgress } from '../src/lib/srs.ts'
import { CONTENT_DIR, readLevel } from './lib/content-io.ts'
import { readLearningRanks } from './lib/learning-order.ts'

function item(id: string, h: string, r?: number, l: Level = 'beginner'): IndexItem {
  return { id, h, r, l, t: 'word', m: '', n: 1, c: [], g: [], k: '', s: 0 }
}

const items = [item('b-w-apple', 'apple', 80), item('b-w-work', 'work', 10), item('b-w-i', 'I', 1)]

test('recommendations replace A–Z, support A–Z on demand, and do not mutate the source', () => {
  const before = structuredClone(items)
  assert.deepEqual(orderIndex(items).map((i) => i.h), ['I', 'work', 'apple'])
  assert.deepEqual(orderIndex(items, 'alphabetical').map((i) => i.h), ['apple', 'I', 'work'])
  assert.deepEqual(items, before)
  assert.deepEqual(orderIndex([item('z-w-budget', 'budget', 1, 'business'), ...items]).map((i) => i.l),
    ['beginner', 'beginner', 'beginner', 'business'])
  assert.deepEqual(orderIndex([item('b-w-old', 'old'), items[1]]).map((i) => i.h), ['work', 'old'])
})

test('new cards follow priority, skip learned cards, and continue after grading', () => {
  const p: Record<string, Progress> = { 'b-w-i': { ...newProgress(), status: 'known', due: 2000 } }
  assert.deepEqual(selectStudyCards(items, p, 'new', 1, 1000).map((i) => i.h), ['work'])
  p['b-w-work'] = { ...newProgress(), status: 'review', due: 2000 }
  assert.deepEqual(selectStudyCards(items, p, 'new', 10, 1000).map((i) => i.h), ['apple'])
  p['b-w-work'] = { ...newProgress(), bookmarked: true }
  assert.deepEqual(selectStudyCards(items, p, 'new', 1, 1000).map((i) => i.h), ['work'])
})

test('overdue review precedes new cards, earliest due first; daily limits do not remove reviews', () => {
  const pool = [...items, item('b-w-early', 'early', 100), item('b-w-later', 'later', 2)]
  const p: Record<string, Progress> = {
    'b-w-early': { ...newProgress(), status: 'review', due: 100 },
    'b-w-later': { ...newProgress(), status: 'learning', due: 200 },
    'b-w-i': { ...newProgress(), status: 'known', due: 2000 },
  }
  const before = structuredClone(p)
  assert.deepEqual(selectStudyCards(pool, p, 'mixed', 1, 1000).map((i) => i.h), ['early', 'later', 'work'])
  assert.deepEqual(selectStudyCards(pool, p, 'mixed', 0, 1000).map((i) => i.h), ['early', 'later'])
  assert.deepEqual(selectStudyCards(pool, p, 'due', 10, 1000).map((i) => i.h), ['early', 'later'])
  assert.deepEqual(selectStudyCards(pool, p, 'new', 0, 1000), [])
  assert.deepEqual(selectStudyCards([], {}, 'mixed', 15, 1000), [])
  assert.deepEqual(p, before)
})

test('every current entry has exactly one rank; core entries precede the frequency-based remainder', () => {
  const levels = Object.fromEntries(LEVELS.map((lv) => [lv, readLevel(lv)])) as Record<Level, ReturnType<typeof readLevel>>
  const ranks = readLearningRanks(levels)
  const core = JSON.parse(readFileSync(join(CONTENT_DIR, 'learning-core.json'), 'utf8')) as Record<Level, string[]>
  assert.equal(ranks.size, LEVELS.reduce((n, lv) => n + levels[lv].length, 0))
  for (const lv of LEVELS) {
    const list = levels[lv].map((e) => item(e.id, e.headword, ranks.get(e.id), lv)).sort(compareRecommended)
    assert.deepEqual(list.slice(0, core[lv].length).map((i) => i.h), core[lv])
    assert.deepEqual(list.map((i) => i.r), Array.from({ length: list.length }, (_, i) => i + 1))
  }
  assert.throws(() => readLearningRanks({ ...levels, beginner: levels.beginner.slice(1) }), /학습 순서와 콘텐츠가 다릅니다/)
})
