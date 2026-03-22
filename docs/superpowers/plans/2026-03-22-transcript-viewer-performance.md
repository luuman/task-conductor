# TranscriptViewer 全面性能优化 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将大会话（6000+ events）的查看体验从严重卡顿优化到流畅 60fps

**Architecture:** 四层优化：①工具结果懒渲染减少 DOM ②react-virtuoso 虚拟滚动只渲染可视区 ③后端分页减少网络传输 ④语法高亮移到 Web Worker 避免主线程阻塞

**Tech Stack:** React 19, react-virtuoso 4.18, highlight.js, FastAPI, Web Workers

**Spec:** `docs/superpowers/specs/2026-03-22-transcript-viewer-performance-design.md`

---

## File Structure

| 文件 | 职责 | 操作 |
|------|------|------|
| `tauri/src/components/ChatRenderer/ChatRenderer.tsx` | ToolWidget/EditDiffView/BashStatusLine 懒渲染 + memo + Worker 适配 | 修改 |
| `tauri/src/components/ChatRenderer/index.ts` | 导出 memo 版本组件 | 修改 |
| `tauri/src/components/SessionChat/TranscriptViewer.tsx` | Virtuoso 虚拟滚动替换 | 修改 |
| `tauri/src/components/SessionChat/QuestionNav.tsx` | 跳转迁移到 Virtuoso API | 修改 |
| `tauri/src/components/SessionChat/useSessionData.ts` | 分页加载逻辑 | 修改 |
| `tauri/src/lib/api/http.ts` | getTranscript 参数扩展 | 修改 |
| `tauri/src/lib/api/types.ts` | TranscriptResponse 类型扩展 | 修改 |
| `tauri/src/lib/hljs-worker.ts` | Web Worker 语法高亮 | 新建 |
| `tauri/src/lib/useHighlight.ts` | Worker hook + LRU 缓存 | 新建 |
| `tauri/src/lib/lru-cache.ts` | 简单 LRU 缓存工具 | 新建 |
| `backend/app/routers/sessions.py` | transcript 端点分页参数 | 修改 |

---

## Task 1: ToolWidget 懒渲染

**Files:**
- Modify: `tauri/src/components/ChatRenderer/ChatRenderer.tsx:707-796`

- [ ] **Step 1: 在 ToolWidget 中加入 `mounted` 状态**

在 `ChatRenderer.tsx` 的 `ToolWidget` 函数（约 line 712）中，在 `open` state 下方加入 `mounted` state，修改 toggle 逻辑：

```tsx
// line ~712, 现有:
const [open, setOpen] = useState(autoExpand || isAskUserInit)
const toggle = useCallback(() => setOpen(v => !v), [])

// 改为:
const [open, setOpen] = useState(autoExpand || isAskUserInit)
const [mounted, setMounted] = useState(autoExpand || isAskUserInit)
const toggle = useCallback(() => {
  setMounted(true)
  setOpen(v => !v)
}, [])
```

- [ ] **Step 2: 修改 ExpandSignalCtx 响应，只控制 open 不重置 mounted**

现有 effect（line ~716-721）保持不变，它只调用 `setOpen(signal > 0)`，不影响 `mounted`。无需改动。

- [ ] **Step 3: 用 mounted + display:none 包裹内联 body 渲染**

找到 ToolWidget 的 body 渲染部分（line ~784-793）。注意：body 内容是直接内联渲染的（没有 `toolBody` 变量），需要将 `{open && (...)}` 改为 `{mounted && (...)}`，同时用 `display` 控制可见性：

```tsx
// 现有（约 line 784-793）:
{open && (
  <div className={styles.toolBody}>
    {!!hasEditData && <EditDiffView input={block.tool_input!} />}
    {isBash && hasResult && <BashOutput ... />}
    {isRead && hasResult && <ReadFileView ... />}
    ...
  </div>
)}

// 改为:
{mounted && (
  <div className={styles.toolBody} style={{ display: open ? 'block' : 'none' }}>
    {!!hasEditData && <EditDiffView input={block.tool_input!} />}
    {isBash && hasResult && <BashOutput ... />}
    {isRead && hasResult && <ReadFileView ... />}
    ...
  </div>
)}
```

只需将 `open` 改为 `mounted`，并添加 `style={{ display: open ? 'block' : 'none' }}`。内部子组件保持不变。

- [ ] **Step 4: 验证编译通过**

