# 平台抽象层

## 概览

应用同时支持 Web 浏览器和 Tauri 桌面两种运行环境。通过抽象接口 + 平台检测 + 运行时选择实现一套代码双端运行。

```
isTauri() → true                    isTauri() → false
  ├ API:       tauri-ipc (TODO)       ├ API:       HttpAdapter (fetch)
  ├ WebSocket: TauriWsManager         ├ WebSocket: BrowserWsManager
  ├ WindowBus: TauriWindowBus         ├ WindowBus: BroadcastWindowBus
  └ Router:    HashRouter             └ Router:    BrowserRouter
```

## 平台检测

```typescript
// lib/tauri.ts
export function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI__
}
```

## API 适配器

### 接口定义 (`lib/api/types.ts`)

```typescript
interface ApiAdapter {
  getProjects(): Promise<Project[]>
  createProject(name: string, description?: string): Promise<Project>
  getTasks(projectId: string): Promise<Task[]>
  getTask(taskId: string): Promise<Task>
  createTask(projectId: string, title: string, description?: string): Promise<Task>
  approveTask(taskId: string, action: string, reason?: string): Promise<void>
  advanceTask(taskId: string): Promise<void>
  getSessions(): Promise<AiSession[]>
  healthCheck(): Promise<boolean>
}
```

### HTTP 实现 (`lib/api/http.ts`)

- Bearer token 鉴权（从 localStorage 读取 `tc_token`）
- 支持 Tunnel URL（localStorage `tc_tunnel_url`，用于远程访问）
- fetch 封装，非 2xx 响应抛出 Error

### 模式检测 (`lib/api/index.ts`)

```typescript
mode = isTauri() ? 'tauri-ipc' : isLocalhost ? 'local-http' : 'remote-http'
```

## WebSocket 管理器

### 接口定义 (`lib/ws/types.ts`)

```typescript
interface WsManager {
  subscribe(channel: string, handler: (event: AiStreamEvent) => void): () => void
  send(channel: string, data: unknown): void
  status(channel: string): WsStatus
  connect(channel: string, url: string): void
  disconnect(channel: string): void
}
```

### Browser 实现 (`lib/ws/browser.ts`)

使用 Web Worker 在后台线程管理 WebSocket 连接：

```
主线程                    Web Worker
  │                         │
  ├─ postMessage(connect) →─┤ new WebSocket(url)
  │                         │
  │ ← onmessage(event) ──┤ ws.onmessage
  │                         │
  ├─ postMessage(send) ───→─┤ ws.send(data)
  │                         │
  ├─ postMessage(close) ──→─┤ ws.close()
```

### Tauri 实现 (`lib/ws/tauri-ws.ts`)

使用 `@tauri-apps/api/event` 的事件系统：

- `connect()` → `listen('ws:{channel}', handler)`
- `send()` → `emit('ws:send:{channel}', data)`
- `disconnect()` → `unlisten()`

## 跨窗口通信（WindowBus）

### 接口定义 (`lib/window-bus/types.ts`)

```typescript
interface WindowBus {
  emit(event: string, data?: unknown): void
  on(event: string, handler: (data: unknown) => void): () => void
}
```

### Browser 实现 → `BroadcastChannel('tc-app')`

### Tauri 实现 → `emit('bus:{event}')` / `listen('bus:{event}')`

### 用途

目前仅用于 Auth 跨窗口同步：当一个窗口登录/登出时，其他窗口自动同步状态。

## 路由

```typescript
const RouterComponent = isTauri() ? HashRouter : BrowserRouter
```

Tauri 使用 HashRouter 因为桌面应用没有服务端路由，`file://` 协议下 BrowserRouter 不工作。
