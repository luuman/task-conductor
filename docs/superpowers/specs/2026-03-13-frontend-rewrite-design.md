# TaskConductor 前端重写设计文档

**日期**：2026-03-13
**状态**：待实现
**范围**：前端完整重写 + Tauri 桌面端基础架构 + 共用 Rust WebSocket 核心

---

## 一、背景与目标

### 问题

现有前端代码库存在以下问题：
- 组件过于庞大（单文件 500-1000+ 行），难以维护和理解
- 状态管理混乱（prop drilling + 分散的 localStorage）
- 没有服务端状态缓存，每次切页都重新 fetch
- 与 Claude 深度耦合，未来接入其他 AI 需要大量改动
- 没有桌面端架构预留，迁移 Tauri 成本高

### 目标

1. 从零重写前端，feature-based 结构，每个模块独立可理解
2. 搭建 Tauri 桌面端基础框架，与 Web 共用一个仓库
3. 用 Rust 实现共用的 WebSocket 核心（ws-core），编译为 WASM（浏览器 Web Worker）和原生库（Tauri tokio），防止消息阻塞 UI
4. 预留多 AI Provider 扩展点，现阶段只实现 Claude

---

## 二、技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 前端框架 | React 19 + Vite + TypeScript | 保持现有熟悉度 |
| UI 组件 | shadcn/ui（基于 Radix UI） | 高质量预制组件，完全可定制 |
| 样式 | Tailwind CSS 4 | 原子化 CSS（已在 package.json 中） |
| 服务端状态 | TanStack Query | API 数据缓存 + 后台刷新 |
| 客户端状态 | Zustand | 轻量全局 UI 状态 |
| 路由 | React Router v6 | 生态成熟；Tauri 使用 HashRouter |
| WebSocket 核心 | Rust（ws-core crate） | WASM + Web Worker（浏览器）/ tokio（Tauri）|
| 桌面端 | Tauri 2.x | WebView 壳 + Rust 系统层 |
| 国际化 | react-i18next | 保留 en/zh 双语支持 |

---

## 三、仓库结构

```
task-conductor/
├── backend/                  # Python FastAPI（不动）
│
├── frontend/                 # 旧前端（不动，仅作参考）
│
├── tauri/                    # 新前端 + Tauri 桌面端（一体，所有新开发在此）
│   ├── src/                  # React 前端代码（feature-based）
│   │   ├── features/
│   │   │   ├── dashboard/           # KPI、项目列表、周报
│   │   │   ├── tasks/               # 任务流水线详情、审批
│   │   │   ├── task-manager/        # 任务收件箱
│   │   │   ├── sessions/            # Claude 会话监控
│   │   │   ├── conversation-history/# 对话历史
│   │   │   ├── claude-config/       # Hooks、MCP、rules、commands 管理
│   │   │   ├── knowledge/           # 项目知识库
│   │   │   ├── mcp-market/          # MCP 市场
│   │   │   ├── project-files/       # 项目文件浏览
│   │   │   ├── git/                 # Git 操作面板
│   │   │   ├── canvas/              # 项目看板
│   │   │   ├── chat/                # 交互式 AI 对话（/ws/chat）
│   │   │   ├── settings/            # 应用设置、连接配置
│   │   │   └── auth/                # PIN 登录、token 管理
│   │   ├── components/ui/           # shadcn 纯 UI 组件（无业务逻辑）
│   │   ├── lib/
│   │   │   ├── api/                 # HTTP Adapter（HttpAdapter 实现）
│   │   │   ├── ws/                  # WsManager 接口 + BrowserWsManager + TauriWsManager
│   │   │   ├── store/               # Zustand store slices
│   │   │   ├── tauri.ts             # isTauri() 工具函数 + 类型声明
│   │   │   └── utils.ts
│   │   ├── app/                     # 路由定义、布局、全局 Provider
│   │   └── i18n/                    # en.json / zh.json 翻译文件
│   ├── public/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts               # 含 @vitejs/plugin-wasm，dev 代理 :8765
│   └── src-tauri/                   # Rust Tauri 代码
│       ├── src/
│       │   ├── main.rs
│       │   ├── ws/                  # Tauri WS 命令（调用 ws-core 原生库）
│       │   └── api/                 # Tauri IPC 命令（预留，现阶段空实现）
│       └── Cargo.toml               # 依赖 ws-core 本地 crate
│
├── ws-core/                  # 共用 Rust WebSocket 核心（新建）
│   ├── src/
│   │   ├── lib.rs            # 公共接口 + wasm_bindgen exports
│   │   ├── manager.rs        # 订阅管理、重连状态机
│   │   ├── message.rs        # AiStreamEvent 消息格式（serde）
│   │   └── transport/
│   │       ├── browser.rs    # cfg(wasm32)：web-sys WebSocket + js_sys::Function 回调
│   │       └── native.rs     # cfg(not(wasm32))：tokio-tungstenite
│   ├── ws-worker.js          # Web Worker 入口（加载 WASM，中转 postMessage）
│   └── Cargo.toml
│
└── Cargo.toml                # workspace root（ws-core + tauri/src-tauri）
```

