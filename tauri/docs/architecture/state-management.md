# 状态管理

## 概览

使用 Zustand 5 管理客户端状态，按领域拆分为 4 个独立 store：

| Store | 文件 | 持久化 | 用途 |
|-------|------|--------|------|
| `useAuthStore` | `lib/store/auth.ts` | localStorage (`tc_token`) | 登录 token、跨窗口同步 |
| `useAppStore` | `lib/store/app.ts` | localStorage (`tc-app-settings`) | 主题、侧边栏、活跃项目 |
| `useTaskStore` | `lib/store/tasks.ts` | 无 | 当前任务 ID、日志缓冲 |
| `useSessionStore` | `lib/store/sessions.ts` | 无 | AI 会话列表、事件历史 |

## Auth Store

```typescript
interface AuthState {
  token: string | null
  login(token: string): void    // 保存 token + 广播 auth_changed
  logout(): void                // 清除 token + 广播 auth_changed
}
```

### 跨窗口同步

通过 `windowBus` 广播 `auth_changed` 事件：

```
窗口 A: login(token)
  → localStorage.setItem('tc_token', token)
  → windowBus.emit('auth_changed', token)
  → 窗口 B 收到事件 → _syncFrom(token) 更新本地 store
```

`initAuthSync()` 在 `Providers.tsx` 中调用，注册监听器并返回 cleanup 函数。

## App Store

```typescript
interface AppStore {
  theme: 'dark' | 'light' | 'system'
  sidebarCollapsed: boolean
  activeProjectId: string | null
  setTheme(theme): void
  setSidebarCollapsed(collapsed): void
  setActiveProjectId(id): void
}
```

使用 Zustand `persist` 中间件，自动序列化到 `tc-app-settings`。

## Task Store

```typescript
interface TaskStore {
  activeTaskId: string | null
  logBuffer: Record<string, string[]>   // taskId → 最近 1000 行日志
  setActiveTaskId(id): void
  appendLog(taskId, line): void
  clearLogs(taskId): void
}
```

日志缓冲用于实时显示 Claude 工具调用输出，每个任务最多保留 1000 行。

## Session Store

```typescript
interface SessionStore {
  sessions: AiSession[]
  events: Record<string, AiStreamEvent[]>  // sessionId → 最近 200 条事件
  update(event: AiStreamEvent): void       // upsert session + append event
  clearSession(sessionId): void
}
```

AI 会话监控数据，由 WebSocket 实时推送更新。