Run: `cd /home/sichengli/Documents/code2/task-conductor/tauri && npx tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 5: 手动验证功能**

打开 `http://localhost:7071/admin/sessions`，选一个有大量工具调用的会话：
- 工具卡片默认折叠时不应看到内容
- 点击展开显示内容
- 再次折叠后再展开，内容应立即显示（无重新计算闪烁）
- "全部展开/折叠" 按钮正常工作

- [ ] **Step 6: Commit**

```bash
git add tauri/src/components/ChatRenderer/ChatRenderer.tsx
git commit -m "perf: lazy render ToolWidget body — mount on first expand, hide with display:none"
```

---

## Task 2: EditInlineCard 懒渲染

**Files:**
- Modify: `tauri/src/components/ChatRenderer/ChatRenderer.tsx:1028-1045` (EditInlineCard)

注意：EditInlineCard 在 AssistantTurnCard 中直接渲染（line ~1197），不在 ToolWidget 内，因此 Task 1 的 ToolWidget 懒渲染对它无效。需要单独给 EditInlineCard 加折叠/展开机制。

- [ ] **Step 1: 给 EditInlineCard 加 mounted/expanded 状态**

将现有的 EditInlineCard（line ~1028-1045）改为默认折叠，显示摘要行，点击展开才渲染 EditDiffView：

```tsx
export function EditInlineCard({ block }: { block: TranscriptBlock }) {
  const input = block.tool_input || {}
  const hasEditData = Boolean(input.old_string || input.new_string)
  const filePath = String(input.file_path || '')
  const fileName = filePath.split('/').pop() || filePath
  const [expanded, setExpanded] = useState(false)
  const [mounted, setMounted] = useState(false)
  const autoExpand = useContext(AutoExpandCtx)

  // 无 diff 数据时只显示文件名
  if (!hasEditData) {
    return (
      <div className={styles.bashCardHeader}>
        <span className={styles.bashCardIcon}>{getToolIcon(block.tool_name || 'Edit', 12)}</span>
        <span className={styles.editCardFile} title={filePath}>{fileName}</span>
        <span className={`${styles.bashCardBadge} ${styles.bashCardPass}`}>{'\u2713'}</span>
      </div>
    )
  }

  const handleToggle = () => {
    if (!mounted) setMounted(true)
    setExpanded(v => !v)
  }

  return (
    <div>
      <button className={`${styles.toolHeader} ${styles.toolHeaderClickable}`} onClick={handleToggle}>
        <span className={styles.bashCardIcon}>{getToolIcon(block.tool_name || 'Edit', 12)}</span>
        <span className={styles.editCardFile} title={filePath}>{fileName}</span>
        <span className={`${styles.bashCardBadge} ${styles.bashCardPass}`}>{'\u2713'}</span>
        <span className={styles.toolChevron} style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
          <IconChevronRight size={10} />
        </span>
      </button>
      {mounted && (
        <div style={{ display: expanded ? 'block' : 'none' }}>
          <EditDiffView input={input} />
        </div>
      )}
    </div>
  )
}
```

需要确认 `AutoExpandCtx`、`IconChevronRight` 已在文件内可用。

- [ ] **Step 2: 验证编译通过**

Run: `cd /home/sichengli/Documents/code2/task-conductor/tauri && npx tsc --noEmit`

- [ ] **Step 3: 手动验证**

打开包含 Edit 工具调用的会话，确认：
- Edit 卡片默认显示为单行摘要（文件名 + 勾号）
- 点击可展开看到 diff
- 折叠后再展开立即显示

- [ ] **Step 4: Commit**

```bash
git add tauri/src/components/ChatRenderer/ChatRenderer.tsx
git commit -m "perf: add lazy rendering to EditInlineCard — collapse by default, mount diff on expand"
```

---

## Task 3: React.memo 包裹卡片组件

**Files:**
- Modify: `tauri/src/components/ChatRenderer/ChatRenderer.tsx:1151-1215`
- Modify: `tauri/src/components/ChatRenderer/index.ts`

- [ ] **Step 1: 在 ChatRenderer.tsx 末尾添加 memo 版本**

在 `UserCard`（line ~1151）和 `AssistantTurnCard`（line ~1176）定义之后，添加：

```tsx
export const MemoUserCard = React.memo(UserCard)
export const MemoAssistantTurnCard = React.memo(AssistantTurnCard)
```

