// Stable across builds so a relation lookup needs only the entry ID, not another index fetch.
export const RELATION_SHARDS = 32

export function relationShard(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return hash % RELATION_SHARDS
}
