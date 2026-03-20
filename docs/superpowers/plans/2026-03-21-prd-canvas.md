# PRD 需求画布 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将任务管理重构为对话驱动 + pixi.js 画布可视化的 PRD 编排系统

**Architecture:** 左右拆分布局（pixi.js 画布 + PRD 文档编辑），悬浮 AI 对话窗口全局可用，Claude 会话 resume 机制避免进程常驻，react-virtuoso 虚拟滚动支持大量消息

**Tech Stack:** pixi.js v8, dagre, react-virtuoso, Zustand, Monaco Editor, FastAPI, SQLite

**Spec:** `docs/superpowers/specs/2026-03-21-prd-canvas-design.md`

---

### Task 1: 后端数据模型 + API 扩展

**Files:**
- Modify: `backend/app/models.py:54-78` (Task 表新增字段)
- Modify: `backend/app/schemas.py` (TaskOut 新增字段)
- Modify: `backend/app/routers/interview.py:84-88` (消息分页)
- Modify: `backend/app/main.py:63-72` (迁移 SQL)
- Create: `backend/app/routers/canvas.py` (画布数据 CRUD)

- [ ] **Step 1: Task 模型新增字段**

`backend/app/models.py` Task 类新增：
```python
claude_session_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
canvas_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON: 节点+连线+位置
```

- [ ] **Step 2: Schema 更新**

`backend/app/schemas.py` TaskOut 新增：
```python
claude_session_id: Optional[str] = None
canvas_data: Optional[str] = None
```

- [ ] **Step 3: 迁移 SQL**

`backend/app/main.py` lifespan 中添加：
```python
"ALTER TABLE tasks ADD COLUMN claude_session_id VARCHAR(128)",
"ALTER TABLE tasks ADD COLUMN canvas_data TEXT",
```

- [ ] **Step 4: 消息分页 API**

`backend/app/routers/interview.py` 修改 get_interview_messages：
```python
from fastapi import Query

@router.get("/{task_id}/interview/messages", summary="获取访谈历史（分页）")
def get_interview_messages(
    task_id: int,
    before_id: Optional[int] = Query(None, description="加载此 ID 之前的消息"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = db.query(InterviewMessage).filter(InterviewMessage.task_id == task_id)
    if before_id:
        q = q.filter(InterviewMessage.id < before_id)
    total = db.query(InterviewMessage).filter(InterviewMessage.task_id == task_id).count()
    messages = q.order_by(InterviewMessage.id.desc()).limit(limit).all()
    return {"messages": list(reversed(messages)), "total": total, "has_more": len(messages) == limit}
```

- [ ] **Step 5: 画布数据 API**

创建 `backend/app/routers/canvas.py`：
```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import engine
from ..models import Task

router = APIRouter(prefix="/api/tasks", tags=["画布"])

def get_db():
    with Session(engine) as session:
        yield session

class CanvasDataBody(BaseModel):
    canvas_data: str  # JSON string

@router.get("/{task_id}/canvas", summary="获取画布数据")
def get_canvas(task_id: int, db: Session = Depends(get_db)):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    return {"task_id": task_id, "canvas_data": t.canvas_data}

@router.put("/{task_id}/canvas", summary="保存画布数据")
def save_canvas(task_id: int, body: CanvasDataBody, db: Session = Depends(get_db)):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    t.canvas_data = body.canvas_data
    db.commit()
    return {"ok": True}
```

- [ ] **Step 6: 注册 canvas router**

`backend/app/main.py` 添加：
```python
from .routers import canvas as canvas_router
# ...
app.include_router(canvas_router.router)
```

- [ ] **Step 7: 修改 chat WebSocket 支持 resume**

`backend/app/routers/chat.py` 的 `_run_claude` 已支持 `session_id` 参数（--resume），无需改动。前端传 session_id 即可。

- [ ] **Step 8: 验证后端**

```bash
cd backend && source .venv/bin/activate
python -c "from app.models import *; from app.routers.canvas import *; print('OK')"
```

- [ ] **Step 9: Commit**

```bash
git add backend/app/models.py backend/app/schemas.py backend/app/routers/interview.py backend/app/routers/canvas.py backend/app/main.py
git commit -m "feat: add canvas_data, claude_session_id, message pagination, canvas API"
```

---

### Task 2: 安装前端依赖 + 类型更新

**Files:**
- Modify: `tauri/package.json` (新增 pixi.js, react-virtuoso)
- Modify: `tauri/src/lib/api/types.ts` (Task 扩展, 分页响应类型)
- Modify: `tauri/src/lib/api/http.ts` (canvas API, 分页消息 API)

- [ ] **Step 1: 安装依赖**

```bash
cd tauri && pnpm add pixi.js react-virtuoso
```

- [ ] **Step 2: 类型更新**

`tauri/src/lib/api/types.ts` Task 接口新增：
```typescript
claude_session_id?: string | null
canvas_data?: string | null
```