需要在文件顶部确认 `React` 或 `memo` 已导入。如果是 `import { ... } from 'react'` 风格，添加 `memo` 到导入列表。

- [ ] **Step 2: 更新 index.ts barrel export**

在 `tauri/src/components/ChatRenderer/index.ts` 中添加导出：

```typescript
export {
  ChatMessageList,
  UserCard,
  AssistantTurnCard,
  MemoUserCard,          // 新增
  MemoAssistantTurnCard, // 新增
  groupMessagesIntoTurns,
  ExpandSignalCtx,
  AutoExpandCtx,
} from './ChatRenderer'
```

- [ ] **Step 3: 验证编译通过**

Run: `cd /home/sichengli/Documents/code2/task-conductor/tauri && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add tauri/src/components/ChatRenderer/ChatRenderer.tsx tauri/src/components/ChatRenderer/index.ts
git commit -m "perf: add React.memo wrappers for UserCard and AssistantTurnCard"
```

---

## Task 4: TranscriptViewer 虚拟滚动

**Files:**
- Modify: `tauri/src/components/SessionChat/TranscriptViewer.tsx`

- [ ] **Step 1: 替换导入，引入 Virtuoso**

```tsx
// 新增导入
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
import {
  ExpandSignalCtx, AutoExpandCtx,
  groupMessagesIntoTurns, MemoUserCard, MemoAssistantTurnCard,
} from '../ChatRenderer'
```

移除对 `UserCard`, `AssistantTurnCard` 的旧导入。

- [ ] **Step 2: 修改 props 接口**

将 `scrollRef` 改为 `onJumpToQuestion` 回调：

```tsx
export interface TranscriptViewerProps {
  transcript: TranscriptMessage[]
  loading: boolean
  fileFound: boolean
  selectedId: string | null
  isFirstLoad: React.MutableRefObject<boolean>
  autoExpand?: boolean
  onJumpToQuestion?: (ref: { scrollToIndex: (index: number) => void }) => void
  className?: string
}
```

- [ ] **Step 3: 重写渲染主体，用 Virtuoso 替代 .map()**

替换现有的 transcript 渲染区域（约 line 180-214）：

```tsx
const virtuosoRef = useRef<VirtuosoHandle>(null)
const turns = useMemo(() => groupMessagesIntoTurns(transcript), [transcript])

// 暴露 scrollToIndex 给 QuestionNav
useEffect(() => {
  if (onJumpToQuestion && virtuosoRef.current) {
    onJumpToQuestion({
      scrollToIndex: (index: number) => {
        virtuosoRef.current?.scrollToIndex({ index, align: 'start', behavior: 'smooth' })
      },
    })
  }
}, [onJumpToQuestion, turns])

// 提取 questions（用于 rangeChanged 匹配）
const questionIndices = useMemo(() => {
  const result: Array<{ turnIndex: number; text: string }> = []
  turns.forEach((item, i) => {
    if (item.kind === 'user') {
      const text = item.msg.blocks
        .filter(b => b.type === 'text')
        .map(b => b.text || '')
        .join(' ')
        .trim()
        .slice(0, 200)
      if (text) result.push({ turnIndex: i, text })
    }
  })
  return result
}, [turns])

// rangeChanged → 更新 sticky question header
const handleRangeChanged = useCallback(({ startIndex }: { startIndex: number; endIndex: number }) => {
  // 找 startIndex 及之前最近的 user question
  let found: string | null = null
  for (let i = questionIndices.length - 1; i >= 0; i--) {
    if (questionIndices[i].turnIndex <= startIndex) {
      found = questionIndices[i].text
      break
    }
  }
  setCurrentQuestion(found)
}, [questionIndices])
```

- [ ] **Step 4: 替换 JSX 渲染部分**

移除旧的 `.map()` 渲染和 IntersectionObserver effect（line ~98-132），替换为：

