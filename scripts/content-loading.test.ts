import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Entry, Level } from '../src/data/types.ts'
import { loadEntries, loadEntry } from '../src/lib/content.ts'
import { getRelated } from '../src/lib/relations.ts'
import { relationShard } from '../src/lib/relation-shard.ts'

function entry(id: string, level: Level): Entry {
  return { id, level, headword: id, type: 'word', senses: [] }
}

test('content loading preserves order, shares requests, and falls back safely across cache versions', async (t) => {
  const a = entry('b-w-first', 'beginner')
  const b = entry('b-w-second', 'beginner')
  const old = entry('i-w-old', 'intermediate')
  const retry = entry('a-w-retry', 'advanced')
  const files = new Map<string, unknown>([
    ['/data/beginner/index.json?order=3', [{ id: a.id, s: 0, x: 0 }, { id: b.id, s: 1, x: 0 }]],
    // A stale small shard contains the first card but is missing the second.
    ['/data/beginner/compact/0.json', [a]],
    ['/data/beginner/1.json', [b]],
    ['/data/intermediate/index.json?order=2', [{ id: old.id, s: 0 }]],
    ['/data/intermediate/0.json', [old]],
    ['/data/advanced/index.json?order=3', [{ id: retry.id, s: 2, x: 4 }]],
    ['/data/advanced/2.json', [retry]],
  ])
  const calls: string[] = []
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const path = String(input)
    calls.push(path)
    return new Response(JSON.stringify(files.get(path) ?? {}), { status: files.has(path) ? 200 : 404 })
  })
  const ids = [b.id, old.id, a.id, b.id]
  const [first, concurrent] = await Promise.all([loadEntries(ids), loadEntry(a.id)])
  assert.deepEqual(first, [b, old, a, b])
  assert.deepEqual(concurrent, a)
  assert.equal(calls.filter((p) => p === '/data/beginner/compact/0.json').length, 1)
  assert.ok(calls.includes('/data/intermediate/index.json?order=3'))
  assert.ok(calls.includes('/data/intermediate/index.json?order=2'))
  assert.ok(calls.includes('/data/beginner/1.json'))
  assert.deepEqual(await loadEntry(retry.id), retry)
  // A failed small-shard request can be retried after reconnecting.
  files.set('/data/advanced/compact/4.json', [retry])
  assert.deepEqual(await loadEntry(retry.id), retry)
  assert.equal(calls.filter((p) => p === '/data/advanced/compact/4.json').length, 2)
  assert.equal(await loadEntry('b-w-missing'), undefined)

  // The relation shard must retain cards from another level, and retry errors.
  assert.deepEqual(await getRelated(a.id), [])
  const relation = { rel: { [a.id]: { r: [old.id] } }, cards: { [old.id]: { h: 'old', m: '오래된', l: 'intermediate', t: 'word' } } }
  files.set(`/data/relations/beginner/${relationShard(a.id)}.json`, relation)
  assert.deepEqual(await getRelated(a.id), [{ kind: 'r', items: [{ id: old.id, ...relation.cards[old.id] }] }])
  files.set('/data/relations.json', { rel: { [retry.id]: { r: [old.id] } }, cards: relation.cards })
  assert.deepEqual(await getRelated(retry.id), [{ kind: 'r', items: [{ id: old.id, ...relation.cards[old.id] }] }])
})