新增类型：
```typescript
export interface PaginatedMessages {
  messages: InterviewMessage[]
  total: number
  has_more: boolean
}

export interface CanvasData {
  task_id: number
  canvas_data: string | null
}

// 画布节点数据
export interface CanvasNodeData {
  id: string
  type: 'module' | 'wireframe' | 'note' | 'group'
  x: number
  y: number
  width: number
  height: number
  title: string
  icon?: string
  status?: 'confirmed' | 'discussing' | 'draft'
  features?: { text: string; done: boolean }[]
  color?: number
  content?: string  // 线稿/标注内容
}

export interface CanvasEdgeData {
  id: string
  source: string
  target: string
  color?: number
}

export interface CanvasState {
  nodes: CanvasNodeData[]
  edges: CanvasEdgeData[]
  zoom?: number
  panX?: number
  panY?: number
}
```

- [ ] **Step 3: API 方法**

`tauri/src/lib/api/http.ts` HttpAdapter 新增：
```typescript
getCanvasData(taskId: number) {
  return this.fetch<CanvasData>(`/api/tasks/${taskId}/canvas`)
}

async saveCanvasData(taskId: number, data: string) {
  await this.fetch<{ ok: boolean }>(`/api/tasks/${taskId}/canvas`, {
    method: 'PUT',
    body: JSON.stringify({ canvas_data: data }),
  })
  cache.invalidate(`task:${taskId}`)
}

getInterviewMessagesPaginated(taskId: number, beforeId?: number, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (beforeId != null) params.set('before_id', String(beforeId))
  return this.fetch<PaginatedMessages>(
    `/api/tasks/${taskId}/interview/messages?${params}`
  )
}
```

ApiAdapter 接口也同步新增这三个方法签名。

- [ ] **Step 4: TypeScript 检查**

```bash
cd tauri && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add tauri/package.json tauri/pnpm-lock.yaml tauri/src/lib/api/types.ts tauri/src/lib/api/http.ts
git commit -m "feat: add pixi.js, react-virtuoso, canvas types and API methods"
```

---

### Task 3: Canvas Store + 页面骨架

**Files:**
- Create: `tauri/src/lib/store/canvas.ts`
- Create: `tauri/src/features/canvas/index.tsx`
- Create: `tauri/src/features/canvas/canvas.module.css`
- Create: `tauri/src/features/canvas/components/TabBar.tsx`
- Create: `tauri/src/features/canvas/components/SplitLayout.tsx`
- Modify: `tauri/src/app/Router.tsx` (替换 PlaceholderPage)

- [ ] **Step 1: Canvas Store**

创建 `tauri/src/lib/store/canvas.ts`：
```typescript
import { create } from 'zustand'
import type { CanvasNodeData, CanvasEdgeData } from '../api/types'

interface CanvasTab {
  taskId: number
  title: string
  status: 'active' | 'waiting' | 'done' | 'draft'
}

interface CanvasStore {
  // Tabs
  tabs: CanvasTab[]
  activeTabTaskId: number | null
  addTab(tab: CanvasTab): void
  removeTab(taskId: number): void
  setActiveTab(taskId: number): void

  // Canvas data (per active tab)
  nodes: CanvasNodeData[]
  edges: CanvasEdgeData[]
  selectedNodeIds: string[]
  zoom: number
  panX: number
  panY: number

  setNodes(nodes: CanvasNodeData[]): void
  setEdges(edges: CanvasEdgeData[]): void
  updateNode(id: string, patch: Partial<CanvasNodeData>): void
  addNode(node: CanvasNodeData): void
  removeNode(id: string): void
  addEdge(edge: CanvasEdgeData): void
  removeEdge(id: string): void
  setSelection(ids: string[]): void
  setZoom(zoom: number): void
  setPan(x: number, y: number): void

  // Split layout
  splitRatio: number
  setSplitRatio(ratio: number): void
}

export const useCanvasStore = create<CanvasStore>()((set, get) => ({
  tabs: [],
  activeTabTaskId: null,
  addTab: (tab) => set((s) => {
    if (s.tabs.find((t) => t.taskId === tab.taskId)) return { activeTabTaskId: tab.taskId }
    return { tabs: [...s.tabs, tab], activeTabTaskId: tab.taskId }
  }),
  removeTab: (taskId) => set((s) => {
    const tabs = s.tabs.filter((t) => t.taskId !== taskId)
    const active = s.activeTabTaskId === taskId ? (tabs[0]?.taskId ?? null) : s.activeTabTaskId
    return { tabs, activeTabTaskId: active }
  }),
  setActiveTab: (taskId) => set({ activeTabTaskId: taskId }),

  nodes: [],
  edges: [],
  selectedNodeIds: [],
  zoom: 1,
  panX: 60,
  panY: 30,

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  updateNode: (id, patch) => set((s) => ({
    nodes: s.nodes.map((n) => n.id === id ? { ...n, ...patch } : n),
  })),
  addNode: (node) => set((s) => ({ nodes: [...s.nodes, node] })),
  removeNode: (id) => set((s) => ({
    nodes: s.nodes.filter((n) => n.id !== id),
    edges: s.edges.filter((e) => e.source !== id && e.target !== id),
    selectedNodeIds: s.selectedNodeIds.filter((sid) => sid !== id),
  })),
  addEdge: (edge) => set((s) => ({ edges: [...s.edges, edge] })),
  removeEdge: (id) => set((s) => ({ edges: s.edges.filter((e) => e.id !== id) })),
  setSelection: (ids) => set({ selectedNodeIds: ids }),
  setZoom: (zoom) => set({ zoom }),
  setPan: (x, y) => set({ panX: x, panY: y }),

  splitRatio: 0.6,
  setSplitRatio: (ratio) => set({ splitRatio: ratio }),
}))
```

