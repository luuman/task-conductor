# Tauri + React 应用骨架 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `tauri/` 目录从零搭建 React + Tauri 应用骨架，包括项目初始化、依赖安装、lib 基础设施（WsManager、WindowBus、API Adapter、Zustand store）、路由布局框架，以及可运行的 Auth 页面。

**Architecture:** `tauri/` 是一个标准 Vite + React 项目，同时也是 Tauri 2.x 应用。`lib/ws/` 在运行时通过 `isTauri()` 自动选择 BrowserWsManager（WASM + Web Worker）或 TauriWsManager（Rust emit/listen）。所有业务组件不感知底层实现。

**Tech Stack:** React 19, Vite 7, TypeScript, Tailwind CSS 4, shadcn/ui, React Router v6, TanStack Query, Zustand, @tauri-apps/api, react-i18next, @vitejs/plugin-wasm

**前置条件：** P0 ws-core 计划已完成（ws-core/ 目录存在，wasm-pack 已安装）

---

## Chunk 1: Tauri 项目初始化

### Task 1: 创建 Tauri 应用

**Files:**
- Create: `tauri/`（整个目录由 create-tauri-app 脚手架生成）

- [ ] **Step 1: 使用 create-tauri-app 初始化项目**

```bash
cd /home/sichengli/Documents/code2/task-conductor

# 安装 tauri-cli（如未安装）
cargo install tauri-cli --version "^2"

# 使用 npm create 初始化（选择 React + TypeScript 模板）
npm create tauri-app@latest tauri -- \
  --template react-ts \
  --manager npm \
  --yes
```

预期：`tauri/` 目录创建，包含 `src/`、`src-tauri/`、`package.json`、`vite.config.ts`

- [ ] **Step 2: 验证目录结构**

```bash
ls tauri/
ls tauri/src-tauri/src/
```

预期输出包含：`src/`、`src-tauri/`、`index.html`、`package.json`、`vite.config.ts`

- [ ] **Step 3: 提交初始脚手架**

```bash
git add tauri/
git commit -m "chore(tauri): init Tauri 2.x + React TypeScript app scaffold"
```

---

### Task 2: 安装前端依赖

**Files:**
- Modify: `tauri/package.json`

- [ ] **Step 1: 安装核心依赖**

```bash
cd /home/sichengli/Documents/code2/task-conductor/tauri

npm install \
  react-router-dom@6 \
  @tanstack/react-query \
  zustand \
  react-i18next i18next \
  @tauri-apps/api \
  clsx tailwind-merge
```

- [ ] **Step 2: 安装开发依赖和 Vite 插件**

```bash
npm install -D \
  vite-plugin-wasm \
  vite-plugin-top-level-await \
  tailwindcss @tailwindcss/vite \
  @types/react @types/react-dom
```

- [ ] **Step 3: 初始化 shadcn/ui**

```bash
cd /home/sichengli/Documents/code2/task-conductor/tauri
npx shadcn@latest init -y
```

预期：`components/ui/` 目录创建，`tailwind.config.js` 和 `components.json` 生成

- [ ] **Step 4: 验证安装**

```bash
npm ls react-router-dom zustand @tanstack/react-query @tauri-apps/api 2>/dev/null | head -20
```

- [ ] **Step 5: 提交**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/package.json tauri/package-lock.json tauri/components.json
git commit -m "chore(tauri): install React Router, TanStack Query, Zustand, shadcn/ui"
```

---

### Task 3: 配置 Vite（WASM + 代理 + Tailwind）

**Files:**
- Modify: `tauri/vite.config.ts`

- [ ] **Step 1: 替换 vite.config.ts**

```typescript
// tauri/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait(), // Web Worker 中使用 await init() 需要此插件
    tailwindcss(),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Web 开发模式：代理到本地 FastAPI 后端
  server: {
    port: 7071,
    proxy: {
      '/api':    { target: 'http://localhost:8765', changeOrigin: true },
      '/auth':   { target: 'http://localhost:8765', changeOrigin: true },
      '/health': { target: 'http://localhost:8765', changeOrigin: true },
      '/ws': {
        target: 'ws://localhost:8765',
        ws: true,
        changeOrigin: true,
      },
    },
  },

  // Tauri 生产构建配置
  build: {
    target: ['es2021', 'chrome105', 'safari15'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },

  // 使 Vite 不遮蔽 Tauri 注入的环境变量
  envPrefix: ['VITE_', 'TAURI_'],
})
```

- [ ] **Step 2: 验证配置有效**

```bash
cd /home/sichengli/Documents/code2/task-conductor/tauri
npm run build -- --mode development 2>&1 | tail -5
```

预期：无报错，输出 `dist/` 目录

- [ ] **Step 3: 提交**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/vite.config.ts
git commit -m "chore(tauri): configure Vite with WASM plugin, API proxy, Tailwind"
```

