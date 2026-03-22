# TranscriptViewer 全面性能优化设计

日期: 2026-03-22
状态: 已批准

## 背景

会话历史查看器（TranscriptViewer）在加载大会话（6000+ events）时严重卡顿。根本原因：

1. 无虚拟滚动 — 全量 DOM 渲染，节点可达数万
2. 卡片组件无 React.memo — 任何更新触发全树重渲染
3. 工具结果折叠状态仍渲染完整内容 — diff 计算、语法高亮白白消耗
4. 后端一次返回全部 transcript — 大文件数 MB，解析慢
5. highlight.js 在主线程同步执行 — 大文件阻塞 100-500ms

`react-virtuoso` v4.18.3 已安装但未使用。

## 设计

### Part 1: 虚拟滚动 + 组件 Memo

#### 虚拟滚动

将 TranscriptViewer 中的 `.map()` 全量渲染替换为 `react-virtuoso` 的 `Virtuoso` 组件。

```tsx
import { Virtuoso } from 'react-virtuoso'

const turns = useMemo(() => groupMessagesIntoTurns(transcript), [transcript])

<Virtuoso
  data={turns}
  firstItemIndex={firstItemIndex}
  initialTopMostItemIndex={turns.length - 1}
  followOutput="smooth"
  startReached={handleLoadMore}
  itemContent={(index, item) => (
    <div data-msg-index={item.startIndex}>
      {item.kind === 'user'
        ? <MemoUserCard msg={item.msg} />
        : <MemoAssistantTurnCard turn={item.turn} />}
    </div>
  )}
/>
```

关键适配：
- **动态高度**: Virtuoso 默认支持，自动测量每行高度
- **高度预估**: 提供 `estimateSize` 回调减少布局抖动：`(index) => turns[index].kind === 'user' ? 80 : 300`
- **稳定 key**: 使用 `computeItemKey={(index, item) => item.startIndex}` 避免分页 prepend 时 index 漂移导致 remount
- **滚动到底部**: 用 `followOutput="smooth"` 替代手动 `scrollIntoView`
- **Jump to bottom 按钮**: 用 Virtuoso 的 `atBottomStateChange` 回调控制显示/隐藏
- **Sticky question header 迁移**: 移除 IntersectionObserver，改用 `rangeChanged` 回调。回调提供 `{ startIndex, endIndex }`，从 `turns` 数组中反查最近的 user 消息作为 `currentQuestion`。具体：遍历 `turns[startIndex..endIndex]`，找最后一个 `kind === 'user'` 的 turn 提取文本
- **QuestionNav 跳转迁移**: TranscriptViewer 持有 `VirtuosoHandle` ref（替代原 `HTMLDivElement` scrollRef），QuestionNav 通过回调 `onJumpToQuestion(turnIndex)` 调用 `virtuosoRef.current.scrollToIndex({ index: turnIndex, align: 'start' })`，替代当前的 `querySelectorAll('[data-msg-index]')` + `scrollIntoView`
- **scrollRef 接口变更**: `TranscriptViewerProps.scrollRef` 类型从 `RefObject<HTMLDivElement>` 改为传入 `onJumpToQuestion` 回调，由 TranscriptViewer 内部持有 VirtuosoHandle

#### 组件 Memo

```tsx
export const MemoUserCard = React.memo(UserCard)
export const MemoAssistantTurnCard = React.memo(AssistantTurnCard)
```

由于 props 是 `TranscriptMessage` / `AssistantTurn` 对象引用，且 transcript 数据从 API 获取后引用稳定（除非重新加载），默认浅比较即可生效。

#### 文件改动

| 文件 | 改动 |
|------|------|
| `components/SessionChat/TranscriptViewer.tsx` | Virtuoso 替换 .map()，适配滚动逻辑 |
| `components/ChatRenderer/ChatRenderer.tsx` | UserCard/AssistantTurnCard 导出 memo 版本 |
| `components/ChatRenderer/index.ts` | 导出 MemoUserCard, MemoAssistantTurnCard |