- [ ] **Step 2: SplitLayout 组件**

创建 `tauri/src/features/canvas/components/SplitLayout.tsx`：
```typescript
import { useCallback, useRef, type ReactNode } from 'react'
import styles from '../canvas.module.css'

interface SplitLayoutProps {
  left: ReactNode
  right: ReactNode
  ratio: number
  onRatioChange(ratio: number): void
}

export function SplitLayout({ left, right, ratio, onRatioChange }: SplitLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = true
    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const r = Math.max(0.2, Math.min(0.8, (ev.clientX - rect.left) / rect.width))
      onRatioChange(r)
    }
    const handleUp = () => {
      dragRef.current = false
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [onRatioChange])

  return (
    <div ref={containerRef} className={styles.splitContainer}>
      <div className={styles.splitPane} style={{ flex: ratio }}>{left}</div>
      <div className={styles.splitDivider} onMouseDown={handleMouseDown} />
      <div className={styles.splitPane} style={{ flex: 1 - ratio }}>{right}</div>
    </div>
  )
}
```

- [ ] **Step 3: TabBar 组件**

创建 `tauri/src/features/canvas/components/TabBar.tsx`：
```typescript
import { useCanvasStore } from '../../../lib/store/canvas'
import styles from '../canvas.module.css'

export function TabBar() {
  const { tabs, activeTabTaskId, setActiveTab, removeTab, addTab } = useCanvasStore()

  const statusColors: Record<string, string> = {
    active: '#10b981', waiting: '#f59e0b', done: '#3b82f6', draft: '#6b7280',
  }

  return (
    <div className={styles.tabBar}>
      {tabs.map((tab) => (
        <div
          key={tab.taskId}
          className={`${styles.tab} ${tab.taskId === activeTabTaskId ? styles.tabActive : ''}`}
          onClick={() => setActiveTab(tab.taskId)}
        >
          <span className={styles.tabDot} style={{ background: statusColors[tab.status] }} />
          <span className={styles.tabTitle}>{tab.title}</span>
          <button
            className={styles.tabClose}
            onClick={(e) => { e.stopPropagation(); removeTab(tab.taskId); }}
          >×</button>
        </div>
      ))}
      <div className={styles.tabBarRight}>
        <button className={styles.tabBarBtn}>+ 新需求</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: CSS Modules**

创建 `tauri/src/features/canvas/canvas.module.css`：
```css
.page { display: flex; flex-direction: column; height: 100%; background: var(--tc-bg-primary, #0f0f17); }

/* Tab bar */
.tabBar { height: 36px; background: var(--tc-bg-secondary, #13131d); border-bottom: 1px solid var(--tc-border, #1e1e2e); display: flex; align-items: center; padding: 0 8px; gap: 2px; flex-shrink: 0; }
.tab { padding: 5px 12px; font-size: 12px; color: var(--tc-text-secondary, #666); cursor: pointer; border-radius: 6px 6px 0 0; display: flex; align-items: center; gap: 6px; transition: all .1s; }
.tab:hover { color: var(--tc-text-primary, #aaa); }
.tabActive { background: var(--tc-bg-primary, #0f0f17); color: #fff; }
.tabDot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.tabTitle { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tabClose { background: none; border: none; color: var(--tc-text-secondary); cursor: pointer; font-size: 10px; opacity: 0; padding: 0 2px; }
.tab:hover .tabClose { opacity: 0.6; }
.tabBarRight { margin-left: auto; display: flex; gap: 4px; }
.tabBarBtn { background: none; border: 1px solid var(--tc-border, #2a2a3a); color: var(--tc-text-secondary); border-radius: 4px; padding: 3px 10px; font-size: 11px; cursor: pointer; }
.tabBarBtn:hover { background: var(--tc-bg-hover, #1e1e2e); color: var(--tc-text-primary); }

/* Split */
.splitContainer { flex: 1; display: flex; overflow: hidden; }
.splitPane { display: flex; flex-direction: column; min-width: 240px; overflow: hidden; }
.splitDivider { width: 4px; background: var(--tc-border, #1a1a25); cursor: col-resize; flex-shrink: 0; transition: background .15s; }
.splitDivider:hover { background: var(--tc-accent, #007acc); }

/* Pane header */
.paneHeader { height: 30px; background: var(--tc-bg-secondary, #111119); border-bottom: 1px solid var(--tc-border); display: flex; align-items: center; padding: 0 12px; gap: 8px; flex-shrink: 0; }
.paneLabel { font-size: 11px; color: var(--tc-text-secondary, #555); font-weight: 600; }
.paneBadge { font-size: 9px; padding: 1px 6px; border-radius: 6px; background: var(--tc-accent, #007acc); color: var(--tc-text-primary); opacity: 0.6; }

/* Canvas container */
.canvasContainer { flex: 1; position: relative; background: #0b0b12; overflow: hidden; }
.canvasHud { position: absolute; bottom: 10px; left: 10px; display: flex; gap: 8px; z-index: 5; }
.canvasChip { background: var(--tc-bg-secondary, #1a1a28); border: 1px solid var(--tc-border); border-radius: 6px; padding: 4px 10px; font-size: 10px; color: var(--tc-text-secondary); }
.canvasTools { position: absolute; top: 10px; right: 10px; display: flex; gap: 4px; z-index: 5; }
.canvasToolBtn { background: var(--tc-bg-secondary); border: 1px solid var(--tc-border); border-radius: 5px; padding: 4px 10px; font-size: 10px; color: var(--tc-text-secondary); cursor: pointer; }
.canvasToolBtn:hover { background: var(--tc-bg-hover); color: var(--tc-text-primary); }

/* PRD doc */
.prdDoc { flex: 1; overflow-y: auto; padding: 20px 24px; }

/* Empty state */
.empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--tc-text-secondary); font-size: 13px; }
```

- [ ] **Step 5: 页面入口**

创建 `tauri/src/features/canvas/index.tsx`：
```typescript
import { useCanvasStore } from '../../lib/store/canvas'
import { TabBar } from './components/TabBar'
import { SplitLayout } from './components/SplitLayout'
import styles from './canvas.module.css'

export default function CanvasPage() {
  const { activeTabTaskId, splitRatio, setSplitRatio } = useCanvasStore()

  return (
    <div className={styles.page}>
      <TabBar />
      {activeTabTaskId ? (
        <SplitLayout
          ratio={splitRatio}
          onRatioChange={setSplitRatio}
          left={
            <div className={styles.splitPane}>
              <div className={styles.paneHeader}>
                <span className={styles.paneLabel}>需求画布</span>
              </div>
              <div className={styles.canvasContainer} id="pixi-canvas-container">
                <div className={styles.empty}>画布加载中...</div>
              </div>
            </div>
          }
          right={
            <div className={styles.splitPane}>
              <div className={styles.paneHeader}>
                <span className={styles.paneLabel}>PRD 文档</span>
              </div>
              <div className={styles.prdDoc}>
                <div className={styles.empty}>选择需求查看 PRD</div>
              </div>
            </div>
          }
        />
      ) : (
        <div className={styles.empty}>
          点击 "+ 新需求" 或通过 AI 助手创建需求开始
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: 路由注册**

修改 `tauri/src/app/Router.tsx`：
```typescript
// 添加 lazy import
const CanvasPage = lazy(() => import('../features/canvas'))

// 替换 /canvas 路由
<Route path="/canvas" element={<CanvasPage />} />
```

- [ ] **Step 7: TypeScript 检查 + Commit**

```bash
cd tauri && npx tsc --noEmit
git add tauri/src/lib/store/canvas.ts tauri/src/features/canvas/ tauri/src/app/Router.tsx
git commit -m "feat: canvas page skeleton with tab bar, split layout, and store"
```

---

### Task 4: pixi.js 画布引擎核心

**Files:**
- Create: `tauri/src/features/canvas/engine/PixiCanvas.ts`
- Create: `tauri/src/features/canvas/engine/ModuleNode.ts`
- Create: `tauri/src/features/canvas/engine/EdgeRenderer.ts`
- Create: `tauri/src/features/canvas/engine/InteractionManager.ts`
- Create: `tauri/src/features/canvas/components/CanvasPanel.tsx`

- [ ] **Step 1: PixiCanvas — 引擎初始化**

创建 `tauri/src/features/canvas/engine/PixiCanvas.ts`：
```typescript
import * as PIXI from 'pixi.js'

export class PixiCanvas {
  app: PIXI.Application
  world: PIXI.Container
  private _zoom = 1
  private _panX = 60
  private _panY = 30
  private _isPanning = false
  private _lastPan = { x: 0, y: 0 }
  private _onZoomChange?: (zoom: number) => void
  private _onPanChange?: (x: number, y: number) => void

  constructor() {
    this.app = new PIXI.Application()
    this.world = new PIXI.Container()
  }

  async init(container: HTMLElement) {
    await this.app.init({
      resizeTo: container,
      background: 0x0b0b12,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })
    container.appendChild(this.app.canvas as HTMLCanvasElement)
    this.app.stage.addChild(this.world)
    this._setupPanZoom()
    this._updateTransform()
  }

  destroy() {
    this.app.destroy(true)
  }

  get zoom() { return this._zoom }
  get panX() { return this._panX }
  get panY() { return this._panY }

  setZoom(z: number) { this._zoom = z; this._updateTransform() }
  setPan(x: number, y: number) { this._panX = x; this._panY = y; this._updateTransform() }
  onZoomChange(cb: (z: number) => void) { this._onZoomChange = cb }
  onPanChange(cb: (x: number, y: number) => void) { this._onPanChange = cb }

  fitAll(nodes: { x: number; y: number; width: number; height: number }[]) {
    if (!nodes.length) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    nodes.forEach((n) => {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height)
    })
    const w = maxX - minX + 80, h = maxY - minY + 80
    const sw = this.app.screen.width, sh = this.app.screen.height
    this._zoom = Math.min(sw / w, sh / h, 1.5)
    this._panX = (sw - w * this._zoom) / 2 - minX * this._zoom
    this._panY = (sh - h * this._zoom) / 2 - minY * this._zoom
    this._updateTransform()
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this._panX) / this._zoom, y: (sy - this._panY) / this._zoom }
  }

  private _updateTransform() {
    this.world.scale.set(this._zoom)
    this.world.position.set(this._panX, this._panY)
    this._onZoomChange?.(this._zoom)
    this._onPanChange?.(this._panX, this._panY)
  }

  private _setupPanZoom() {
    const canvas = this.app.canvas as HTMLCanvasElement

    canvas.addEventListener('pointerdown', (e) => {
      this._isPanning = true
      this._lastPan = { x: e.clientX, y: e.clientY }
    })
    window.addEventListener('pointermove', (e) => {
      if (!this._isPanning) return
      this._panX += e.clientX - this._lastPan.x
      this._panY += e.clientY - this._lastPan.y
      this._lastPan = { x: e.clientX, y: e.clientY }
      this._updateTransform()
    })
    window.addEventListener('pointerup', () => { this._isPanning = false })

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.93 : 1.07
      const old = this._zoom
      this._zoom = Math.max(0.1, Math.min(3, this._zoom * factor))
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      this._panX = mx - (mx - this._panX) * (this._zoom / old)
      this._panY = my - (my - this._panY) * (this._zoom / old)
      this._updateTransform()
    }, { passive: false })
  }
}
```

- [ ] **Step 2: ModuleNode — 模块卡片渲染**

创建 `tauri/src/features/canvas/engine/ModuleNode.ts`：
```typescript
import * as PIXI from 'pixi.js'
import type { CanvasNodeData } from '../../../lib/api/types'

const STATUS_COLORS: Record<string, number> = {
  confirmed: 0x10b981, discussing: 0xf59e0b, draft: 0x6b7280,
}

export class ModuleNode {
  container: PIXI.Container
  private _data: CanvasNodeData
  private _selected = false
  private _onDragEnd?: (id: string, x: number, y: number) => void
  private _onSelect?: (id: string) => void

  constructor(data: CanvasNodeData) {
    this._data = data
    this.container = new PIXI.Container()
    this.container.position.set(data.x, data.y)
    this.container.eventMode = 'static'
    this.container.cursor = 'grab'
    this._render()
    this._setupDrag()
  }

  get id() { return this._data.id }
  get data() { return this._data }

  update(patch: Partial<CanvasNodeData>) {
    Object.assign(this._data, patch)
    if (patch.x != null || patch.y != null) {
      this.container.position.set(this._data.x, this._data.y)
    }
    this._render()
  }

  setSelected(v: boolean) { this._selected = v; this._render() }
  onDragEnd(cb: (id: string, x: number, y: number) => void) { this._onDragEnd = cb }
  onSelect(cb: (id: string) => void) { this._onSelect = cb }

  private _render() {
    this.container.removeChildren()
    const d = this._data
    const w = d.width || 200, h = d.height || 100
    const color = d.color || STATUS_COLORS[d.status || 'draft'] || 0x6b7280

    // Shadow
    const shadow = new PIXI.Graphics()
    shadow.roundRect(3, 3, w, h, 10)
    shadow.fill({ color: 0x000000, alpha: 0.2 })
    this.container.addChild(shadow)

    // Background
    const bg = new PIXI.Graphics()
    bg.roundRect(0, 0, w, h, 10)
    bg.fill({ color: 0x161622, alpha: 0.95 })
    bg.roundRect(0, 0, w, h, 10)
    bg.stroke({ width: this._selected ? 2 : 1, color: this._selected ? 0x007acc : color, alpha: this._selected ? 0.8 : 0.3 })
    // Left color bar
    bg.roundRect(0, 4, 4, h - 8, 2)
    bg.fill({ color })
    this.container.addChild(bg)

    // Header bg
    const headBg = new PIXI.Graphics()
    headBg.roundRect(1, 1, w - 2, 26, 9)
    headBg.fill({ color: 0x1a1a2a, alpha: 0.6 })
    this.container.addChild(headBg)

    // Title
    const title = new PIXI.Text({
      text: `${d.icon || ''} ${d.title}`.trim(),
      style: { fontSize: 12, fill: 0xeeeeee, fontFamily: 'system-ui', fontWeight: '600' },
    })
    title.position.set(12, 5)
    this.container.addChild(title)

    // Status badge
    if (d.status) {
      const stColor = STATUS_COLORS[d.status] || 0x6b7280
      const labels: Record<string, string> = { confirmed: '已确认', discussing: '讨论中', draft: '待讨论' }
      const stBg = new PIXI.Graphics()
      stBg.roundRect(w - 50, 5, 44, 16, 8)
      stBg.fill({ color: stColor, alpha: 0.15 })
      this.container.addChild(stBg)
      const stText = new PIXI.Text({ text: labels[d.status] || d.status, style: { fontSize: 9, fill: stColor, fontFamily: 'system-ui' } })
      stText.position.set(w - 47, 7)
      this.container.addChild(stText)
    }

    // Features
    if (d.features) {
      d.features.forEach((f, i) => {
        const fy = 32 + i * 17
        if (fy + 14 > h) return // overflow
        const sym = new PIXI.Text({ text: f.done ? '✓' : '○', style: { fontSize: 11, fill: f.done ? 0x10b981 : 0x555555, fontFamily: 'system-ui' } })
        sym.position.set(14, fy)
        this.container.addChild(sym)
        const ft = new PIXI.Text({ text: f.text, style: { fontSize: 11, fill: 0xaaaaaa, fontFamily: 'system-ui' } })
        ft.position.set(28, fy)
        this.container.addChild(ft)
      })
    }
  }

  private _setupDrag() {
    let dragging = false
    const doff = { x: 0, y: 0 }

    this.container.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      dragging = true
      this.container.cursor = 'grabbing'
      const parent = this.container.parent
      const wp = parent.toLocal(e.global)
      doff.x = wp.x - this._data.x
      doff.y = wp.y - this._data.y
      this._onSelect?.(this._data.id)
      e.stopPropagation()
    })
    this.container.on('globalpointermove', (e: PIXI.FederatedPointerEvent) => {
      if (!dragging) return
      const parent = this.container.parent
      const wp = parent.toLocal(e.global)
      this._data.x = wp.x - doff.x
      this._data.y = wp.y - doff.y
      this.container.position.set(this._data.x, this._data.y)
    })
    this.container.on('pointerup', () => {
      if (dragging) {
        dragging = false
        this.container.cursor = 'grab'
        this._onDragEnd?.(this._data.id, this._data.x, this._data.y)
      }
    })
    this.container.on('pointerupoutside', () => {
      dragging = false
      this.container.cursor = 'grab'
    })
  }
}
```

- [ ] **Step 3: EdgeRenderer — 连线**

创建 `tauri/src/features/canvas/engine/EdgeRenderer.ts`：
```typescript
import * as PIXI from 'pixi.js'
import type { CanvasEdgeData, CanvasNodeData } from '../../../lib/api/types'

export class EdgeRenderer {
  graphics: PIXI.Graphics

  constructor() {
    this.graphics = new PIXI.Graphics()
  }

  draw(edges: CanvasEdgeData[], nodes: Map<string, { x: number; y: number; width: number; height: number }>) {
    this.graphics.clear()
    edges.forEach((edge) => {
      const src = nodes.get(edge.source)
      const tgt = nodes.get(edge.target)
      if (!src || !tgt) return
      const sx = src.x + (src.width || 200)
      const sy = src.y + (src.height || 100) / 2
      const ex = tgt.x
      const ey = tgt.y + (tgt.height || 100) / 2
      const mx = (sx + ex) / 2
      this.graphics.moveTo(sx, sy)
      this.graphics.bezierCurveTo(mx, sy, mx, ey, ex, ey)
      this.graphics.stroke({ width: 1.5, color: edge.color || 0x007acc, alpha: 0.35 })
    })
  }
}
```

- [ ] **Step 4: CanvasPanel 组件**

创建 `tauri/src/features/canvas/components/CanvasPanel.tsx`：
```typescript
import { useEffect, useRef } from 'react'
import { useCanvasStore } from '../../../lib/store/canvas'
import { PixiCanvas } from '../engine/PixiCanvas'
import { ModuleNode } from '../engine/ModuleNode'
import { EdgeRenderer } from '../engine/EdgeRenderer'
import styles from '../canvas.module.css'

export function CanvasPanel() {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<PixiCanvas | null>(null)
  const nodesRef = useRef<Map<string, ModuleNode>>(new Map())
  const edgeRendererRef = useRef<EdgeRenderer | null>(null)

  const { nodes, edges, setSelection, updateNode, zoom } = useCanvasStore()

  // 初始化 pixi
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const engine = new PixiCanvas()
    engineRef.current = engine
    const edgeRenderer = new EdgeRenderer()
    edgeRendererRef.current = edgeRenderer

    engine.init(el).then(() => {
      engine.world.addChildAt(edgeRenderer.graphics, 0)
      engine.onZoomChange((z) => useCanvasStore.getState().setZoom(z))
    })

    return () => {
      engine.destroy()
      engineRef.current = null
    }
  }, [])

  // 同步节点
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return

    const currentIds = new Set(nodes.map((n) => n.id))
    const existingIds = new Set(nodesRef.current.keys())

    // 移除
    existingIds.forEach((id) => {
      if (!currentIds.has(id)) {
        const node = nodesRef.current.get(id)
        if (node) engine.world.removeChild(node.container)
        nodesRef.current.delete(id)
      }
    })

    // 添加/更新
    nodes.forEach((data) => {
      let node = nodesRef.current.get(data.id)
      if (!node) {
        node = new ModuleNode(data)
        node.onDragEnd((id, x, y) => {
          updateNode(id, { x, y })
          redrawEdges()
        })
        node.onSelect((id) => setSelection([id]))
        nodesRef.current.set(data.id, node)
        engine.world.addChild(node.container)
      } else {
        node.update(data)
      }
    })

    redrawEdges()
  }, [nodes, edges, setSelection, updateNode])

  function redrawEdges() {
    const edgeRenderer = edgeRendererRef.current
    if (!edgeRenderer) return
    const nodeMap = new Map<string, { x: number; y: number; width: number; height: number }>()
    nodesRef.current.forEach((node, id) => {
      nodeMap.set(id, { x: node.data.x, y: node.data.y, width: node.data.width || 200, height: node.data.height || 100 })
    })
    edgeRenderer.draw(edges, nodeMap)
  }

  return (
    <>
      <div className={styles.paneHeader}>
        <span className={styles.paneLabel}>需求画布</span>
        <span className={styles.paneBadge}>{nodes.length} 模块</span>
      </div>
      <div ref={containerRef} className={styles.canvasContainer}>
        <div className={styles.canvasTools}>
          <button className={styles.canvasToolBtn} onClick={() => {
            engineRef.current?.fitAll(nodes.map((n) => ({ x: n.x, y: n.y, width: n.width || 200, height: n.height || 100 })))
          }}>适应屏幕</button>
        </div>
        <div className={styles.canvasHud}>
          <div className={styles.canvasChip}>缩放 <b>{Math.round(zoom * 100)}%</b></div>
          <div className={styles.canvasChip}>模块 <b>{nodes.length}</b></div>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 5: 集成到页面**

更新 `tauri/src/features/canvas/index.tsx`，将画布占位替换为 CanvasPanel：
```typescript
import { CanvasPanel } from './components/CanvasPanel'

// 在 SplitLayout 的 left prop 中：
left={<CanvasPanel />}
```

- [ ] **Step 6: TypeScript 检查 + Commit**

```bash
cd tauri && npx tsc --noEmit
git add tauri/src/features/canvas/engine/ tauri/src/features/canvas/components/CanvasPanel.tsx tauri/src/features/canvas/index.tsx
git commit -m "feat: pixi.js canvas engine with module nodes, edges, pan/zoom"
```

---

### Task 5: 悬浮聊天重构（富交互卡片 + session resume）

**Files:**
- Rename: `tauri/src/components/FloatingAssistant/` → `tauri/src/components/FloatingChat/`
- Create: `tauri/src/components/FloatingChat/RichCard.tsx`
- Create: `tauri/src/components/FloatingChat/ChoiceCard.tsx`
- Create: `tauri/src/components/FloatingChat/ProgressCard.tsx`
- Modify: `tauri/src/components/FloatingChat/FloatingAssistant.tsx` → `FloatingChat.tsx`
- Modify: `tauri/src/lib/store/chat.ts` (session resume)
- Modify: `tauri/src/hooks/useChatStream.ts` (富卡片解析 + resume)

- [ ] **Step 1: Chat Store 扩展**

`tauri/src/lib/store/chat.ts` 新增：
```typescript
// 在 ChatStore interface 中添加：
claudeSessionId: string | null
setClaudeSessionId(id: string | null): void

// 在 create 中添加：
claudeSessionId: null,
setClaudeSessionId: (id) => set({ claudeSessionId: id }),
```

- [ ] **Step 2: useChatStream 支持 resume**

`tauri/src/hooks/useChatStream.ts` 修改 `ws.onopen`：
```typescript
ws.onopen = () => {
  const { systemPrompt, pageContext, claudeSessionId } = useChatStore.getState()
  ws.send(JSON.stringify({
    type: 'chat',
    message,
    system_prompt: !claudeSessionId ? (systemPrompt || undefined) : undefined,
    session_id: claudeSessionId || undefined,
    context: pageContext,
  }))
}
```

在 `chat_done` handler 中提取 session_id：
```typescript
if (msg.type === 'chat_done') {
  const sessionId = msg.data?.session_id
  if (sessionId) s.setClaudeSessionId(sessionId)
  // ... rest of handler
}
```

- [ ] **Step 3: RichCard 组件**

创建 `tauri/src/components/FloatingChat/RichCard.tsx`：
```typescript
import type { ReactNode } from 'react'
import styles from './FloatingChat.module.css'

interface RichCardProps {
  icon?: string
  title: string
  children: ReactNode
  footer?: ReactNode
}

export function RichCard({ icon, title, children, footer }: RichCardProps) {
  return (
    <div className={styles.richCard}>
      <div className={styles.richCardHead}>
        {icon && <span>{icon}</span>}
        <span className={styles.richCardTitle}>{title}</span>
      </div>
      <div className={styles.richCardBody}>{children}</div>
      {footer && <div className={styles.richCardFooter}>{footer}</div>}
    </div>
  )
}
```

- [ ] **Step 4: ChoiceCard 组件**

创建 `tauri/src/components/FloatingChat/ChoiceCard.tsx`：
```typescript
import { useState } from 'react'
import { RichCard } from './RichCard'
import styles from './FloatingChat.module.css'

interface Choice {
  id: string
  label: string
  desc?: string
}

interface ChoiceCardProps {
  title: string
  icon?: string
  desc?: string
  choices: Choice[]
  multi?: boolean
  onConfirm(selected: string[]): void
}

export function ChoiceCard({ title, icon, desc, choices, multi, onConfirm }: ChoiceCardProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (multi) {
        next.has(id) ? next.delete(id) : next.add(id)
      } else {
        next.clear(); next.add(id)
      }
      return next
    })
  }

  return (
    <RichCard
      icon={icon}
      title={title}
      footer={
        <>
          <button className={styles.cardBtnCancel} onClick={() => onConfirm([])}>跳过</button>
          <button className={styles.cardBtnOk} onClick={() => onConfirm([...selected])} disabled={selected.size === 0}>
            确认选择
          </button>
        </>
      }
    >
      {desc && <div className={styles.cardDesc}>{desc}</div>}
      <div className={styles.choiceGroup}>
        {choices.map((c) => (
          <div key={c.id} className={`${styles.choiceBtn} ${selected.has(c.id) ? styles.choiceOn : ''}`} onClick={() => toggle(c.id)}>
            <div className={styles.choiceRadio} />
            <div>
              <div className={styles.choiceLabel}>{c.label}</div>
              {c.desc && <div className={styles.choiceSub}>{c.desc}</div>}
            </div>
          </div>
        ))}
      </div>
    </RichCard>
  )
}
```

- [ ] **Step 5: 更新 FloatingChat CSS**

在 `FloatingAssistant.module.css` 中追加富卡片样式（richCard, choiceBtn 等），参照 demo 的样式。

- [ ] **Step 6: 解析 AI 消息中的卡片标记**

在消息渲染中检测 `---CARD---` 标记，解析 JSON 并渲染对应卡片组件。

- [ ] **Step 7: Commit**

```bash
git add tauri/src/components/FloatingChat/ tauri/src/lib/store/chat.ts tauri/src/hooks/useChatStream.ts
git commit -m "feat: floating chat with rich cards, choice buttons, session resume"
```

---

### Task 6: PRD 文档编辑面板

**Files:**
- Create: `tauri/src/features/canvas/components/PrdDocPanel.tsx`
- Create: `tauri/src/features/canvas/hooks/useCanvasSync.ts`

- [ ] **Step 1: PrdDocPanel — Markdown 编辑+预览**

```typescript
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useCanvasStore } from '../../../lib/store/canvas'
import styles from '../canvas.module.css'

export function PrdDocPanel({ taskId }: { taskId: number }) {
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState('')

  // 从 task.prd_content 加载，编辑后保存

  return (
    <>
      <div className={styles.paneHeader}>
        <span className={styles.paneLabel}>PRD 文档</span>
        <button className={styles.canvasToolBtn} onClick={() => setEditing(!editing)}>
          {editing ? '预览' : '编辑'}
        </button>
      </div>
      <div className={styles.prdDoc}>
        {editing ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            style={{ width: '100%', height: '100%', background: 'transparent', color: '#ccc', border: 'none', outline: 'none', resize: 'none', fontFamily: 'monospace', fontSize: 13 }}
          />
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || '*等待 AI 生成 PRD...*'}</ReactMarkdown>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2: 集成到画布页面**

在 `features/canvas/index.tsx` 中 SplitLayout 的 right 换为 `<PrdDocPanel taskId={activeTabTaskId} />`

- [ ] **Step 3: Commit**

```bash
git add tauri/src/features/canvas/components/PrdDocPanel.tsx tauri/src/features/canvas/index.tsx
git commit -m "feat: PRD document panel with markdown edit/preview"
```

---

### Task 7: 集成测试 + Layout 更新

**Files:**
- Modify: `tauri/src/app/Layout.tsx` (更新 FloatingChat 引用)
- Modify: `tauri/src/app/Router.tsx` (确认路由)

- [ ] **Step 1: 确认所有导入路径正确**
- [ ] **Step 2: TypeScript 全量检查**

```bash
cd tauri && npx tsc --noEmit
```

- [ ] **Step 3: 后端验证**

```bash
cd backend && source .venv/bin/activate
python -c "from app.main import app; print('routes:', len(app.routes))"
```

- [ ] **Step 4: 最终 Commit**

```bash
git add -A
git commit -m "feat: PRD canvas system — pixi.js engine, floating chat, split layout, session resume"
```
