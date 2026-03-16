import type { CacheEntry, CacheStorage } from './types'

const PREFIX = 'tc_cache:'

/**
 * Web 缓存 — sessionStorage 后端。
 * 页面刷新保留，关闭标签页清除。
 * 适合 Web 模式：同一会话内避免重复请求，不跨会话持久化。
 */
export class WebCache implements CacheStorage {
  get(key: string): CacheEntry | null {
    try {
      const raw = sessionStorage.getItem(PREFIX + key)
      if (!raw) return null
      return JSON.parse(raw) as CacheEntry
    } catch {
      return null
    }
  }

  set(key: string, entry: CacheEntry): void {
    try {
      sessionStorage.setItem(PREFIX + key, JSON.stringify(entry))
    } catch {
      // sessionStorage 满了，清理过期项
      this.evictExpired()
      try {
        sessionStorage.setItem(PREFIX + key, JSON.stringify(entry))
      } catch { /* 放弃 */ }
    }
  }

  delete(key: string): void {
    sessionStorage.removeItem(PREFIX + key)
  }

  clear(): void {
    const keysToRemove: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k?.startsWith(PREFIX)) keysToRemove.push(k)
    }
    keysToRemove.forEach((k) => sessionStorage.removeItem(k))
  }

  private evictExpired(): void {
    const now = Date.now()
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i)
      if (!k?.startsWith(PREFIX)) continue
      try {
        const entry = JSON.parse(sessionStorage.getItem(k)!) as CacheEntry
        if (now - entry.ts > entry.ttl) {
          sessionStorage.removeItem(k)
        }
      } catch {
        sessionStorage.removeItem(k!)
      }
    }
  }
}