---

## Chunk 2: lib 基础设施

### Task 4: 创建目录结构和 tauri.ts 工具

**Files:**
- Create: `tauri/src/lib/tauri.ts`
- Create: `tauri/src/lib/utils.ts`

- [ ] **Step 1: 创建 lib 目录结构**

```bash
mkdir -p /home/sichengli/Documents/code2/task-conductor/tauri/src/lib/{api,ws,store,window-bus}
mkdir -p /home/sichengli/Documents/code2/task-conductor/tauri/src/{features,components/ui,app,i18n}
```

- [ ] **Step 2: 创建 lib/tauri.ts**

```typescript
// tauri/src/lib/tauri.ts

// 为 TypeScript 声明 Tauri 全局注入的 __TAURI__ 标识
declare global {
  interface Window {
    __TAURI__?: unknown
  }
}

/** 判断当前是否运行在 Tauri 桌面环境 */
export const isTauri = (): boolean =>
  typeof window !== 'undefined' && typeof window.__TAURI__ !== 'undefined'
```

- [ ] **Step 3: 创建 lib/utils.ts（shadcn 样式合并工具）**

```typescript
// tauri/src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 4: 提交**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/lib/tauri.ts tauri/src/lib/utils.ts
git commit -m "feat(tauri): add isTauri() utility and cn() style helper"
```

---

### Task 5: WsManager 接口 + 消息类型定义

**Files:**
- Create: `tauri/src/lib/ws/types.ts`

- [ ] **Step 1: 创建 lib/ws/types.ts**

```typescript
// tauri/src/lib/ws/types.ts

/** 统一 AI 流事件格式，与 ws-core/src/message.rs 中的 AiStreamEvent 对应 */
export interface AiStreamEvent {
  /** 事件类型："tool_call" | "chunk" | "done" | "session_update" | "log" */
  event_type: string
  /** AI Provider："claude"（当前）| "openai"（预留） */
  provider: string
  /** 会话 ID */
  session_id: string
  /** 事件负载（根据 event_type 解释） */
  payload: unknown
  /** ISO 8601 时间戳 */
  ts: string
}

/** WebSocket 连接状态 */
export type WsStatus = 'connected' | 'disconnected' | 'reconnecting'

/** 取消订阅函数 */
export type Unsubscribe = () => void

/**
 * WsManager 统一接口
 * 浏览器实现：BrowserWsManager（WASM + Web Worker）
 * Tauri 实现：TauriWsManager（Rust tokio + emit/listen）
 */
export interface WsManager {
  /**
   * 订阅指定 channel 的消息
   * @returns 取消订阅函数，在组件 unmount 时调用
   */
  subscribe(channel: string, handler: (event: AiStreamEvent) => void): Unsubscribe

  /** 向指定 channel 发送消息（用于双向通信，如 chat） */
  send(channel: string, data: unknown): void

  /** 获取指定 channel 的连接状态 */
  status(channel: string): WsStatus

  /** 建立指定 channel 的连接（订阅时自动调用，通常无需手动调用） */
  connect(channel: string, url: string): void

  /** 断开指定 channel 的连接 */
  disconnect(channel: string): void
}
```

- [ ] **Step 2: 提交**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/lib/ws/types.ts
git commit -m "feat(tauri): add WsManager interface and AiStreamEvent types"
```

---

### Task 6: BrowserWsManager（Web Worker + WASM 实现）

**Files:**
- Create: `tauri/src/lib/ws/browser.ts`

- [ ] **Step 1: 创建 BrowserWsManager**

```typescript
// tauri/src/lib/ws/browser.ts
import type { AiStreamEvent, Unsubscribe, WsManager, WsStatus } from './types'

interface ChannelState {
  worker: Worker
  status: WsStatus
  handlers: Set<(event: AiStreamEvent) => void>
  url: string
}

/**
 * Web 浏览器环境的 WsManager 实现
 * 每个 channel 对应一个 Web Worker，Worker 内运行 ws-core WASM
 * Worker 独立于主线程，消息密集时不阻塞 UI
 */
export class BrowserWsManager implements WsManager {
  private channels = new Map<string, ChannelState>()
  /** ws-core 的 Web Worker 脚本路径（由 Vite 处理为正确 URL） */
  private workerUrl: string

  constructor(workerUrl: string) {
    this.workerUrl = workerUrl
  }

