import initSqlJs, { type Database } from 'sql.js'
import { isTauri } from '../tauri'
import type { CacheDB } from './types'

const DB_NAME = 'tc_cache'
const IDB_STORE = 'sqlite'
const IDB_KEY = 'db'
const FLUSH_INTERVAL = 30_000 // 30s 自动 flush

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS cache (
    key   TEXT PRIMARY KEY,
    data  TEXT NOT NULL,
    ts    INTEGER NOT NULL,
    ttl   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_cache_ts ON cache(ts);
`

/**
 * SQLite 缓存实现。
 *
 * 两端都用 sql.js（SQLite WASM），内存中运行。
 * 持久化差异：
 *   - Web:   导出二进制 → IndexedDB
 *   - Tauri: 导出二进制 → localStorage（Tauri 的 localStorage 写到应用数据目录磁盘）
 *            未来可升级为 Tauri invoke 写文件
 */
export class SqliteCache implements CacheDB {
  private db: Database | null = null
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private dirty = false

  async init(): Promise<void> {
    const SQL = await initSqlJs({
      locateFile: (file: string) => `/node_modules/sql.js/dist/${file}`,
    })

    // 尝试从持久化层恢复
    const saved = await this.loadFromStorage()
    this.db = saved ? new SQL.Database(saved) : new SQL.Database()
    this.db.run(SCHEMA)

    // 清理过期数据
    this.evictExpired()

    // 定时 flush
    this.flushTimer = setInterval(() => {
      if (this.dirty) this.flush()
    }, FLUSH_INTERVAL)

    // 页面关闭前 flush
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flushSync())
    }
  }

  get<T>(key: string): T | null {
    if (!this.db) return null
    const now = Date.now()
    const result = this.db.exec(
      'SELECT data, ts, ttl FROM cache WHERE key = ?',
      [key]
    )
    if (result.length === 0 || result[0].values.length === 0) return null

    const [data, ts, ttl] = result[0].values[0] as [string, number, number]
    if (now - ts > ttl) {
      // 过期，延迟清理
      this.db.run('DELETE FROM cache WHERE key = ?', [key])
      this.dirty = true
      return null
    }
    try {
      return JSON.parse(data) as T
    } catch {
      return null
    }
  }

  set<T>(key: string, data: T, ttl: number): void {
    if (!this.db) return
    const json = JSON.stringify(data)
    this.db.run(
      'INSERT OR REPLACE INTO cache (key, data, ts, ttl) VALUES (?, ?, ?, ?)',
      [key, json, Date.now(), ttl]
    )
    this.dirty = true
  }

  delete(key: string): void {
    if (!this.db) return
    this.db.run('DELETE FROM cache WHERE key = ?', [key])
    this.dirty = true
  }

  clear(): void {
    if (!this.db) return
    this.db.run('DELETE FROM cache')
    this.dirty = true
  }

  async flush(): Promise<void> {
    if (!this.db || !this.dirty) return
    const binary = this.db.export()
    await this.saveToStorage(binary)
    this.dirty = false
  }

  close(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    this.flushSync()
    this.db?.close()
    this.db = null
  }

  private flushSync(): void {
    if (!this.db || !this.dirty) return
    const binary = this.db.export()
    // 同步写入（beforeunload 不等 async）
    if (isTauri()) {
      localStorage.setItem(
        `${DB_NAME}_bin`,
        this.uint8ToBase64(binary)
      )
    }
    // Web IndexedDB 无法同步写，依赖定时 flush 已保存的数据
    this.dirty = false
  }

  // ─── 持久化层 ───

  private async loadFromStorage(): Promise<Uint8Array | null> {
    if (isTauri()) {
      return this.loadFromLocalStorage()
    }
    return this.loadFromIndexedDB()
  }

  private async saveToStorage(binary: Uint8Array): Promise<void> {
    if (isTauri()) {
      this.saveToLocalStorage(binary)
    } else {
      await this.saveToIndexedDB(binary)
    }
  }

  // ─── Tauri: localStorage (base64) ───

  private loadFromLocalStorage(): Uint8Array | null {
    try {
      const b64 = localStorage.getItem(`${DB_NAME}_bin`)
      if (!b64) return null
      return this.base64ToUint8(b64)
    } catch {
      return null
    }
  }

  private saveToLocalStorage(binary: Uint8Array): void {
    try {
      localStorage.setItem(`${DB_NAME}_bin`, this.uint8ToBase64(binary))
    } catch { /* storage full, skip */ }
  }

  // ─── Web: IndexedDB ───

  private openIDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(IDB_STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  private async loadFromIndexedDB(): Promise<Uint8Array | null> {
    try {
      const idb = await this.openIDB()
      return new Promise((resolve) => {
        const tx = idb.transaction(IDB_STORE, 'readonly')
        const req = tx.objectStore(IDB_STORE).get(IDB_KEY)
        req.onsuccess = () => {
          idb.close()
          resolve(req.result instanceof Uint8Array ? req.result : null)
        }
        req.onerror = () => { idb.close(); resolve(null) }
      })
    } catch {
      return null
    }
  }

  private async saveToIndexedDB(binary: Uint8Array): Promise<void> {
    try {
      const idb = await this.openIDB()
      return new Promise((resolve) => {
        const tx = idb.transaction(IDB_STORE, 'readwrite')
        tx.objectStore(IDB_STORE).put(binary, IDB_KEY)
        tx.oncomplete = () => { idb.close(); resolve() }
        tx.onerror = () => { idb.close(); resolve() }
      })
    } catch { /* skip */ }
  }

  // ─── 工具 ───

  private evictExpired(): void {
    if (!this.db) return
    this.db.run('DELETE FROM cache WHERE (? - ts) > ttl', [Date.now()])
  }

  private uint8ToBase64(bytes: Uint8Array): string {
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  private base64ToUint8(b64: string): Uint8Array {
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }
}