**关键说明**：
- `tauri/` 同时服务两个运行模式：
  - **Web 模式**：`npm run dev` → Vite dev server → 浏览器访问，WS 走 BrowserWsManager（WASM + Web Worker）
  - **桌面模式**：`tauri dev` / `tauri build` → Tauri WebView，WS 走 TauriWsManager（Rust tokio）
- 两种模式共用 100% 的 React 组件代码，仅 `lib/ws/` 和 `lib/api/` 运行时切换实现

---

## 四、WebSocket 架构（P0 优先实现）

### 整体数据流

```
后端 FastAPI WS
      ↓
┌─────────────────────────────────────────┐
│            浏览器场景                    │
│  Web Worker（独立线程）                  │
│  └── ws-core WASM                       │
│       ├── web-sys WebSocket             │
│       ├── 消息解析（serde_json）         │
│       └── 重连状态机                    │
│              ↓ postMessage              │
│  主线程（UI 线程）                       │
│  └── BrowserWsManager.onmessage         │
│       └── Zustand store.update          │
│            ↓ React re-render            │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│            Tauri 场景                   │
│  tokio async task（独立线程）           │
│  └── ws-core native                     │
│       ├── tokio-tungstenite WS          │
│       ├── 消息解析（serde_json）         │
│       └── 重连状态机                    │
│              ↓ tauri::emit              │
│  WebView JS                             │
│  └── TauriWsManager（listen）           │
│       └── Zustand store.update          │
└─────────────────────────────────────────┘
```

### ws-core 核心接口（WASM export）

```rust
// ws-core/src/lib.rs
#[wasm_bindgen]
pub struct WsHandle {
    // 内部持有连接状态，不暴露 Fn trait（WASM 不兼容）
}

#[wasm_bindgen]
impl WsHandle {
    /// 建立连接，消息通过 on_message_cb JS 回调接收
    #[wasm_bindgen(constructor)]
    pub fn new(url: &str, on_message_cb: &js_sys::Function) -> WsHandle { ... }

    /// 发送消息（支持双向，如 chat 功能）
    pub fn send(&self, data: &str) -> Result<(), JsValue> { ... }

    /// 主动断开
    pub fn close(&self) { ... }
}
```

**WASM 兼容说明**：不使用 `Box<dyn Fn(...)>`，改用 `js_sys::Function` 回调，避免 WASM 不支持 trait object 的问题。

### Web Worker 胶水层（ws-worker.js）

```javascript
// ws-core/ws-worker.js
import init, { WsHandle } from './pkg/ws_core.js'

let handle = null

self.onmessage = async (e) => {
  const { type, url, data } = e.data
  if (type === 'connect') {
    await init()
    handle = new WsHandle(url, (msg) => {
      self.postMessage({ type: 'message', payload: msg })
    })
  }
  if (type === 'send' && handle) handle.send(data)
  if (type === 'close' && handle) handle.close()
}
```

### 前端统一接口（TypeScript）

```typescript
// lib/ws/types.ts
export interface WsManager {
  subscribe(channel: string, handler: (event: AiStreamEvent) => void): () => void
  send(channel: string, data: unknown): void
  status(channel: string): 'connected' | 'disconnected' | 'reconnecting'
}

// lib/ws/index.ts — 自动选择实现
export const ws: WsManager = window.__TAURI__
  ? new TauriWsManager()    // Tauri：调用 listen/emit
  : new BrowserWsManager()  // Web：调用 Web Worker + ws-core WASM
```