  connect(channel: string, url: string): void {
    if (this.channels.has(channel)) return

    const worker = new Worker(this.workerUrl, { type: 'module' })
    const state: ChannelState = {
      worker,
      status: 'disconnected',
      handlers: new Set(),
      url,
    }
    this.channels.set(channel, state)

    worker.onmessage = (e) => {
      const { type, payload, status } = e.data
      if (type === 'message') {
        try {
          const event: AiStreamEvent = typeof payload === 'string'
            ? JSON.parse(payload)
            : payload
          state.handlers.forEach((h) => h(event))
        } catch (err) {
          console.error('[WsManager] parse error', err)
        }
      } else if (type === 'status') {
        state.status = status as WsStatus
      }
    }

    worker.postMessage({ type: 'connect', url })
    state.status = 'reconnecting'
  }

  subscribe(channel: string, handler: (event: AiStreamEvent) => void): Unsubscribe {
    const state = this.channels.get(channel)
    if (!state) {
      console.warn(`[WsManager] channel "${channel}" not connected. Call connect() first.`)
      return () => {}
    }
    state.handlers.add(handler)
    return () => state.handlers.delete(handler)
  }

  send(channel: string, data: unknown): void {
    const state = this.channels.get(channel)
    if (state?.status === 'connected') {
      state.worker.postMessage({ type: 'send', data: JSON.stringify(data) })
    }
  }

  status(channel: string): WsStatus {
    return this.channels.get(channel)?.status ?? 'disconnected'
  }

  disconnect(channel: string): void {
    const state = this.channels.get(channel)
    if (state) {
      state.worker.postMessage({ type: 'close' })
      state.worker.terminate()
      this.channels.delete(channel)
    }
  }
}
```

- [ ] **Step 2: 提交**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/lib/ws/browser.ts
git commit -m "feat(tauri): add BrowserWsManager using Web Worker + ws-core WASM"
```

---

### Task 7: TauriWsManager（Tauri emit/listen 实现）

**Files:**
- Create: `tauri/src/lib/ws/tauri-ws.ts`

- [ ] **Step 1: 创建 TauriWsManager**

```typescript
// tauri/src/lib/ws/tauri-ws.ts
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { AiStreamEvent, Unsubscribe, WsManager, WsStatus } from './types'

interface ChannelState {
  status: WsStatus
  handlers: Set<(event: AiStreamEvent) => void>
  unlisten?: UnlistenFn
}

/**
 * Tauri 桌面环境的 WsManager 实现
 * WebSocket 连接由 Rust 层（src-tauri/src/ws/）管理
 * Rust 通过 tauri::emit 向 WebView 推送事件，JS 通过 listen() 接收
 */
export class TauriWsManager implements WsManager {
  private channels = new Map<string, ChannelState>()

  connect(channel: string, _url: string): void {
    if (this.channels.has(channel)) return

    const state: ChannelState = {
      status: 'disconnected',
      handlers: new Set(),
    }
    this.channels.set(channel, state)

    // 监听 Rust 层推送的事件
    listen<string>(`ws:${channel}`, (tauriEvent) => {
      try {
        const event: AiStreamEvent = typeof tauriEvent.payload === 'string'
          ? JSON.parse(tauriEvent.payload)
          : tauriEvent.payload
        state.handlers.forEach((h) => h(event))
      } catch (err) {
        console.error(`[TauriWsManager] parse error on channel "${channel}"`, err)
      }
    }).then((unlisten) => {
      state.unlisten = unlisten
    })

    // 通知 Rust 层建立 WebSocket 连接
    emit(`ws:connect:${channel}`, { channel }).catch(console.error)
    state.status = 'reconnecting'
  }

  subscribe(channel: string, handler: (event: AiStreamEvent) => void): Unsubscribe {
    const state = this.channels.get(channel)
    if (!state) {
      console.warn(`[TauriWsManager] channel "${channel}" not connected.`)
      return () => {}
    }
    state.handlers.add(handler)
    return () => state.handlers.delete(handler)
  }

  send(channel: string, data: unknown): void {
    emit(`ws:send:${channel}`, { data: JSON.stringify(data) }).catch(console.error)
  }

  status(channel: string): WsStatus {
    return this.channels.get(channel)?.status ?? 'disconnected'
  }

  disconnect(channel: string): void {
    const state = this.channels.get(channel)
    if (state) {
      state.unlisten?.()
      emit(`ws:disconnect:${channel}`, {}).catch(console.error)
      this.channels.delete(channel)
    }
  }
}
```

