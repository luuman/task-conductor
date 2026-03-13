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
3. 用 Rust 实现共用的 WebSocket 核心（ws-core），编译为 WASM（浏览器）和原生库（Tauri），防止消息堆积阻塞 UI
4. 预留多 AI Provider 扩展点，现阶段只实现 Claude

---

## 二、技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 前端框架 | React 19 + Vite + TypeScript | 保持现有熟悉度 |
| UI 组件 | shadcn/ui（基于 Radix UI） | 高质量预制组件，完全可定制 |
| 样式 | Tailwind CSS 4 | 原子化 CSS |
| 服务端状态 | TanStack Query | API 数据缓存 + 后台刷新 |
| 客户端状态 | Zustand | 轻量全局 UI 状态 |
| WebSocket 核心 | Rust（ws-core crate） | WASM（浏览器 Web Worker）+ 原生（Tauri tokio） |
| 桌面端 | Tauri 2.x | WebView 壳 + Rust 系统层 |
| 路由 | TanStack Router | 类型安全路由 |

---

## 三、仓库结构

```
task-conductor/
├── backend/              # Python FastAPI（不动）
├── frontend/             # React Web 前端（重写）
│   ├── src/
│   │   ├── features/     # 按功能模块组织
│   │   │   ├── dashboard/
│   │   │   ├── tasks/
│   │   │   ├── sessions/
│   │   │   ├── settings/
│   │   │   └── auth/
│   │   ├── components/ui/  # shadcn 纯 UI 组件
│   │   ├── lib/
│   │   │   ├── api/        # HTTP Adapter（Web 实现）
│   │   │   ├── ws/         # WsManager 接口 + 浏览器实现（调用 ws-core WASM）
│   │   │   ├── store/      # Zustand stores
│   │   │   └── utils.ts
│   │   └── app/            # 路由、布局、Provider
│   ├── package.json
│   └── vite.config.ts
│
├── tauri/                # Tauri 桌面端（新建）
│   ├── src/              # React 入口（复用 frontend/src 代码）
│   ├── src-tauri/        # Rust 代码
│   │   ├── src/
│   │   │   ├── main.rs
│   │   │   ├── ws/       # Tauri WS 命令（调用 ws-core 原生库）
│   │   │   └── api/      # Tauri IPC 命令（可选，现阶段转发给 FastAPI）
│   │   └── Cargo.toml
│   └── tauri.conf.json
│
└── ws-core/              # 共用 Rust WebSocket 核心（新建）
    ├── src/
    │   ├── lib.rs          # 公共接口
    │   ├── manager.rs      # 订阅管理、重连状态机
    │   ├── message.rs      # 消息格式定义、解析（serde）
    │   ├── transport/
    │   │   ├── browser.rs  # cfg(wasm32)：web-sys WebSocket
    │   │   └── native.rs   # cfg(not(wasm32))：tokio-tungstenite
    │   └── worker.rs       # WASM Web Worker 胶水代码
    ├── Cargo.toml
    └── pkg/                # wasm-pack 编译输出（gitignore）
```

---

## 四、WebSocket 架构（优先实现）

### 核心设计

```
ws-core（Rust）
     ↓ 条件编译
┌─────────────┬─────────────────┐
│  WASM 目标   │   原生目标       │
│（浏览器）    │  （Tauri）       │
│             │                 │
│ web-sys WS  │ tokio-tungstenite│
│ Web Worker  │ tokio task       │
└─────────────┴─────────────────┘
     ↓                ↓
  postMessage      emit event
     ↓                ↓
 前端主线程       WebView JS
（只管渲染）      （只管渲染）
```

### 共用部分（ws-core/src/manager.rs）

```rust
pub struct WsManager {
    subscriptions: HashMap<String, Vec<Box<dyn Fn(AiStreamEvent)>>>,
    retry_count: u32,
    state: ConnectionState,
}

impl WsManager {
    pub fn on_message(&mut self, raw: &str) {
        if let Ok(event) = serde_json::from_str::<AiStreamEvent>(raw) {
            self.dispatch(event);
        }
    }

    pub fn reconnect_delay_ms(&self) -> u64 {
        (500 * 2u64.pow(self.retry_count)).min(30_000)
    }
}
```

### 统一消息格式（provider-agnostic）

```rust
// ws-core/src/message.rs
#[derive(Serialize, Deserialize)]
pub struct AiStreamEvent {
    pub event_type: String,       // "tool_call" | "chunk" | "done" | "session_update"
    pub provider: String,         // "claude" | "openai"（预留）
    pub session_id: String,
    pub payload: serde_json::Value,
    pub ts: String,
}
```

### 前端调用接口（TypeScript）

```typescript
// lib/ws/index.ts
interface WsManager {
  subscribe(channel: string, handler: (event: AiStreamEvent) => void): () => void
  send(channel: string, data: unknown): void
  status(channel: string): 'connected' | 'disconnected' | 'reconnecting'
}

// 自动选择实现
export const ws: WsManager = window.__TAURI__
  ? new TauriWsManager()    // 调用 Tauri emit/listen
  : new BrowserWsManager()  // 调用 ws-core WASM in Web Worker
```

---

## 五、API 适配器（Adapter 模式）

支持三种模式，自动探测：

```typescript
// lib/api/index.ts
type ApiMode = 'remote-http' | 'local-http' | 'tauri-ipc'

function detectMode(): ApiMode {
  if (window.__TAURI__) return 'tauri-ipc'
  if (location.hostname === 'localhost') return 'local-http'
  return 'remote-http'
}

// 现阶段只实现 HttpAdapter
// TauriAdapter 预留接口，Tauri 阶段填充
export const api: ApiAdapter = new HttpAdapter(detectMode())
```

---

## 六、状态分层

| 状态类型 | 工具 | 范围 |
|---|---|---|
| 服务端数据 | TanStack Query | projects、tasks、sessions、metrics |
| 全局 UI | Zustand | 主题、侧栏、当前项目 |
| 实时推送 | ws-core → Zustand | WS 消息写入 store，组件订阅 |
| 表单/局部 | React useState | 单组件内 |

---

## 七、性能策略

| 策略 | 工具 | 解决的问题 |
|---|---|---|
| 路由级懒加载 | React.lazy + Suspense | 首屏体积 |
| 虚拟滚动 | @tanstack/virtual | 日志/事件长列表 |
| WS 非阻塞 | Web Worker + WASM / tokio | 消息多时不卡 UI |
| API 缓存 | TanStack Query staleTime | 切页零 loading |

---

## 八、多 AI 扩展预留

- 所有消息类型使用 `provider` 字段而非写死 `"claude"`
- API 接口参数预留 `provider?: string`（默认 `"claude"`）
- 组件命名用通用词：`AiSession`、`AiEvent` 而非 `ClaudeSession`

**现阶段只实现 Claude，不实现其他 Provider。**

---

## 九、实现优先级

| 阶段 | 内容 |
|---|---|
| **P0（先做）** | ws-core Rust crate + WASM 编译 + Web Worker 集成 |
| **P1** | Tauri 基础框架（tauri/ 目录）+ TauriWsManager |
| **P2** | 前端框架（frontend/ 重写）+ API Adapter + Zustand store |
| **P3** | 各 feature 页面（dashboard、tasks、sessions、settings） |

---

## 十、不在本次范围内

- 后端（backend/）不做任何改动
- 多 AI Provider 实现（预留接口即可）
- Tauri 原生系统功能（托盘、文件系统等）
- Rust 重写 FastAPI 后端