```tsx
return (
  <div className={`${styles.centerPanel} ${className ?? ''}`}>
    <AutoExpandCtx.Provider value={autoExpand}>
    <ExpandSignalCtx.Provider value={expandSignal}>
      {currentQuestion && (
        <div className={styles.stickyQuestion}>
          <span style={{ flexShrink: 0, display: 'flex' }}><IconUser size={12} /></span>
          <span className={styles.stickyQuestionText}>{currentQuestion}</span>
        </div>
      )}
      <Virtuoso
        ref={virtuosoRef}
        data={turns}
        initialTopMostItemIndex={turns.length - 1}
        followOutput="smooth"
        computeItemKey={(_index, item) => item.startIndex}
        itemSize={(el) => el.getBoundingClientRect().height}
        defaultItemSize={200}
        increaseViewportBy={400}
        rangeChanged={handleRangeChanged}
        atBottomStateChange={(atBottom) => setShowJumpBtn(!atBottom)}
        itemContent={(_index, item) => (
          <div data-msg-index={item.startIndex}>
            {item.kind === 'user'
              ? <MemoUserCard msg={item.msg} />
              : <MemoAssistantTurnCard turn={item.turn} />}
          </div>
        )}
      />
      {showJumpBtn && (
        <button className={styles.jumpToBottom} onClick={() => virtuosoRef.current?.scrollToIndex({ index: turns.length - 1, behavior: 'smooth' })}>
          <IconChevronDown size={14} />
          <span>{t('admin_extra.latest')}</span>
        </button>
      )}
    </ExpandSignalCtx.Provider>
    </AutoExpandCtx.Provider>
  </div>
)
```

- [ ] **Step 5: 移除不再需要的代码**

- 删除 `bottomRef`（Virtuoso 内部管理滚动）
- 删除 IntersectionObserver effect（line ~98-132）
- 删除 `checkNearBottom` 回调（Virtuoso 的 `atBottomStateChange` 替代）
- 删除旧的 scroll listener effect（line ~45-51）
- 保留 `isFirstLoad` 逻辑（Virtuoso 的 `initialTopMostItemIndex` 替代）

- [ ] **Step 6: 验证编译通过**

Run: `cd /home/sichengli/Documents/code2/task-conductor/tauri && npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add tauri/src/components/SessionChat/TranscriptViewer.tsx
git commit -m "perf: replace full DOM render with react-virtuoso virtual scrolling"
```

---

## Task 5: QuestionNav 迁移到 Virtuoso API

**Files:**
- Modify: `tauri/src/components/SessionChat/QuestionNav.tsx`
- Modify: `tauri/src/components/SessionChat/SessionChat.tsx`

- [ ] **Step 1: 修改 QuestionNav props**

将 `transcriptScrollRef` 替换为 `onJumpToIndex` 回调：

```tsx
export interface QuestionNavProps {
  transcript: TranscriptMessage[]
  onJumpToIndex?: (turnIndex: number) => void  // 替代 transcriptScrollRef
  autoExpand: boolean
  onAutoExpandChange: (v: boolean) => void
  className?: string
}
```

- [ ] **Step 2: 修改 jumpToQuestion 实现**

将现有的 `querySelectorAll + scrollIntoView`（line ~41-52）替换为：

```tsx
const jumpToQuestion = useCallback((msgIndex: number) => {
  onJumpToIndex?.(msgIndex)
}, [onJumpToIndex])
```

注意：需要将 `msgIndex`（消息在 transcript 中的 index）映射到 `turnIndex`（在 `turns` 数组中的 index）。在 QuestionNav 中传入的是 `msgIndex`，需要在 SessionChat 层做映射。

- [ ] **Step 3: 修改 SessionChat.tsx 传递新 props**

在 `SessionChat.tsx` 中，用 `useRef` + `useCallback` 稳定回调引用：

```tsx
const jumpHandlerRef = useRef<{ scrollToIndex: (i: number) => void } | null>(null)

const handleJumpReady = useCallback((handler: { scrollToIndex: (i: number) => void }) => {
  jumpHandlerRef.current = handler
}, [])

// turns 用于 msgIndex → turnIndex 映射
const turns = useMemo(() => groupMessagesIntoTurns(transcript), [transcript])

const handleJumpToIndex = useCallback((msgIndex: number) => {
  // 将 QuestionNav 的 msgIndex 映射到 turns 数组中的 turnIndex
  const turnIndex = turns.findIndex(t => t.startIndex >= msgIndex)
  if (turnIndex >= 0) {
    jumpHandlerRef.current?.scrollToIndex(turnIndex)
  }
}, [turns])

// 传给 TranscriptViewer
<TranscriptViewer
  ...
  onJumpToQuestion={handleJumpReady}
/>

// 传给 QuestionNav
{hasQuestions && (
  <QuestionNav
    transcript={transcript}
    onJumpToIndex={handleJumpToIndex}
    autoExpand={autoExpand}
    onAutoExpandChange={setAutoExpand}
  />
)}
```

- [ ] **Step 4: 验证编译通过**