- [ ] **Step 2: 提交**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/lib/ws/tauri-ws.ts
git commit -m "feat(tauri): add TauriWsManager using Rust emit/listen"
```

---

### Task 8: WsManager 统一入口（自动选择实现）

**Files:**
- Create: `tauri/src/lib/ws/index.ts`

- [ ] **Step 1: 创建统一入口**

```typescript
// tauri/src/lib/ws/index.ts
import { isTauri } from '../tauri'
import { BrowserWsManager } from './browser'
import { TauriWsManager } from './tauri-ws'
import type { WsManager } from './types'

// ws-core Web Worker 脚本路径（Vite 会正确处理此 URL）
// ws-worker.js 和 WASM 产物需要放到 tauri/public/ws-core/ 目录
const WS_WORKER_URL = '/ws-core/ws-worker.js'

/**
 * 全局 WsManager 单例
 * 运行时自动选择：Tauri 桌面 → TauriWsManager，浏览器 → BrowserWsManager
 * 所有组件通过此单例订阅 WebSocket 事件，无需关心底层实现
 */
export const wsManager: WsManager = isTauri()
  ? new TauriWsManager()
  : new BrowserWsManager(WS_WORKER_URL)

// 重新导出类型，方便其他模块使用
export type { AiStreamEvent, WsManager, WsStatus, Unsubscribe } from './types'
```

- [ ] **Step 2: 提交**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/lib/ws/index.ts
git commit -m "feat(tauri): add wsManager singleton with auto platform detection"
```

---

### Task 9: WindowBus（多窗口通信）

**Files:**
- Create: `tauri/src/lib/window-bus/types.ts`
- Create: `tauri/src/lib/window-bus/broadcast.ts`
- Create: `tauri/src/lib/window-bus/tauri-bus.ts`
- Create: `tauri/src/lib/window-bus/index.ts`

- [ ] **Step 1: 创建 types.ts**

```typescript
// tauri/src/lib/window-bus/types.ts
export type WindowBusHandler = (data: unknown) => void
export type Unsubscribe = () => void

/**
 * 跨窗口/Tab 通信接口
 * 浏览器实现：BroadcastChannel
 * Tauri 实现：@tauri-apps/api/event emit_all
 *
 * 典型用途：多 tab 登录同步、主题同步
 */
export interface WindowBus {
  emit(event: string, data: unknown): void
  on(event: string, handler: WindowBusHandler): Unsubscribe
}
```

- [ ] **Step 2: 创建 broadcast.ts（浏览器 BroadcastChannel 实现）**

```typescript
// tauri/src/lib/window-bus/broadcast.ts
import type { WindowBus, WindowBusHandler, Unsubscribe } from './types'

export class BroadcastWindowBus implements WindowBus {
  private channel: BroadcastChannel

  constructor(channelName = 'tc-app') {
    this.channel = new BroadcastChannel(channelName)
  }

  emit(event: string, data: unknown): void {
    this.channel.postMessage({ event, data })
  }

  on(event: string, handler: WindowBusHandler): Unsubscribe {
    const listener = (e: MessageEvent) => {
      if (e.data?.event === event) handler(e.data.data)
    }
    this.channel.addEventListener('message', listener)
    return () => this.channel.removeEventListener('message', listener)
  }
}
```

- [ ] **Step 3: 创建 tauri-bus.ts（Tauri Event 实现）**

```typescript
// tauri/src/lib/window-bus/tauri-bus.ts
import { emit as tauriEmit, listen } from '@tauri-apps/api/event'
import type { WindowBus, WindowBusHandler, Unsubscribe } from './types'

export class TauriWindowBus implements WindowBus {
  emit(event: string, data: unknown): void {
    tauriEmit(`bus:${event}`, data).catch(console.error)
  }

  on(event: string, handler: WindowBusHandler): Unsubscribe {
    let unlisten: (() => void) | undefined
    listen<unknown>(`bus:${event}`, (e) => handler(e.payload))
      .then((fn) => { unlisten = fn })
      .catch(console.error)
    return () => unlisten?.()
  }
}
```

- [ ] **Step 4: 创建统一入口 index.ts**

```typescript
// tauri/src/lib/window-bus/index.ts
import { isTauri } from '../tauri'
import { BroadcastWindowBus } from './broadcast'
import { TauriWindowBus } from './tauri-bus'
import type { WindowBus } from './types'

export const windowBus: WindowBus = isTauri()
  ? new TauriWindowBus()
  : new BroadcastWindowBus()

export type { WindowBus, WindowBusHandler } from './types'
```

- [ ] **Step 5: 提交**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/lib/window-bus/
git commit -m "feat(tauri): add WindowBus for cross-window auth/state sync"
```

---

### Task 10: Zustand Stores

**Files:**
- Create: `tauri/src/lib/store/app.ts`
- Create: `tauri/src/lib/store/auth.ts`
- Create: `tauri/src/lib/store/sessions.ts`
- Create: `tauri/src/lib/store/tasks.ts`

- [ ] **Step 1: 创建 app store（全局 UI 状态）**

```typescript
// tauri/src/lib/store/app.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'dark' | 'light' | 'system'

