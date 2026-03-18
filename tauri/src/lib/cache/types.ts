/** 缓存条目 */
export interface CacheEntry<T = unknown> {
  data: T
  ts: number       // 写入时间戳 (ms)
  ttl: number      // 存活时间 (ms)
}

/**
 * 统一缓存数据库接口。
 * Web 和 Tauri 都用 sql.js (SQLite WASM)，
 * 区别在于持久化层：Web → IndexedDB，Tauri → 文件系统。
 */
export interface CacheDB {
  /** 初始化数据库（加载 WASM + 恢复持久化数据） */
  init(): Promise<void>
  /** 读取缓存，过期返回 null */
  get<T>(key: string): T | null
  /** 写入缓存 */
  set<T>(key: string, data: T, ttl: number): void
  /** 删除指定 key */
  delete(key: string): void
  /** 清空所有缓存 */
  clear(): void
  /** 将内存数据库持久化到磁盘/IndexedDB */
  flush(): Promise<void>
  /** 关闭数据库 */
  close(): void
}

/** 各 API 接口的默认缓存 TTL (ms) */
export const CACHE_TTL = {
  /** 项目列表 — 很少变化 */
  projects:         5 * 60 * 1000,
  /** 项目文件列表 — 较少变化 */
  projectFiles:     3 * 60 * 1000,
  /** 项目知识库 — 很少变化 */
  projectKnowledge: 10 * 60 * 1000,
  /** 任务列表 — 中等频率变化 */
  tasks:            60 * 1000,
  /** 单个任务 — 中等频率变化 */
  task:             30 * 1000,
  /** 会话列表 — 实时性要求高 */
  sessions:         15 * 1000,
  /** 设置 — 很少变化 */
  settings:         5 * 60 * 1000,
  /** 指标 — 中等频率变化 */
  metrics:          30 * 1000,
} as const
