import type { CacheEntry, CacheStorage } from './types'

const PREFIX = 'tc_cache:'

/**
 * Tauri 缓存 — localStorage 后端。
 * Tauri WebView 的 localStorage 持久化到应用数据目录（如 ~/.local/share/com.sichengli.task-conductor/）。
 * 跨应用重启保留，适合桌面端长期缓存低频变化数据。
 */
export class TauriCache implements CacheStorage {
  get(key: string): CacheEntry | null {
    try {
      const raw = localStorage.getItem(PREFIX + key)
      if (!raw) return null
      return JSON.parse(raw) as CacheEntry
    } catch {
      return null
    }
  }

  set(key: string, entry: CacheEntry): void {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(entry))
    } catch {
      this.evictExpired()
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(entry))
      } catch { /* 放弃 */ }
    }
  }

  delete(key: string): void {
    localStorage.removeItem(PREFIX + key)
  }

  clear(): void {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIX)) keysToRemove.push(k)
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k))
  }

  private evictExpired(): void {
    const now = Date.now()
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (!k?.startsWith(PREFIX)) continue
      try {
        const entry = JSON.parse(localStorage.getItem(k)!) as CacheEntry
        if (now - entry.ts > entry.ttl) {
          localStorage.removeItem(k)
        }
      } catch {
        localStorage.removeItem(k!)
      }
    }
  }
}
