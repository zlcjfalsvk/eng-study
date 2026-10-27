import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { Entry, Level } from '../../src/data/types.ts'
import { CONTENT_DIR, LEVELS } from './content-io.ts'

/** Fail before writing build output if a content update left the order stale. */
export function readLearningRanks(levels: Record<Level, Entry[]>): Map<string, number> {
  const schema = z.object({
    version: z.literal(1),
    levels: z.object({
      beginner: z.array(z.string()), intermediate: z.array(z.string()),
      advanced: z.array(z.string()), business: z.array(z.string()),
    }),
  })
  const order = schema.parse(JSON.parse(readFileSync(join(CONTENT_DIR, 'learning-order.json'), 'utf8')))
  const ranks = new Map<string, number>()
  for (const lv of LEVELS) {
    const expected = new Set(levels[lv].map((entry) => entry.id))
    const ids = order.levels[lv]
    if (ids.length !== expected.size || new Set(ids).size !== ids.length || ids.some((id) => !expected.has(id))) {
      throw new Error(`${lv}: 학습 순서와 콘텐츠가 다릅니다. scripts/build-learning-order.py로 순서를 다시 생성하세요.`)
    }
    ids.forEach((id, index) => ranks.set(id, index + 1))
  }
  return ranks
}
