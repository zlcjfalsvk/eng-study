// 콘텐츠 원본 입출력. 어휘는 레벨당 JSONL(한 줄에 표제어 하나) — append 가 쉽고 git diff 가 깔끔하다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Entry, GrammarTopic, Level } from '../../src/data/types.ts'

export const ROOT = join(import.meta.dirname, '../..')
export const CONTENT_DIR = join(ROOT, 'content')
export const OUT_DIR = join(ROOT, 'public/data')
export const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced', 'business']
export const SHARD_SIZE = 200

export function levelFile(level: Level) {
  return join(CONTENT_DIR, `${level}.jsonl`)
}

/** JSONL 을 읽는다. 파싱 실패한 줄은 { line, error } 로 돌려주어 호출자가 보고하게 한다. */
export function readLevelRaw(level: Level): { entries: unknown[]; errors: { line: number; error: string }[] } {
  const file = levelFile(level)
  if (!existsSync(file)) return { entries: [], errors: [] }
  const entries: unknown[] = []
  const errors: { line: number; error: string }[] = []
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((raw, i) => {
      const line = raw.trim()
      if (!line) return
      try {
        entries.push(JSON.parse(line))
      } catch (e) {
        errors.push({ line: i + 1, error: (e as Error).message })
      }
    })
  return { entries, errors }
}

export function readLevel(level: Level): Entry[] {
  return readLevelRaw(level).entries as Entry[]
}

export function writeLevel(level: Level, entries: Entry[]) {
  mkdirSync(CONTENT_DIR, { recursive: true })
  const sorted = entries.slice().sort((a, b) => a.headword.localeCompare(b.headword, 'en') || a.id.localeCompare(b.id))
  writeFileSync(levelFile(level), sorted.map((e) => JSON.stringify(e)).join('\n') + '\n')
}

export function appendLevel(level: Level, entries: Entry[]) {
  mkdirSync(CONTENT_DIR, { recursive: true })
  const file = levelFile(level)
  const prefix = existsSync(file) && !readFileSync(file, 'utf8').endsWith('\n') ? '\n' : ''
  writeFileSync(file, prefix + entries.map((e) => JSON.stringify(e)).join('\n') + '\n', { flag: 'a' })
}

export function readGrammar(): GrammarTopic[] {
  const file = join(CONTENT_DIR, 'grammar.json')
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as GrammarTopic[]) : []
}
