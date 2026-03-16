import { isTauri } from '../tauri'
import { MemoryCache } from './memory-cache'
import { WebCache } from './web-cache'
import { TauriCache } from './tauri-cache'
import type { CacheEntry, CacheStorage } from './types'
export { CACHE_TTL } from './types'

/**
 * 二级缓存管理器。
 *
 * L1: 内存缓存 — 零延迟，进程内有效
 * L2: 持久化缓存
 *   - Web:   sessionStorage（关标签清除，避免跨会话脏数据）
 *   - Tauri: localStorage（持久化到应用数据目录，跨重启保留）
 *
 * 读取顺序: L1 → L2 → miss
 * 写入: 同时写 L1 + L2
 */
class CacheManager {
  private l1: MemoryCache
  private l2: CacheStorage

  constructor() {
    this.l1 = new MemoryCache()
    this.l2 = isTauri() ? new TauriCache() : new WebCache()
  }

  /**
   * 从缓存获取数据。未命中或已过期返回 null。
   */
  get<T>(key: string): T | null {
    const now = Date.now()

    // L1
    const l1Entry = this.l1.get(key)
    if (l1Entry && now - l1Entry.ts < l1Entry.ttl) {
      return l1Entry.data as T
    }

    // L2
    const l2Entry = this.l2.get(key)
    if (l2Entry && now - l2Entry.ts < l2Entry.ttl) {
      // 回填 L1
      this.l1.set(key, l2Entry)
      return l2Entry.data as T
    }

    // 过期数据清理
    if (l1Entry) this.l1.delete(key)
    if (l2Entry) this.l2.delete(key)
    return null
  }

  /**
   * 写入缓存。
   */
  set<T>(key: string, data: T, ttl: number): void {
    const entry: CacheEntry = { data, ts: Date.now(), ttl }
    this.l1.set(key, entry)
    this.l2.set(key, entry)
  }

  /**
   * 删除指定 key。
   */
  invalidate(key: string): void {
    this.l1.delete(key)
    this.l2.delete(key)
  }

  /**
   * 删除匹配前缀的所有缓存（仅 L1，L2 由 TTL 自然过期）。
   */
  invalidatePrefix(prefix: string): void {
    this.l1.clear()
  }

  /**
   * 清空所有缓存。
   */
  clear(): void {
    this.l1.clear()
    this.l2.clear()
  }

  /**
   * 带缓存的异步获取。命中返回缓存值，未命中则调用 fetcher 并缓存结果。
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
