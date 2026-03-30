# Chat 与 AI 助手架构设计

## 概述

TaskConductor 中的 AI 对话功能由两个入口提供：

- **Chat 页面**（`features/chat/index.tsx`）：完整的会话管理页面，三栏布局（会话列表 + 消息时间线 + 元信息侧边栏）
- **FloatingAssistant**（`components/FloatingAssistant/`）：悬浮窗，支持拖拽、缩放、多 Tab、历史会话

两者共享同一套渲染基础设施，但针对各自场景采用了不同的虚拟化策略。

---

## 核心数据流

```
用户输入 (PromptInput)
    ↓ useChatStream.send()
WebSocket /ws/chat
    ↓ chat_chunk / chat_done 事件
useChatStore (Zustand, 持久化)
    messages: TranscriptMessage[]   ← 完整消息历史
    currentReply: string            ← 流式输出片段（流中实时更新）
    ↓
渲染层 (ChatTimeline)
    splitSegments(messages) → Segment[]
    currentReply → 末尾 streaming-reply 段
```

### TranscriptMessage 格式

后端通过 WebSocket 推送的消息格式：

```typescript
interface TranscriptMessage {
  role: 'user' | 'assistant'
  ts: string
  blocks: TranscriptBlock[]  // text / tool_use / code / diff 等
}
```

---

## ChatTimeline 组件

**路径**：`features/chat/ChatTimeline.tsx`

ChatTimeline 是底层渲染组件，接受 `TranscriptMessage[]` 并输出可视化的对话时间线。支持两种渲染模式：

### 数据管道

```
TranscriptMessage[]
    ↓ splitSegments()
Segment[]
    | { type: 'user'; text; ts }
    | { type: 'assistant'; steps: TimelineStep[] }
    | { type: 'notification'; status; summary; taskId }
    | { type: 'local-command'; command; stdout }
    ↓
渲染（非虚拟化 or 虚拟化）
```

`splitSegments()` 遍历消息，将 assistant 消息解析为 `TimelineStep[]`（工具调用、文本块等），将 user 消息提取为纯文本段，并处理 `<task-notification>` 和 `<local-command-caveat>` 等系统 XML 标记。

### 模式 1：非虚拟化（默认）

```tsx
<ChatTimeline messages={messages} currentReply={currentReply} />
```

直接 map 渲染所有 segments，适合 Chat 页面（index.tsx 自行管理 Virtuoso）。

Chat 页面不使用 `ChatTimeline` 组件本身，而是直接导入内部的 `StyleA/B/D/G/H` 渲染器，通过自己构建的 `VItem[]` 配合 Virtuoso 渲染。

### 模式 2：虚拟化（FloatingAssistant 使用）

```tsx
<ChatTimeline
  key={activeTabId}
  messages={messages}
  currentReply={currentReply}
  virtualized
/>
```

启用后，内部 `VirtualizedChatTimeline` 组件接管渲染，使用 `react-virtuoso` 实现：
- 仅渲染可视区域内的 segments
- `initialTopMostItemIndex={vSegments.length - 1}`：初始滚动到底部（最新消息）
- `followOutput={(isAtBottom) => isAtBottom ? 'smooth' : false}`：用户在底部时自动追滚，翻看历史时不打断

### 时间线样式（StyleKey）

ChatTimeline 支持 5 种可切换的 assistant 步骤渲染风格：

| StyleKey | 样式名 | 视觉效果 |
|----------|--------|---------|
| `a` | StyleA | 竖线时间线（Timeline Vertical） |
| `b` | StyleB | 卡片瀑布（Cards Waterfall） |
| `d` | StyleD | GitHub PR 风格（Timeline Horizontal） |
| `g` | StyleG | 气泡聊天（Chat Bubble） |
| `h` | StyleH | 折叠手风琴（Accordion） |

---

## Chat 页面的虚拟化方案

**路径**：`features/chat/index.tsx`

Chat 页面自建了一套更精细的虚拟化方案，支持问题导航功能：

### VItem 设计

```typescript
type VItem =
  | { kind: 'user'; qi: number; question: UserQuestion }
  | { kind: 'steps'; steps: TimelineStep[] }
  | { kind: 'live'; message: TranscriptMessage }
  | { kind: 'thinking' }
```