### Part 2: 工具结果懒渲染

所有可折叠工具组件采用"折叠时不渲染内容"策略。

#### 目标组件

| 组件 | 当前行为 | 优化后 |
|------|----------|--------|
| ToolWidget | 折叠时仍渲染 body | 折叠时只渲染 header (~5 DOM nodes) |
| ReadPillRow (展开面板) | 总是渲染 ReadFileView | 展开时才 mount ReadFileView |
| EditInlineCard | 总是计算 diff + 渲染 | 折叠时只显示摘要行，展开时才计算 diff |

#### 实现模式

```tsx
function ToolWidget({ block }: { block: TranscriptBlock }) {
  const [expanded, setExpanded] = useState(false)
  const [mounted, setMounted] = useState(false)

  const handleToggle = () => {
    if (!mounted) setMounted(true)
    setExpanded(v => !v)
  }

  return (
    <div>
      <ToolHeader onClick={handleToggle} />
      {mounted && (
        <div style={{ display: expanded ? 'block' : 'none' }}>
          <ToolBody block={block} />
        </div>
      )}
    </div>
  )
}
```

关键设计决策：
- 首次展开时 `setMounted(true)` 触发内容渲染
- 再次折叠用 CSS `display: none` 隐藏，不销毁 DOM（避免重复计算 diff/高亮）
- EditDiffView 的 LCS 计算放在 `useMemo` 内，仅首次渲染触发

#### 文件改动

| 文件 | 改动 |
|------|------|
| `components/ChatRenderer/ChatRenderer.tsx` | ToolWidget / ReadPillRow / EditInlineCard 加懒渲染逻辑 |

### Part 3: 后端分页 API

#### API 变更

`GET /api/sessions/{session_id}/transcript`

新增查询参数：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `limit` | int | 50 | 返回消息数量 |
| `offset` | int | null | 从第 N 条开始。null 表示返回最后 limit 条 |

响应体扩展：

```json
{
  "messages": [...],
  "file_found": true,
  "total": 230,
  "has_more": true
}
```

#### 后端实现

```python
@router.get("/{session_id}/transcript")
def get_transcript(session_id: str, limit: int = 50, offset: int | None = None, db = Depends(get_db)):
    all_messages = parse_jsonl(session_id, cwd)
    total = len(all_messages)

    if offset is None:
        # 默认返回最后 limit 条
        start = max(0, total - limit)
    else:
        start = offset

    end = min(start + limit, total)
    return {
        "messages": all_messages[start:end],
        "file_found": True,
        "total": total,
        "has_more": start > 0,
    }
```

JSONL 解析优化：当 `offset` 为 null（取最后 N 条）时，从文件尾部反向读取行，避免解析整个文件。使用 `file.seek(0, 2)` 定位到文件末尾反向扫描换行符。

#### 前端分页加载

```typescript
// useSessionData.ts
const [allMessages, setAllMessages] = useState<TranscriptMessage[]>([])
const [total, setTotal] = useState(0)
const [hasMore, setHasMore] = useState(false)

// 首次加载最新 50 条
async function loadInitial(sid: string) {
  const r = await api.getTranscript(sid) // limit=50, offset=null
  setAllMessages(r.messages)
  setTotal(r.total)
  setHasMore(r.has_more)
}

// 向上加载更多
async function loadMore() {
  if (!hasMore) return
  const nextOffset = Math.max(0, total - allMessages.length - 50)
  const r = await api.getTranscript(sid, { limit: 50, offset: nextOffset })
  setAllMessages(prev => [...r.messages, ...prev])
  setHasMore(r.has_more)
}
```

Virtuoso 集成：使用 `startReached` 回调触发 `loadMore`，`firstItemIndex` 从 `total - allMessages.length` 开始以保持滚动位置。

#### 文件改动