interface AppStore {
  theme: Theme
  sidebarCollapsed: boolean
  activeProjectId: string | null
  setTheme(theme: Theme): void
  setSidebarCollapsed(collapsed: boolean): void
  setActiveProjectId(id: string | null): void
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      theme: 'dark',
      sidebarCollapsed: false,
      activeProjectId: null,
      setTheme: (theme) => set({ theme }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setActiveProjectId: (id) => set({ activeProjectId: id }),
    }),
    { name: 'tc-app-settings' }
  )
)
```

- [ ] **Step 2: 创建 auth store（认证状态 + 多窗口同步）**

```typescript
// tauri/src/lib/store/auth.ts
import { create } from 'zustand'
import { windowBus } from '../window-bus'

interface AuthStore {
  token: string | null
  /** 登录：保存 token，广播给其他窗口 */
  login(token: string): void
  /** 登出：清除 token，广播给其他窗口 */
  logout(): void
  /** 内部使用：其他窗口广播过来时静默同步，不再广播 */
  _syncFrom(token: string | null): void
}

export const useAuthStore = create<AuthStore>()((set) => ({
  token: localStorage.getItem('tc_token'),

  login(token) {
    localStorage.setItem('tc_token', token)
    set({ token })
    windowBus.emit('auth_changed', { token })
  },

  logout() {
    localStorage.removeItem('tc_token')
    set({ token: null })
    windowBus.emit('auth_changed', { token: null })
  },

  _syncFrom(token) {
    if (token) localStorage.setItem('tc_token', token)
    else localStorage.removeItem('tc_token')
    set({ token })
  },
}))

// 监听其他窗口的 auth 变化（应用启动时调用一次）
export function initAuthSync() {
  return windowBus.on('auth_changed', (data) => {
    const { token } = data as { token: string | null }
    useAuthStore.getState()._syncFrom(token)
  })
}
```

- [ ] **Step 3: 创建 sessions store（实时会话状态）**

```typescript
// tauri/src/lib/store/sessions.ts
import { create } from 'zustand'
import type { AiStreamEvent } from '../ws/types'

export interface AiSession {
  session_id: string
  provider: string
  last_event_ts: string
  event_count: number
}

interface SessionStore {
  sessions: AiSession[]
  events: Record<string, AiStreamEvent[]>
  /** WS 推送新事件时调用 */
  update(event: AiStreamEvent): void
  clearSession(sessionId: string): void
}

export const useSessionStore = create<SessionStore>()((set) => ({
  sessions: [],
  events: {},

  update(event) {
    set((state) => {
      // 更新或插入会话摘要
      const existing = state.sessions.find((s) => s.session_id === event.session_id)
      const sessions = existing
        ? state.sessions.map((s) =>
            s.session_id === event.session_id
              ? { ...s, last_event_ts: event.ts, event_count: s.event_count + 1 }
              : s
          )
        : [
            ...state.sessions,
            {
              session_id: event.session_id,
              provider: event.provider,
              last_event_ts: event.ts,
              event_count: 1,
            },
          ]

      // 追加事件（保留最近 200 条）
      const prev = state.events[event.session_id] ?? []
      const next = [...prev, event].slice(-200)

      return {
        sessions,
        events: { ...state.events, [event.session_id]: next },
      }
    })
  },

  clearSession(sessionId) {
    set((state) => ({
      sessions: state.sessions.filter((s) => s.session_id !== sessionId),
      events: Object.fromEntries(
        Object.entries(state.events).filter(([k]) => k !== sessionId)
      ),
    }))
  },
}))
```

- [ ] **Step 4: 创建 tasks store（日志缓冲 + TanStack Query 联动）**

```typescript
// tauri/src/lib/store/tasks.ts
import { create } from 'zustand'

interface TaskStore {
  activeTaskId: string | null
  /** taskId → 日志行数组（最近 1000 行） */
  logBuffer: Record<string, string[]>
  setActiveTaskId(id: string | null): void
  appendLog(taskId: string, line: string): void
  clearLogs(taskId: string): void
}

export const useTaskStore = create<TaskStore>()((set) => ({
  activeTaskId: null,
  logBuffer: {},

  setActiveTaskId: (id) => set({ activeTaskId: id }),

  appendLog(taskId, line) {
    set((state) => {
      const prev = state.logBuffer[taskId] ?? []
      return {
        logBuffer: {
          ...state.logBuffer,
          [taskId]: [...prev, line].slice(-1000),
        },
      }
    })
  },

  clearLogs(taskId) {
    set((state) => {
      const { [taskId]: _, ...rest } = state.logBuffer
      return { logBuffer: rest }
    })
  },
}))

