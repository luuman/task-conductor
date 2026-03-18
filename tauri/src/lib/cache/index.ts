import { isTauri } from '../tauri'
import type { CacheDB } from './types'
export { CACHE_TTL } from './types'
export type { CacheDB } from './types'

/**
 * 缓存管理器单例。
 *
 * 内存 Map 作为 L1（同步、零延迟），平台数据库作为 L2（持久化）：
 *   - Web:   sql.js (SQLite WASM 内存引擎) + IndexedDB 持久化
 *   - Tauri: @tauri-apps/plugin-sql (原生 SQLite) 直接持久化到磁盘
 *
 * 读取: L1 内存 → 命中即返回 → miss 则走 L2
 * 写入: 同时写 L1 + L2
 */
class CacheManager {
  private db: CacheDB | null = null
  private ready = false
  private initPromise: Promise<void> | null = null
  /** L1 内存层：同步读取，零延迟 */
  private mem = new Map<string, { data: unknown; ts: number; ttl: number }>()

  async init(): Promise<void> {
    if (this.ready) return
    if (this.initPromise) return this.initPromise
    this.initPromise = this.doInit()
    return this.initPromise
  }

  private async doInit(): Promise<void> {
    if (isTauri()) {
      const { TauriSqliteCache } = await import('./tauri-cache')
      this.db = new TauriSqliteCache()
    } else {
      const { WebSqliteCache } = await import('./web-cache')
      this.db = new WebSqliteCache()
    }
    await this.db.init()
    this.ready = true
  }

  /** 同步读取（L1 内存层） */
  get<T>(key: string): T | null {
    const entry = this.mem.get(key)
    if (!entry) return null
    if (Date.now() - entry.ts > entry.ttl) {
      this.mem.delete(key)
      return null
    }
    return entry.data as T
  }

  /** 写入 L1 + L2 */
  set<T>(key: string, data: T, ttl: number): void {
    this.mem.set(key, { data, ts: Date.now(), ttl })
    if (this.ready && this.db) {
      this.db.set(key, data, ttl)
    }
  }

  invalidate(key: string): void {
    this.mem.delete(key)
    if (this.ready && this.db) {
      this.db.delete(key)
    }
  }

  clear(): void {
    this.mem.clear()
    if (this.ready && this.db) {
      this.db.clear()
    }
  }

  async flush(): Promise<void> {
    if (this.ready && this.db) {
      await this.db.flush()
    }
  }

  /**
   * 带缓存的异步获取。
   * 1. 查 L1 内存 → 命中返回
   * 2. 查 L2 数据库 → 命中回填 L1 并返回
   * 3. 调用 fetcher → 写入 L1 + L2
   */
  async getOrFetch<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
    // L1
    const memCached = this.get<T>(key)
    if (memCached !== null) return memCached

    // 等待 L2 初始化完成（避免竞态导致持久化缓存失效）
    if (!this.ready && this.initPromise) {
      await this.initPromise.catch(() => {})
    }

    // L2
    if (this.ready && this.db) {
      const dbCached = this.db.get<T>(key)
      if (dbCached !== null) {
        this.mem.set(key, { data: dbCached, ts: Date.now(), ttl })
        return dbCached
      }
    }

    // Fetch
    const data = await fetcher()
    this.set(key, data, ttl)
    return data
  }
}

export const cache = new CacheManager()