Run: `cd /home/sichengli/Documents/code2/task-conductor/tauri && npx tsc --noEmit`

- [ ] **Step 5: 手动验证**

打开会话页面，点击右侧 QuestionNav 中的问题，确认能平滑滚动到对应位置。

- [ ] **Step 6: Commit**

```bash
git add tauri/src/components/SessionChat/QuestionNav.tsx tauri/src/components/SessionChat/SessionChat.tsx
git commit -m "perf: migrate QuestionNav to Virtuoso scrollToIndex API"
```

---

## Task 6: 后端 transcript 分页

**Files:**
- Modify: `backend/app/routers/sessions.py:222-363`

- [ ] **Step 1: 扩展 TranscriptResponse 模型**

在 `sessions.py` line ~239-242，添加 `total` 和 `has_more` 字段：

```python
class TranscriptResponse(BaseModel):
    messages: list[TranscriptMessage] = []
    file_found: bool = True
    total: int = 0        # 新增
    has_more: bool = False  # 新增
```

- [ ] **Step 2: 修改 get_transcript 函数签名，添加 offset/limit 参数**

```python
@router.get("/{session_id}/transcript", response_model=TranscriptResponse, summary="读取会话对话记录")
def get_transcript(
    session_id: str,
    limit: int = 50,
    offset: Optional[int] = None,
    db: Session = Depends(get_db),
):
```

需要在文件顶部确认 `Optional` 已导入。

- [ ] **Step 3: 在函数末尾（return 之前）添加分页切片逻辑**

在现有的两遍解析完成后（messages 列表构建完毕），添加：

```python
    total = len(messages)
    if offset is None:
        start = max(0, total - limit)
    else:
        start = max(0, min(offset, total))
    end = min(start + limit, total)

    return TranscriptResponse(
        messages=messages[start:end],
        file_found=True,
        total=total,
        has_more=start > 0,
    )
```

替换现有的 `return TranscriptResponse(messages=messages, file_found=True)`。

- [ ] **Step 4: 运行后端测试**

Run: `cd /home/sichengli/Documents/code2/task-conductor/backend && python -m pytest tests/ -v -x`

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/sessions.py
git commit -m "feat: add offset/limit pagination to transcript API"
```

---

## Task 7: 前端 API 类型和方法适配分页

**Files:**
- Modify: `tauri/src/lib/api/types.ts:432-447, 510`
- Modify: `tauri/src/lib/api/http.ts:93-95`

- [ ] **Step 1: 扩展 TranscriptResponse 类型**

在 `types.ts` 中找到 `getTranscript` 的返回类型（line ~510），以及 `http.ts` 中的实际返回类型：

```typescript
// types.ts — 新增接口
export interface TranscriptResponse {
  messages: TranscriptMessage[]
  file_found: boolean
  total: number
  has_more: boolean
}