// WS 推送任务状态变更时，联动 invalidate TanStack Query 缓存：
// wsEvent 'task_status_change' → queryClient.invalidateQueries({ queryKey: ['tasks', taskId] })
// 在使用处（features/tasks/hooks/）实现，不在 store 中耦合 queryClient
```

- [ ] **Step 5: 提交**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/lib/store/
git commit -m "feat(tauri): add Zustand stores (app/auth/sessions/tasks) with WindowBus auth sync"
```

---

### Task 11: API Adapter

**Files:**
- Create: `tauri/src/lib/api/types.ts`
- Create: `tauri/src/lib/api/http.ts`
- Create: `tauri/src/lib/api/index.ts`

- [ ] **Step 1: 创建 api/types.ts（核心数据模型）**

```typescript
// tauri/src/lib/api/types.ts

export type ApiMode = 'remote-http' | 'local-http' | 'tauri-ipc'

// ---- 核心数据模型 ----

export interface Project {
  id: number
  name: string
  description: string | null
  created_at: string
}

export interface Task {
  id: number
  project_id: number
  title: string
  description: string | null
  current_stage: string
  status: string
  created_at: string
  provider?: string  // 预留多 AI 扩展
}

export interface StageArtifact {
  id: number
  task_id: number
  stage: string
  content: string
  created_at: string
}

export interface AiSession {
  session_id: string
  provider: string
  event_count: number
  started_at: string
  last_event_at: string
}

// ---- 接口抽象 ----

export interface ApiAdapter {
  // 项目
  getProjects(): Promise<Project[]>
  createProject(data: { name: string; description?: string }): Promise<Project>

  // 任务
  getTasks(projectId: number): Promise<Task[]>
  getTask(taskId: number): Promise<Task>
  createTask(projectId: number, data: { title: string; description?: string }): Promise<Task>
  approveTask(taskId: number, data: { action: 'approve' | 'reject'; reason?: string }): Promise<void>
  advanceTask(taskId: number): Promise<void>

  // 会话
  getSessions(): Promise<AiSession[]>

  // 健康检查
  healthCheck(): Promise<boolean>
}
```

- [ ] **Step 2: 创建 api/http.ts（HTTP 实现）**

```typescript
// tauri/src/lib/api/http.ts
import type { ApiAdapter, ApiMode, Project, Task, AiSession, StageArtifact } from './types'

function getStoredTunnelUrl(): string {
  return localStorage.getItem('tc_tunnel_url') ?? 'http://localhost:8765'
}

export class HttpAdapter implements ApiAdapter {
  private baseUrl: string

  constructor(mode: ApiMode) {
    this.baseUrl = mode === 'local-http'
      ? ''  // Vite proxy 处理，相对路径即可
      : getStoredTunnelUrl()
  }

  private headers(): HeadersInit {
    const token = localStorage.getItem('tc_token')
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
  }

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers(), ...init?.headers },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`HTTP ${res.status}: ${text}`)
    }
    return res.json() as Promise<T>
  }

  getProjects() {
    return this.fetch<Project[]>('/api/projects')
  }

  createProject(data: { name: string; description?: string }) {
    return this.fetch<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  getTasks(projectId: number) {
    return this.fetch<Task[]>(`/api/projects/${projectId}/tasks`)
  }

  getTask(taskId: number) {
    return this.fetch<Task>(`/api/tasks/${taskId}`)
  }

  createTask(projectId: number, data: { title: string; description?: string }) {
    return this.fetch<Task>(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  approveTask(taskId: number, data: { action: 'approve' | 'reject'; reason?: string }) {
    return this.fetch<void>(`/api/tasks/${taskId}/approve`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  advanceTask(taskId: number) {
    return this.fetch<void>(`/api/tasks/${taskId}/advance`, { method: 'POST' })
  }

  getSessions() {
    return this.fetch<AiSession[]>('/api/sessions')
  }

  async healthCheck() {
    try {
      await fetch(`${this.baseUrl}/health`)
      return true
    } catch {
      return false
    }
  }
}
```

- [ ] **Step 3: 创建 api/index.ts（统一入口）**