### 统一消息格式（provider-agnostic）

```typescript
// lib/ws/types.ts
export interface AiStreamEvent {
  event_type: string        // "tool_call" | "chunk" | "done" | "session_update"
  provider: string          // "claude"（现阶段）| "openai"（预留）
  session_id: string
  payload: unknown
  ts: string
}
```

---

## 五、API 适配器

### 模式探测

```typescript
// lib/api/index.ts
type ApiMode = 'remote-http' | 'local-http' | 'tauri-ipc'

function detectMode(): ApiMode {
  if (window.__TAURI__) return 'tauri-ipc'
  if (location.hostname === 'localhost') return 'local-http'
  return 'remote-http'
}

export const api: ApiAdapter = new HttpAdapter(detectMode())
// TauriAdapter 预留，Tauri 阶段填充
```

### 认证 & Token 注入

```typescript
// lib/api/http.ts
class HttpAdapter {
  private baseUrl: string

  constructor(mode: ApiMode) {
    this.baseUrl = mode === 'local-http'
      ? 'http://localhost:8765'
      : getStoredTunnelUrl()  // 从 localStorage 读取远程地址
  }

  private headers(): HeadersInit {
    const token = localStorage.getItem('tc_token')
    return token ? { Authorization: `Bearer ${token}` } : {}
  }
}
```

**认证模式**：
- `localhost` → 自动免密（`POST /auth/local`）
- 远程 tunnel → PIN 输入 → `POST /auth/pin` → 存 Bearer token

---

## 六、路由设计

路由库使用 **React Router v6**（语法更简洁，生态成熟）。Tauri 使用 `HashRouter`，Web 使用 `BrowserRouter`。

```typescript
// app/Router.tsx
import { lazy, Suspense } from 'react'
import { BrowserRouter, HashRouter, Routes, Route } from 'react-router-dom'
import { isTauri } from '../lib/tauri'

// 路由级懒加载（每个 feature 独立 chunk）
const AuthPage             = lazy(() => import('../features/auth'))
const DashboardPage        = lazy(() => import('../features/dashboard'))
const TaskPipelinePage     = lazy(() => import('../features/tasks'))
const TaskManagerPage      = lazy(() => import('../features/task-manager'))
const SessionsPage         = lazy(() => import('../features/sessions'))
const ConversationHistory  = lazy(() => import('../features/conversation-history'))
const ChatPage             = lazy(() => import('../features/chat'))
const ClaudeConfigPage     = lazy(() => import('../features/claude-config'))
const KnowledgePage        = lazy(() => import('../features/knowledge'))
const McpMarketPage        = lazy(() => import('../features/mcp-market'))
const ProjectFilesPage     = lazy(() => import('../features/project-files'))
const GitPage              = lazy(() => import('../features/git'))
const CanvasPage           = lazy(() => import('../features/canvas'))
const SettingsPage         = lazy(() => import('../features/settings'))

const RouterComponent = isTauri() ? HashRouter : BrowserRouter

export function AppRouter() {
  return (
    <RouterComponent>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/login"        element={<AuthPage />} />
          <Route path="/"             element={<DashboardPage />} />
          <Route path="/tasks/:id"    element={<TaskPipelinePage />} />
          <Route path="/task-manager" element={<TaskManagerPage />} />
          <Route path="/sessions"     element={<SessionsPage />} />
          <Route path="/history"      element={<ConversationHistory />} />
          <Route path="/chat"         element={<ChatPage />} />
          <Route path="/config"       element={<ClaudeConfigPage />} />
          <Route path="/knowledge"    element={<KnowledgePage />} />
          <Route path="/mcp"          element={<McpMarketPage />} />
          <Route path="/files"        element={<ProjectFilesPage />} />
          <Route path="/git"          element={<GitPage />} />
          <Route path="/canvas"       element={<CanvasPage />} />
          <Route path="/settings"     element={<SettingsPage />} />
        </Routes>
      </Suspense>
    </RouterComponent>
  )
}
```