// 更新 ApiAdapter 接口
getTranscript(sessionId: string, params?: { limit?: number; offset?: number }): Promise<TranscriptResponse>
```

- [ ] **Step 2: 修改 http.ts 的 getTranscript 方法**

```typescript
getTranscript(sessionId: string, params?: { limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams()
  if (params?.limit != null) searchParams.set('limit', String(params.limit))
  if (params?.offset != null) searchParams.set('offset', String(params.offset))
  const qs = searchParams.toString()
  const url = `/api/sessions/${encodeURIComponent(sessionId)}/transcript${qs ? `?${qs}` : ''}`
  return this.fetch<TranscriptResponse>(url)
}
```

- [ ] **Step 3: 验证编译通过**

Run: `cd /home/sichengli/Documents/code2/task-conductor/tauri && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add tauri/src/lib/api/types.ts tauri/src/lib/api/http.ts
git commit -m "feat: extend getTranscript API with pagination params and response types"
```

---

## Task 8: 前端分页加载逻辑

**Files:**
- Modify: `tauri/src/components/SessionChat/useSessionData.ts:37-189`

- [ ] **Step 1: 添加分页状态**

在 `useSessionData` hook 中（line ~45-56），添加新状态：

```typescript
const [total, setTotal] = useState(0)
const [loadedFrom, setLoadedFrom] = useState(0)
const [hasMore, setHasMore] = useState(false)
const [loadingMore, setLoadingMore] = useState(false)
```

- [ ] **Step 2: 修改 selectSession 使用分页加载**

修改现有的 `selectSession`（line ~108-137），让初始加载只取最后 50 条：

```typescript
const selectSession = useCallback((id: string) => {
  setSelectedId(id)
  setTranscriptLoading(true)
  isFirstLoad.current = true

  // 检查缓存
  const cached = transcriptCache.current.get(id)
  if (cached) {
    setTranscript(cached.messages)
    setFileFound(cached.file_found)
    setTotal(cached.total ?? cached.messages.length)
    setLoadedFrom(cached.loadedFrom ?? 0)
    setHasMore(cached.has_more ?? false)
    setTranscriptLoading(false)
  } else {
    setTranscript([])
    setFileFound(true)
  }

  // 分页加载最新 50 条
  api.getTranscript(id, { limit: 50 })
    .then(r => {
      const from = Math.max(0, r.total - r.messages.length)
      transcriptCache.current.set(id, {
        messages: r.messages, file_found: r.file_found,
        total: r.total, has_more: r.has_more, loadedFrom: from,
      })
      setTranscript(r.messages)
      setFileFound(r.file_found)
      setTotal(r.total)
      setLoadedFrom(from)
      setHasMore(r.has_more)
      setTranscriptLoading(false)
    })
    .catch(() => { setTranscript([]); setFileFound(false); setTranscriptLoading(false) })
}, [])
```

- [ ] **Step 3: 添加 loadMore 函数**

```typescript
const loadMore = useCallback(() => {
  const sid = selectedIdRef.current // 需要用 ref 追踪
  if (!sid || !hasMore || loadedFrom <= 0 || loadingMore) return
  setLoadingMore(true)
  const nextStart = Math.max(0, loadedFrom - 50)
  const count = loadedFrom - nextStart
  api.getTranscript(sid, { limit: count, offset: nextStart })
    .then(r => {
      setTranscript(prev => [...r.messages, ...prev])
      setLoadedFrom(nextStart)
      setHasMore(nextStart > 0)
      setLoadingMore(false)
    })
    .catch(() => setLoadingMore(false))
}, [hasMore, loadedFrom, loadingMore])
```

- [ ] **Step 4: 修改 WebSocket 刷新为增量 append**

用 `ref` 追踪 `total` 避免 callback 重建导致 WebSocket 断连重连：

```typescript
const totalRef = useRef(0)
// 在 loadInitial 和 loadMore 中同步更新:
// totalRef.current = newTotal

const appendNewMessages = useCallback((sid: string) => {
  api.getTranscript(sid, { offset: totalRef.current, limit: 100 })
    .then(r => {
      if (r.messages.length > 0) {
        setTranscript(prev => [...prev, ...r.messages])
        setTotal(r.total)
        totalRef.current = r.total
      }
    })
    .catch(() => {})
}, []) // 空依赖，引用稳定

// 同样需要 selectedIdRef:
const selectedIdRef = useRef<string | null>(null)
// 在 selectSession 中更新: selectedIdRef.current = id
```

在 WebSocket effect（line ~148-173）中将 `refreshTranscript(sid)` 替换为 `appendNewMessages(sid)`。由于 `appendNewMessages` 引用稳定（空依赖），WebSocket effect 不会因 total 变化而重建。

- [ ] **Step 5: 将 loadMore 和分页状态暴露出去**

更新 `UseSessionDataReturn` 接口和 return 值：

```typescript
export interface UseSessionDataReturn {
  // ...existing
  loadMore(): void
  hasMore: boolean
  loadingMore: boolean
  total: number
}
```

- [ ] **Step 6: 在 TranscriptViewer 中连接 Virtuoso startReached**

在 TranscriptViewer 的 Virtuoso 组件上添加：

```tsx
<Virtuoso
  ...
  startReached={loadMore}
  firstItemIndex={total - transcript.length}
/>
```

需要从 `useSessionData` 中获取 `loadMore`、`total`。更新 `SessionChat.tsx` 传递这些 props。

- [ ] **Step 7: 验证编译通过**

Run: `cd /home/sichengli/Documents/code2/task-conductor/tauri && npx tsc --noEmit`

- [ ] **Step 8: Commit**

```bash
git add tauri/src/components/SessionChat/useSessionData.ts tauri/src/components/SessionChat/TranscriptViewer.tsx tauri/src/components/SessionChat/SessionChat.tsx
git commit -m "feat: implement paginated transcript loading with infinite scroll"
```

---

## Task 9: LRU 缓存工具

**Files:**
- Create: `tauri/src/lib/lru-cache.ts`

- [ ] **Step 1: 创建简单 LRU 缓存实现**

```typescript
// tauri/src/lib/lru-cache.ts

export class LRUCache<K, V> {
  private map = new Map<K, V>()
  private readonly maxSize: number

  constructor(maxSize: number) {
    this.maxSize = maxSize
  }

  get(key: K): V | undefined {
    const value = this.map.get(key)
    if (value !== undefined) {
      // 移到末尾（最近使用）
      this.map.delete(key)
      this.map.set(key, value)
    }
    return value
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key)
    } else if (this.map.size >= this.maxSize) {
      // 淘汰最旧条目（Map 迭代顺序 = 插入顺序）
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
    this.map.set(key, value)
  }

  has(key: K): boolean {
    return this.map.has(key)
  }

  get size(): number {
    return this.map.size
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add tauri/src/lib/lru-cache.ts
git commit -m "feat: add simple LRU cache utility for highlight worker"
```

---

## Task 10: 语法高亮 Web Worker

**Files:**
- Create: `tauri/src/lib/hljs-worker.ts`

- [ ] **Step 1: 创建 Worker 文件**

```typescript
// tauri/src/lib/hljs-worker.ts
import hljs from 'highlight.js/lib/core'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import css from 'highlight.js/lib/languages/css'
import rust from 'highlight.js/lib/languages/rust'
import xml from 'highlight.js/lib/languages/xml'
import javascript from 'highlight.js/lib/languages/javascript'

hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('css', css)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)

self.onmessage = (e: MessageEvent<{ id: string; code: string; language?: string }>) => {
  const { id, code, language } = e.data
  try {
    const result = language
      ? hljs.highlight(code, { language, ignoreIllegals: true })
      : hljs.highlightAuto(code)
    self.postMessage({ id, html: result.value })
  } catch {
    self.postMessage({ id, html: code })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add tauri/src/lib/hljs-worker.ts
git commit -m "feat: add Web Worker for syntax highlighting"
```

---

## Task 11: useHighlight Hook

**Files:**
- Create: `tauri/src/lib/useHighlight.ts`

- [ ] **Step 1: 创建 hook**

```typescript
// tauri/src/lib/useHighlight.ts
import { useState, useEffect } from 'react'
import { LRUCache } from './lru-cache'
import hljs from 'highlight.js/lib/core'

// 简单哈希函数
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return hash.toString(36)
}

// Worker 懒初始化
let worker: Worker | null = null
let workerAvailable = true
const cache = new LRUCache<string, string>(500)
const pending = new Map<string, Array<(html: string) => void>>()

function getWorker(): Worker | null {
  if (!workerAvailable) return null
  if (!worker) {
    try {
      worker = new Worker(new URL('./hljs-worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (e: MessageEvent<{ id: string; html: string }>) => {
        const { id, html } = e.data
        cache.set(id, html)
        const cbs = pending.get(id)
        if (cbs) {
          cbs.forEach(cb => cb(html))
          pending.delete(id)
        }
      }
    } catch {
      workerAvailable = false
      return null
    }
  }
  return worker
}

export function useHighlight(code: string, language?: string): { html: string; loading: boolean } {
  const key = `${language || 'auto'}:${simpleHash(code)}`
  const cached = cache.get(key)
  const [html, setHtml] = useState(cached || '')
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    if (cache.has(key)) {
      const val = cache.get(key)!
      setHtml(val)
      setLoading(false)
      return
    }

    const w = getWorker()
    if (!w) {
      // 降级：主线程同步高亮（保持与之前相同的行为）
      try {
        const result = language
          ? hljs.highlight(code, { language, ignoreIllegals: true }).value
          : hljs.highlightAuto(code).value
        cache.set(key, result)
        setHtml(result)
      } catch {
        setHtml(code)
      }
      setLoading(false)
      return
    }

    let cancelled = false
    const cb = (result: string) => {
      if (!cancelled) {
        setHtml(result)
        setLoading(false)
      }
    }
    const cbs = pending.get(key) || []
    cbs.push(cb)
    pending.set(key, cbs)
    w.postMessage({ id: key, code, language })

    return () => {
      cancelled = true
      const callbacks = pending.get(key)
      if (callbacks) {
        const idx = callbacks.indexOf(cb)
        if (idx >= 0) callbacks.splice(idx, 1)
        if (callbacks.length === 0) pending.delete(key)
      }
    }
  }, [key, code, language])

  return { html, loading }
}
```

- [ ] **Step 2: 验证编译通过**

Run: `cd /home/sichengli/Documents/code2/task-conductor/tauri && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add tauri/src/lib/useHighlight.ts
git commit -m "feat: add useHighlight hook with lazy Worker init and LRU cache"
```

---

## Task 12: ChatRenderer 适配 useHighlight

**Files:**
- Modify: `tauri/src/components/ChatRenderer/ChatRenderer.tsx:1079-1147` (BashStatusLine)

- [ ] **Step 1: BashStatusLine 中替换同步 hljs 调用**

在 `BashStatusLine`（line ~1079）中，找到 `hljs.highlight` 调用（line ~1092, ~1106, ~1112），替换为 `useHighlight`：

```tsx
// 替换命令高亮 (line ~1090-1092)
// 旧: const cmdHtml = useMemo(() => hljs.highlight(shortCmd, { language: 'bash' }).value, [shortCmd])
// 新:
const { html: cmdHtml } = useHighlight(shortCmd, 'bash')

// 替换结果高亮 (line ~1098-1112)
// 旧: const resultHtml = useMemo(() => { ... hljs.highlight ... }, [result])
// 新:
const { html: resultHtml, loading: resultLoading } = useHighlight(result || '', detectedLang || undefined)
```

需要在文件顶部添加导入：

```typescript
import { useHighlight } from '../../lib/useHighlight'
```

- [ ] **Step 2: 验证编译通过**

Run: `cd /home/sichengli/Documents/code2/task-conductor/tauri && npx tsc --noEmit`

- [ ] **Step 3: 手动验证**

打开一个包含 bash 命令的会话，确认：
- 命令和输出正常显示
- 高亮效果与之前一致（可能有短暂无高亮 → 高亮的闪烁，这是预期行为）

- [ ] **Step 4: Commit**

```bash
git add tauri/src/components/ChatRenderer/ChatRenderer.tsx
git commit -m "perf: move BashStatusLine syntax highlighting to Web Worker"
```

---

## Task 13: ReadFileView 适配 useHighlight

**Files:**
- Modify: `tauri/src/components/ChatRenderer/ChatRenderer.tsx` (ReadFileView 函数)

- [ ] **Step 1: 找到 ReadFileView 中的 hljs 调用**

ReadFileView 在展示文件内容时使用 `hljs.highlightAuto()` 对大文件做语法高亮。找到该调用并替换为 `useHighlight`：

```tsx
// 旧: const highlighted = useMemo(() => hljs.highlightAuto(result).value, [result])
// 新:
const detectedLang = filePath.match(/\.(ts|tsx)$/) ? 'typescript'
  : filePath.match(/\.(py)$/) ? 'python'
  : filePath.match(/\.(rs)$/) ? 'rust'
  : filePath.match(/\.(css)$/) ? 'css'
  : filePath.match(/\.(json)$/) ? 'json'
  : filePath.match(/\.(sh|bash)$/) ? 'bash'
  : undefined
const { html: highlighted, loading: hljsLoading } = useHighlight(result, detectedLang)
```

基于文件扩展名推断语言，避免 `highlightAuto` 的昂贵自动检测。

- [ ] **Step 2: 验证编译通过**

Run: `cd /home/sichengli/Documents/code2/task-conductor/tauri && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add tauri/src/components/ChatRenderer/ChatRenderer.tsx
git commit -m "perf: move ReadFileView syntax highlighting to Web Worker"
```

---

## Task 14: 最终集成验证

- [ ] **Step 1: TypeScript 全量检查**

Run: `cd /home/sichengli/Documents/code2/task-conductor/tauri && npx tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 2: 功能回归测试**

打开 `http://localhost:7071/admin/sessions`：
1. 选择一个大会话（100+ events） → 验证首屏快速加载
2. 快速滚动 → 验证流畅无卡顿
3. 向上滚动到顶部 → 验证触发加载更多（如果 has_more）
4. 点击右侧 QuestionNav 问题 → 验证跳转正确
5. 切换 "展开全部/折叠全部" → 验证工具卡片响应
6. 展开一个工具卡片 → 折叠 → 再展开 → 验证内容立即显示

打开 `http://localhost:7071/sessions`：
7. 验证项目级会话页面同样正常

- [ ] **Step 3: Commit 最终状态**

如有遗漏修复，commit。
