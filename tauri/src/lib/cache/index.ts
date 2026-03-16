import { SqliteCache } from './sqlite-cache'
import type { CacheDB } from './types'
export { CACHE_TTL } from './types'
export type { CacheDB } from './types'

/**
 * 缓存管理器单例。
 *
 * 两端统一使用 sql.js（SQLite WASM）内存数据库，
 * 持久化差异由 SqliteCache 内部处理：
 *   - Web:   IndexedDB 存储二进制
 *   - Tauri: localStorage 存储 base64（写到应用数据目录磁盘）
 *
 * 使用前必须调用 cache.init()。
 */
class CacheManager {
  private db: CacheDB = new SqliteCache()
  private ready = false
  private initPromise: Promise<void> | null = null

  /** 初始化缓存（加载 WASM + 恢复数据）。可多次调用，只执行一次。 */
  async init(): Promise<void> {
    if (this.ready) return
    if (this.initPromise) return this.initPromise
    this.initPromise = this.db.init().then(() => { this.ready = true })
    return this.initPromise
  }

  /** 确保初始化完成后读取。未初始化返回 null。 */
  get<T>(key: string): T | null {
    if (!this.ready) return null
    return this.db.get<T>(key)
  }

  set<T>(key: string, data: T, ttl: number): void {
    if (!this.ready) return
    this.db.set(key, data, ttl)
  }

  invalidate(key: string): void {
    if (!this.ready) return
    this.db.delete(key)
  }

  clear(): void {
    if (!this.ready) return
    this.db.clear()
  }

  async flush(): Promise<void> {
    if (!this.ready) return
    await this.db.flush()
  }

  /**
   * 带缓存的异步获取。命中返回缓存值，未命中调用 fetcher 并缓存结果。
   */
  async getOrFetch<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key)
    if (cached !== null) return cached
    const data = await fetcher()
    this.set(key, data, ttl)
    return data
  }
}

export const cache = new CacheManager()