| 文件 | 改动 |
|------|------|
| `backend/app/routers/sessions.py` | transcript 端点加 offset/limit 参数 |
| `tauri/src/lib/api/http.ts` | getTranscript 加参数支持 |
| `tauri/src/lib/api/types.ts` | 响应类型加 total/has_more |
| `tauri/src/components/SessionChat/useSessionData.ts` | 分页加载逻辑 |

### Part 4: 语法高亮 Web Worker

#### 架构

```
主线程                          Worker 线程
  │                               │
  ├─ useHighlight(code, lang) ─→  │ hljs-worker.ts
  │   postMessage({id,code,lang}) │   import hljs
  │                               │   hljs.highlight(code, {language})
  │   onmessage({id, html})  ←──  │   postMessage({id, html})
  │   setState(html)              │
  └────────────────────────────── │
```

#### Worker 文件

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

hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('css', css)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('xml', xml)

self.onmessage = (e: MessageEvent<{ id: string; code: string; language?: string }>) => {
  const { id, code, language } = e.data
  try {
    const result = language
      ? hljs.highlight(code, { language })
      : hljs.highlightAuto(code)
    self.postMessage({ id, html: result.value })
  } catch {
    self.postMessage({ id, html: code })
  }
}
```

#### Hook

```typescript
// tauri/src/lib/useHighlight.ts
const worker = new Worker(new URL('./hljs-worker.ts', import.meta.url), { type: 'module' })
const cache = new Map<string, string>()
const pending = new Map<string, (html: string) => void>()

worker.onmessage = (e) => {
  const { id, html } = e.data
  cache.set(id, html)
  pending.get(id)?.(html)
  pending.delete(id)
}

export function useHighlight(code: string, language?: string): { html: string; loading: boolean } {
  const key = `${language || 'auto'}:${code}`
  const cached = cache.get(key)
  const [html, setHtml] = useState(cached || '')
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    if (cached) { setHtml(cached); setLoading(false); return }
    pending.set(key, (result) => { setHtml(result); setLoading(false) })
    worker.postMessage({ id: key, code, language })
  }, [key])

  return { html, loading }
}
```

#### 降级策略

Worker 初始化失败时（如 CSP 限制），回退到主线程同步高亮：

```typescript
let workerAvailable = true
try {
  worker = new Worker(...)
} catch {
  workerAvailable = false
}

// useHighlight 中：
if (!workerAvailable) {
  return { html: hljs.highlight(code, { language }).value, loading: false }
}
```

#### 消费组件适配

| 组件 | 当前方式 | 改为 |
|------|----------|------|
| BashStatusLine | `hljs.highlight()` 同步 | `useHighlight(cmd, 'bash')` |
| ReadFileView | `hljs.highlightAuto()` 同步 | `useHighlight(code, detectedLang)` |
| RichTextBlock 代码块 | react-markdown rehype-highlight | 自定义 `code` 组件用 `useHighlight` |

#### 文件改动

| 文件 | 改动 |
|------|------|
| `tauri/src/lib/hljs-worker.ts` | 新建 Worker 文件 |
| `tauri/src/lib/useHighlight.ts` | 新建 Hook |
| `components/ChatRenderer/ChatRenderer.tsx` | BashStatusLine/ReadFileView/代码块适配 |

## 预期效果总结

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 首屏加载（大会话） | 2-5s | ~100ms |
| 可视区 DOM 节点 | 数万 | ~100 |
| 滚动帧率 | 卡顿 | 60fps |
| 大文件高亮 | 主线程阻塞 100-500ms | 零阻塞（异步） |
| 网络传输 | 全量数 MB | 首批 ~50KB |

## 实施顺序

1. Part 2 (懒渲染) — 最小改动，立即见效
2. Part 1 (虚拟滚动 + memo) — 核心优化
3. Part 3 (后端分页) — 与虚拟滚动的 startReached 联动
4. Part 4 (Worker 高亮) — 独立模块，可并行开发