```typescript
// tauri/src/lib/api/index.ts
import { isTauri } from '../tauri'
import { HttpAdapter } from './http'
import type { ApiAdapter, ApiMode } from './types'

function detectMode(): ApiMode {
  // isTauri() 必须最先检测，避免 location.hostname 在 Tauri 中的误判
  if (isTauri()) return 'tauri-ipc'
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return 'local-http'
  return 'remote-http'
}

/**
 * 全局 API 单例
 * 现阶段所有模式均使用 HttpAdapter（通过 fetch）
 * Tauri IPC 模式预留：未来可替换为 TauriAdapter（通过 invoke）
 */
export const api: ApiAdapter = new HttpAdapter(detectMode())

export type { ApiAdapter, ApiMode, Project, Task, AiSession, StageArtifact } from './types'
```

- [ ] **Step 4: 提交**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/lib/api/
git commit -m "feat(tauri): add HttpAdapter with auto mode detection (local/remote/tauri)"
```

---

## Chunk 3: 国际化 + 路由 + 布局框架

### Task 12: 国际化配置

**Files:**
- Create: `tauri/src/i18n/en.json`
- Create: `tauri/src/i18n/zh.json`
- Create: `tauri/src/i18n/index.ts`

- [ ] **Step 1: 创建翻译文件**

```json
// tauri/src/i18n/zh.json
{
  "common": {
    "loading": "加载中...",
    "error": "出错了",
    "retry": "重试",
    "cancel": "取消",
    "confirm": "确认",
    "save": "保存",
    "delete": "删除",
    "create": "创建",
    "back": "返回"
  },
  "nav": {
    "dashboard": "仪表盘",
    "sessions": "会话监控",
    "chat": "对话",
    "settings": "设置"
  },
  "auth": {
    "title": "TaskConductor",
    "pin_label": "访问码",
    "pin_placeholder": "输入 6 位访问码",
    "login_btn": "登录",
    "connecting": "连接中...",
    "error_invalid_pin": "访问码错误"
  }
}
```

```json
// tauri/src/i18n/en.json
{
  "common": {
    "loading": "Loading...",
    "error": "Something went wrong",
    "retry": "Retry",
    "cancel": "Cancel",
    "confirm": "Confirm",
    "save": "Save",
    "delete": "Delete",
    "create": "Create",
    "back": "Back"
  },
  "nav": {
    "dashboard": "Dashboard",
    "sessions": "Sessions",
    "chat": "Chat",
    "settings": "Settings"
  },
  "auth": {
    "title": "TaskConductor",
    "pin_label": "Access Code",
    "pin_placeholder": "Enter 6-digit code",
    "login_btn": "Login",
    "connecting": "Connecting...",
    "error_invalid_pin": "Invalid access code"
  }
}
```

- [ ] **Step 2: 创建 i18n/index.ts（初始化 react-i18next）**

```typescript
// tauri/src/i18n/index.ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zh from './zh.json'
import en from './en.json'

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: localStorage.getItem('tc_language') ?? 'zh',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
```

- [ ] **Step 3: 提交**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/i18n/
git commit -m "feat(tauri): add i18n config with zh/en translations"
```

---

### Task 13: 路由 + 布局 + Provider

**Files:**
- Create: `tauri/src/app/Router.tsx`
- Create: `tauri/src/app/Layout.tsx`
- Create: `tauri/src/app/Providers.tsx`
- Create: `tauri/src/app/PageLoading.tsx`

- [ ] **Step 1: 创建 PageLoading.tsx（全屏加载占位）**

```typescript
// tauri/src/app/PageLoading.tsx
export function PageLoading() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
    </div>
  )
}
```

- [ ] **Step 2: 创建 Layout.tsx（三栏布局占位）**

```typescript
// tauri/src/app/Layout.tsx
import { Outlet } from 'react-router-dom'

/**
 * 主布局：三栏结构（Sidebar + Main + 可选右侧面板）
 * 当前为占位实现，侧栏将在后续 Task 中完善
 */
export function Layout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* 左侧导航占位 */}
      <aside className="w-56 shrink-0 border-r border-border bg-background-secondary">
        <div className="p-4 text-sm text-muted-foreground">Sidebar</div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 3: 创建 Router.tsx（懒加载路由）**

```typescript
// tauri/src/app/Router.tsx
import { lazy, Suspense } from 'react'
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { isTauri } from '../lib/tauri'
import { Layout } from './Layout'
import { PageLoading } from './PageLoading'

// 路由级懒加载（每个 feature 独立 chunk）
const AuthPage         = lazy(() => import('../features/auth'))
const DashboardPage    = lazy(() => import('../features/dashboard'))

// 其他页面：占位，后续 Plan 中实现
const PlaceholderPage = lazy(() =>
  Promise.resolve({ default: () => <div className="p-8 text-muted-foreground">Coming soon</div> })
)

const RouterComponent = isTauri() ? HashRouter : BrowserRouter

