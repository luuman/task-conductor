import initSqlJs, { type Database } from 'sql.js'
import type { CacheDB } from './types'

const DB_NAME = 'tc_cache'
const IDB_STORE = 'sqlite'
const IDB_KEY = 'db'
const FLUSH_INTERVAL = 30_000

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
 * Web 缓存 — sql.js (SQLite WASM) 内存引擎 + IndexedDB 持久化。
 *
 * 运行时所有读写在内存中（~0.1ms），
 * 定时将整个 SQLite 数据库二进制导出到 IndexedDB 持久化。
 * 页面刷新后从 IndexedDB 恢复。
 */
export class WebSqliteCache implements CacheDB {
  private db: Database | null = null
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private dirty = false

  async init(): Promise<void> {
    // 手动 fetch WASM 二进制，避免 Vite 预构建干扰 locateFile 路径
    const wasmResponse = await fetch('/sql-wasm.wasm')
    const wasmBinary = await wasmResponse.arrayBuffer()
    const SQL = await initSqlJs({
      wasmBinary,
    })

    const saved = await this.loadFromIDB()
    this.db = saved ? new SQL.Database(saved) : new SQL.Database()
    this.db.run(SCHEMA)
    this.evictExpired()

    this.flushTimer = setInterval(() => {
      if (this.dirty) this.flush()
    }, FLUSH_INTERVAL)

    window.addEventListener('beforeunload', () => {
      // beforeunload 无法等 async，依赖定时 flush 已保存的数据
      if (this.dirty && this.db) {
        // 尝试同步写 sessionStorage 作为应急备份
        try {
          const bin = this.db.export()
          sessionStorage.setItem(`${DB_NAME}_emergency`, this.uint8ToBase64(bin))
        } catch { /* 超出限制就放弃 */ }
      }
    })
  }

  get<T>(key: string): T | null {
    if (!this.db) return null
    const now = Date.now()
    const result = this.db.exec('SELECT data, ts, ttl FROM cache WHERE key = ?', [key])
    if (result.length === 0 || result[0].values.length === 0) return null

    const [data, ts, ttl] = result[0].values[0] as [string, number, number]
    if (now - ts > ttl) {
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
    this.db.run(
      'INSERT OR REPLACE INTO cache (key, data, ts, ttl) VALUES (?, ?, ?, ?)',
      [key, JSON.stringify(data), Date.now(), ttl]
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
    await this.saveToIDB(binary)
    this.dirty = false
  }

  close(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    this.db?.close()
    this.db = null
  }

  // ─── IndexedDB 持久化 ───

  private openIDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  private async loadFromIDB(): Promise<Uint8Array | null> {
    try {
      // 先检查 sessionStorage 应急备份
      const emergency = sessionStorage.getItem(`${DB_NAME}_emergency`)
      if (emergency) {
        sessionStorage.removeItem(`${DB_NAME}_emergency`)
        return this.base64ToUint8(emergency)
      }

      const idb = await this.openIDB()
      return new Promise((resolve) => {
        const tx = idb.transaction(IDB_STORE, 'readonly')
        const req = tx.objectStore(IDB_STORE).get(IDB_KEY)
        req.onsuccess = () => { idb.close(); resolve(req.result instanceof Uint8Array ? req.result : null) }
        req.onerror = () => { idb.close(); resolve(null) }
      })
    } catch {
      return null
    }
  }

  private async saveToIDB(binary: Uint8Array): Promise<void> {
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
    this.db?.run('DELETE FROM cache WHERE (? - ts) > ttl', [Date.now()])
  }

  private uint8ToBase64(bytes: Uint8Array): string {
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    return btoa(bin)
  }

  private base64ToUint8(b64: string): Uint8Array {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  }
}
