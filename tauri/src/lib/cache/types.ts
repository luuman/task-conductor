export interface CacheEntry<T = unknown> {
  data: T
  ts: number       // 写入时间戳 (ms)
  ttl: number      // 存活时间 (ms)
}

export interface CacheStorage {
  get(key: string): CacheEntry | null
  set(key: string, entry: CacheEntry): void
  delete(key: string): void
  clear(): void
}

/** 各 API 接口的默认缓存 TTL (ms) */
export const CACHE_TTL = {
  /** 项目列表 — 很少变化 */
  projects:         5 * 60 * 1000,    // 5 min
  /** 项目文件列表 — 较少变化 */
  projectFiles:     3 * 60 * 1000,    // 3 min
  /** 项目知识库 — 很少变化 */
  projectKnowledge: 10 * 60 * 1000,   // 10 min
  /** 任务列表 — 中等频率变化 */
  tasks:            60 * 1000,        // 1 min
  /** 单个任务 — 中等频率变化 */
  task:             30 * 1000,        // 30s
  /** 会话列表 — 实时性要求高 */
  sessions:         15 * 1000,        // 15s
  /** 设置 — 很少变化 */
  settings:         5 * 60 * 1000,    // 5 min
} as const
