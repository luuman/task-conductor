import type { CacheEntry, CacheStorage } from './types'

/**
 * 内存缓存 — 最快访问，页面/应用关闭即失效。
 * 作为所有持久化存储的 L1 缓存层。
 */
export class MemoryCache implements CacheStorage {
  private store = new Map<string, CacheEntry>()

  get(key: string): CacheEntry | null {
    return this.store.get(key) ?? null
  }

  set(key: string, entry: CacheEntry): void {
    this.store.set(key, entry)
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }
}
