// 학습 기록 저장소: IndexedDB(idb-keyval) 를 기본으로 쓰고, 사용할 수 없으면 localStorage 로 폴백한다.
// 예전 버전이 localStorage 에 남긴 기록은 첫 로드 때 IndexedDB 로 자동 이전한다.
import { createStore, del, get, set } from 'idb-keyval'
import type { StateStorage } from 'zustand/middleware'

const DB_NAME = 'eng-study'
const STORE_NAME = 'kv'

function hasIndexedDB() {
  try {
    return typeof indexedDB !== 'undefined'
  } catch {
    return false
  }
}

const idb = hasIndexedDB() ? createStore(DB_NAME, STORE_NAME) : null

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export const progressStorage: StateStorage = {
  async getItem(key) {
    if (!idb) return readLocal(key)
    try {
      const v = await get<string>(key, idb)
      if (v != null) return v
      // IndexedDB 가 비어 있으면 localStorage 기록을 이전한다
      const legacy = readLocal(key)
      if (legacy != null) {
        await set(key, legacy, idb)
        try {
          localStorage.removeItem(key)
        } catch {
          /* ignore */
        }
        return legacy
      }
      return null
    } catch {
      return readLocal(key)
    }
  },
  async setItem(key, value) {
    if (idb) {
      try {
        await set(key, value, idb)
        return
      } catch {
        /* IndexedDB 쓰기 실패 → localStorage 폴백 */
      }
    }
    try {
      localStorage.setItem(key, value)
    } catch {
      /* 저장 공간 부족 등 */
    }
  },
  async removeItem(key) {
    if (idb) {
      try {
        await del(key, idb)
      } catch {
        /* ignore */
      }
    }
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}

export const STORAGE_BACKEND: 'indexeddb' | 'localstorage' = idb ? 'indexeddb' : 'localstorage'

/** 브라우저에 "이 사이트의 저장소를 임의로 지우지 말라"고 요청한다 (Safari 7일 삭제 등 완화). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function storageInfo(): Promise<{ persisted: boolean | null; usage: number | null; quota: number | null }> {
  const out = { persisted: null as boolean | null, usage: null as number | null, quota: null as number | null }
  try {
    if (navigator.storage?.persisted) out.persisted = await navigator.storage.persisted()
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate()
      out.usage = e.usage ?? null
      out.quota = e.quota ?? null
    }
  } catch {
    /* ignore */
  }
  return out
}
