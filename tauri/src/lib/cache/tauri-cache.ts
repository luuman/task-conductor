import Database from '@tauri-apps/plugin-sql'
import type { CacheDB } from './types'

const DB_PATH = 'sqlite:tc_cache.db'

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS cache (
    key   TEXT PRIMARY KEY,
    data  TEXT NOT NULL,
    ts    INTEGER NOT NULL,
    ttl   INTEGER NOT NULL
  )
`

/**
 * Tauri 缓存 — 原生 SQLite。
 * 数据库文件存储在应用数据目录（如 ~/.local/share/com.sichengli.task-conductor/）。
 * 无需 WASM，直接通过 Tauri plugin-sql 调用原生 SQLite。
 */
export class TauriSqliteCache implements CacheDB {
  private db: Database | null = null

  async init(): Promise<void> {
    this.db = await Database.load(DB_PATH)
    await this.db.execute(SCHEMA)
    await this.evictExpired()
  }

  get<T>(key: string): T | null {
    // plugin-sql 只有异步 API，同步 get 走内存层
    // 这里返回 null，由 CacheManager 的内存层覆盖
    return null
  }

  /** 异步读取（CacheManager 调用） */
  async getAsync<T>(key: string): Promise<T | null> {
    if (!this.db) return null
    const now = Date.now()
    const rows = await this.db.select<{ data: string; ts: number; ttl: number }[]>(
      'SELECT data, ts, ttl FROM cache WHERE key = ?',
      [key]
    )
    if (rows.length === 0) return null
    const row = rows[0]
    if (now - row.ts > row.ttl) {
      await this.db.execute('DELETE FROM cache WHERE key = ?', [key])
      return null
    }
    try {
      return JSON.parse(row.data) as T
    } catch {
      return null
    }
  }

  set<T>(key: string, data: T, ttl: number): void {
    if (!this.db) return
    const json = JSON.stringify(data)
    // fire-and-forget 写入
    this.db.execute(
      'INSERT OR REPLACE INTO cache (key, data, ts, ttl) VALUES (?, ?, ?, ?)',
      [key, json, Date.now(), ttl]
    )
  }

  delete(key: string): void {
    if (!this.db) return
    this.db.execute('DELETE FROM cache WHERE key = ?', [key])
  }

  clear(): void {
    if (!this.db) return
    this.db.execute('DELETE FROM cache')
  }

  async flush(): Promise<void> {
    // 原生 SQLite 自动持久化，无需手动 flush
  }

  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  private async evictExpired(): Promise<void> {
    if (!this.db) return
    await this.db.execute('DELETE FROM cache WHERE (? - ts) > ttl', [Date.now()])
  }
}