通过 `parseTimelineWithQuestions(messages)` 将消息拆分为 `steps + questions` 两组数据，再合并为 `VItem[]` 传入 Virtuoso。

### 问题导航联动

```typescript
const handleRangeChanged = useCallback(({ startIndex, endIndex }) => {
  const threshold = startIndex + Math.max(1, Math.floor((endIndex - startIndex) / 3))
  // 用视口上 1/3 处判断当前"活跃问题"
  // 比只用 startIndex 更灵敏，滚动时侧边栏问题导航同步高亮
}, [])
```

### 防循环策略

`computeItemKey` 和 `itemContent` 均用 `useCallback(... [])` 空依赖缓存，防止 Virtuoso 因 prop 变化重新订阅导致的 rangeChanged → setState → re-render 死循环。

---

## FloatingAssistant 的虚拟化方案

**路径**：`components/FloatingAssistant/FloatingAssistant.tsx`

### 与 Chat 页面的差异

| 特性 | FloatingAssistant | Chat 页面 |
|------|------------------|----------|
| 虚拟化层级 | ChatTimeline 内部（virtualized prop） | 页面自管理 Virtuoso |
| 问题导航 | 无 | 有（rangeChanged） |
| 分页加载 | 无 | 有（startReached） |
| 自动滚动 | followOutput | followOutput |
| 状态管理 | 全局 useChatStore | Context 隔离 createLocalChatStore |

### Tab 切换重置策略

```tsx
<ChatTimeline key={activeTabId} ... virtualized />
```

`key={activeTabId}` 在切换到新 Tab 时触发组件重新挂载（unmount + mount），`VirtualizedChatTimeline` 内部的 `initialTopMostItemIndex` 重新生效，确保新对话从底部（最新消息）开始展示，而不是残留上一 Tab 的滚动位置。

### 历史会话加载

切换到历史会话时，`sessionTranscript` 从空数组异步加载消息。Virtuoso 检测到数据从 0 增长到 N 条，`followOutput` 在 `isAtBottom=true`（空列表时视口默认在底部）的情况下返回 `'smooth'`，自动滚动到最新消息。

---

## 共享工具

### fileUtils.tsx

**路径**：`features/chat/fileUtils.tsx`

统一管理文件扩展名颜色映射和文件类型图标 SVG，被 `ChatTimeline.tsx` 和 `PromptInput.tsx` 共用：

```typescript
FILE_COLOR_MAP        // Record<string, string>，30+ 种扩展名颜色
getFileColor(ext)     // 查颜色，未知扩展名返回 '#71717a'
FileTypeSvgInline     // 文件图标 SVG，width<=28 → 28×34，width>28 → 30×36
FolderSvgInline       // 文件夹图标 SVG，width<=38 → 38×32，width>38 → 40×34
```

### PromptInput

**路径**：`features/chat/PromptInput.tsx`

Chat 页面和 FloatingAssistant 共用的输入组件，包含：文本输入、附件上传（图片/文件/文件夹）、快捷 Chip、模型选择、权限模式选择、DOM 拾取器、Prompt 模板库。

通过 `useChatStream().send()` 发送消息，流式结果更新 `useChatStore.currentReply`，完成后调用 `addMessage()`。

---

## 状态隔离

FloatingAssistant 使用全局 `useChatStore()`（Zustand persist，持久化到 localStorage）。

Chat 页面通过 `ChatStoreCtx.Provider` 注入局部 store（`createLocalChatStore()`，不持久化），避免会话消息污染全局状态。

```typescript
// 读取当前 context 的 store（FA 用全局，Chat 页面用局部）
const store = useActiveChatStore()  // 优先读 Context，fallback 到全局
```

---

## 扩展指南

### 新增 Segment 类型

1. 在 `ChatTimeline.tsx` 中扩展 `Segment` 联合类型
2. 更新 `splitSegments()` 函数中的解析逻辑
3. 在 `ChatTimeline` 的非虚拟化路径和 `VirtualizedChatTimeline.itemContent` 中各添加一个 case

### 新增时间线样式（StyleKey）

1. 在 `ChatTimeline.tsx` 中添加新的 `StyleX` 渲染函数（参考 StyleA/B/D/G/H）
2. 将其注册到 `RENDERERS` 对象
3. 更新 `StyleKey` 类型和样式选择 UI