export function AppRouter() {
  return (
    <RouterComponent>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          {/* 登录页（不含 Layout） */}
          <Route path="/login" element={<AuthPage />} />

          {/* 主应用（含 Layout 三栏布局） */}
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/tasks/:id"    element={<PlaceholderPage />} />
            <Route path="/task-manager" element={<PlaceholderPage />} />
            <Route path="/sessions"     element={<PlaceholderPage />} />
            <Route path="/chat"         element={<PlaceholderPage />} />
            <Route path="/config"       element={<PlaceholderPage />} />
            <Route path="/knowledge"    element={<PlaceholderPage />} />
            <Route path="/mcp"          element={<PlaceholderPage />} />
            <Route path="/files"        element={<PlaceholderPage />} />
            <Route path="/git"          element={<PlaceholderPage />} />
            <Route path="/canvas"       element={<PlaceholderPage />} />
            <Route path="/settings"     element={<PlaceholderPage />} />
          </Route>

          {/* 未知路径重定向 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </RouterComponent>
  )
}
```

- [ ] **Step 4: 创建 Providers.tsx（全局 Provider 组装）**

```typescript
// tauri/src/app/Providers.tsx
import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { initAuthSync } from '../lib/store/auth'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,      // 30s 内不重复请求
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
})

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // 启动多窗口 auth 同步监听
    const unsub = initAuthSync()
    return unsub
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
```

- [ ] **Step 5: 更新 src/main.tsx（入口文件）**

```typescript
// tauri/src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { AppRouter } from './app/Router'
import { Providers } from './app/Providers'
import './i18n'         // 初始化 i18n
import './index.css'    // Tailwind 全局样式

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Providers>
      <AppRouter />
    </Providers>
  </React.StrictMode>
)
```

- [ ] **Step 6: 提交**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/app/ tauri/src/main.tsx
git commit -m "feat(tauri): add Router, Layout, Providers - app shell complete"
```

---

## Chunk 4: Auth 页面 + 可运行验证

### Task 14: 实现 Auth 登录页

**Files:**
- Create: `tauri/src/features/auth/index.tsx`

- [ ] **Step 1: 创建登录页**

```typescript
// tauri/src/features/auth/index.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../lib/store/auth'

export default function AuthPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { login } = useAuthStore()

  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // localhost 模式：免密自动认证
      if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        const res = await fetch('/auth/local', { method: 'POST' })
        if (res.ok) {
          const data = await res.json()
          login(data.token)
          navigate('/')
          return
        }
      }

      // PIN 认证
      const res = await fetch('/auth/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })

      if (!res.ok) {
        setError(t('auth.error_invalid_pin'))
        return
      }

      const data = await res.json()
      login(data.token)
      navigate('/')
    } catch {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="w-80 rounded-xl border border-border bg-background-secondary p-8">
        <h1 className="mb-6 text-center text-2xl font-semibold text-foreground">
          {t('auth.title')}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm text-muted-foreground">
              {t('auth.pin_label')}
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder={t('auth.pin_placeholder')}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? t('auth.connecting') : t('auth.login_btn')}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 创建 Dashboard 占位页（避免路由 404）**

```typescript
// tauri/src/features/dashboard/index.tsx
export default function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">P2 阶段实现</p>
    </div>
  )
}
```

- [ ] **Step 3: 提交**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/features/auth/ tauri/src/features/dashboard/
git commit -m "feat(tauri): add Auth login page and Dashboard placeholder"
```

---

### Task 15: 更新 Cargo workspace + 验证可运行

**Files:**
- Modify: `Cargo.toml`（根目录，添加 src-tauri）

- [ ] **Step 1: 将 tauri/src-tauri 添加到 Cargo workspace**

```toml
# Cargo.toml（根目录）
[workspace]
members = [
    "ws-core",
    "tauri/src-tauri",
]
resolver = "2"
```

- [ ] **Step 2: 启动 Web 开发服务器验证**

```bash
cd /home/sichengli/Documents/code2/task-conductor/tauri
npm run dev
```

打开浏览器访问 http://localhost:7071

预期：看到登录页面，无控制台 JS 报错

- [ ] **Step 3: 验证 TypeScript 编译无错误**

```bash
cd /home/sichengli/Documents/code2/task-conductor/tauri
npx tsc --noEmit
```

预期：无报错输出

- [ ] **Step 4: 提交**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add Cargo.toml
git commit -m "chore: add tauri/src-tauri to Cargo workspace"
```

---

**P1 完成标志：**
- `cd tauri && npm run dev` 启动成功，http://localhost:7071 显示登录页
- `npx tsc --noEmit` 无 TypeScript 错误
- 所有 lib 模块（ws、window-bus、store、api）文件存在
- git log 显示每步独立提交