**`window.__TAURI__` 类型声明：**
```typescript
// lib/tauri.ts
declare global {
  interface Window { __TAURI__?: unknown }
}
export const isTauri = (): boolean => typeof window.__TAURI__ !== 'undefined'
```
```

---

## 七、Zustand Store 结构

```typescript
// lib/store/app.ts — 全局 UI 状态
interface AppStore {
  theme: 'dark' | 'light' | 'system'
  sidebarCollapsed: boolean
  activeProjectId: string | null
}

// lib/store/sessions.ts — 实时会话状态（WS 写入）
interface SessionStore {
  sessions: AiSession[]
  events: Record<string, AiStreamEvent[]>  // sessionId → events
  update(event: AiStreamEvent): void
}

// lib/store/tasks.ts — 任务状态（TanStack Query + WS 同步）
interface TaskStore {
  activeTaskId: string | null
  logBuffer: Record<string, string[]>      // taskId → log lines
  appendLog(taskId: string, line: string): void
  // WS 推送任务状态变更时，同步 invalidate TanStack Query 缓存
  // 使用方式：wsEvent 'task_status_change' → queryClient.invalidateQueries(['tasks', taskId])
}
```

---

## 八、每个 feature 目录规范

```
features/dashboard/
├── index.tsx          # 页面入口（路由组件）
├── components/        # 只属于 dashboard 的组件
│   ├── KpiCard.tsx
│   └── ProjectList.tsx
├── hooks/             # 只属于 dashboard 的 hooks
│   └── useMetrics.ts  # 调用 TanStack Query
└── types.ts           # 本模块的局部类型（可选）
```

---

## 九、Web / 桌面双模式运行

`tauri/` 是一个标准 Vite + React 项目，同时也是一个 Tauri 应用，无需 npm workspace：

```
# Web 模式（浏览器访问）
cd tauri && npm run dev        # → http://localhost:7071

# 桌面模式（Tauri 窗口）
cd tauri && npm run tauri dev  # → 原生窗口
cd tauri && npm run tauri build # → 打包安装包
```

运行时通过 `isTauri()` 自动切换实现，组件代码完全不感知：

| 层 | Web 模式 | 桌面模式 |
|---|---|---|
| WebSocket | BrowserWsManager（WASM + Worker）| TauriWsManager（Rust tokio emit）|
| API | HttpAdapter（fetch）| HttpAdapter（现阶段仍 fetch，未来切 TauriAdapter）|
| 路由 | BrowserRouter | HashRouter |

---

## 十、国际化

保留现有 `react-i18next` 方案，翻译文件放在 `tauri/src/i18n/`：
```
i18n/
├── en.json
└── zh.json
```
组件使用 `const { t } = useTranslation()` 不变。

---

## 十一、性能策略

| 策略 | 工具 | 解决问题 |
|---|---|---|
| 路由级懒加载 | React.lazy + Suspense | 首屏体积 |
| 虚拟滚动 | @tanstack/virtual | 日志/事件长列表 |
| WS 非阻塞 | Web Worker + WASM / tokio | 消息多时不卡 UI |
| API 缓存 | TanStack Query `staleTime` | 切页零 loading |

---

## 十二、多 AI 扩展预留

- 所有消息类型包含 `provider` 字段，默认 `"claude"`
- API 接口参数预留 `provider?: string`
- 组件命名用通用词：`AiSession`、`AiEvent`，不写死 Claude

**现阶段只实现 Claude，不实现其他 Provider。**

---

## 十三、实现优先级

| 阶段 | 内容 |
|---|---|
| **P0（先做）** | `ws-core` Rust crate：transport + manager + message + WASM export + ws-worker.js |
| **P1** | Tauri 基础框架（`tauri/` 目录）+ `TauriWsManager` + Cargo workspace |
| **P2** | 前端框架重写：shadcn/ui、路由、布局、API Adapter、Zustand stores、i18n 迁移 |
| **P3** | feature 页面：dashboard、tasks、sessions、chat |
| **P4** | feature 页面：claude-config、mcp-market、knowledge、git、settings |

---

## 十四、不在本次范围内

- `backend/` 不做任何改动
- 多 AI Provider 实现（仅预留接口）
- Tauri 原生系统功能（托盘、文件系统等）
- Rust 重写 FastAPI 后端
