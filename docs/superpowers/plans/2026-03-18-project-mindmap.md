# 项目脑图功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 TaskConductor Tauri 客户端新增两种可编辑脑图：文件结构脑图（DevTools tab）和任务全景脑图（独立管理页），共享同一套 @xyflow/react 基础组件。

**Architecture:** 共享 `components/mindmap/` 层提供画布、自定义节点/边、Zustand store、dagre 布局。FileTreeMap 和 AdminMindMap 作为消费者，分别从后端 file-tree API 和 projects/tasks API 获取初始数据，转换为扁平 MindMapNode 数组。编辑状态持久化到 localStorage。

**Tech Stack:** React 19, @xyflow/react, dagre, Zustand 5, CSS Modules, FastAPI (Python)

**Spec:** `docs/superpowers/specs/2026-03-18-project-mindmap-design.md`

---

## File Structure

```
tauri/src/components/mindmap/
├── MindMapCanvas.tsx              # @xyflow/react 封装（网格背景/缩放/工具条）
├── MindMapNode.tsx                # 自定义节点（彩色描边/图标/badge/折叠/内联编辑）
├── MindMapEdge.tsx                # 自定义贝塞尔曲线边（颜色跟随分支）
├── MindMapToolbar.tsx             # 浮动工具栏（选中节点上方弹出）
├── MindMapContextMenu.tsx         # 右键菜单
├── MindMapZoomControls.tsx        # 底部胶囊缩放控件
├── use-mindmap-store.ts           # Zustand store（CRUD/撤销/重做/持久化）
├── use-mindmap-layout.ts          # dagre 布局 hook（nodes→positioned nodes+edges）
├── mindmap-utils.ts               # API 数据→MindMapNode 转换 + 分支颜色分配
├── mindmap-types.ts               # 类型定义（MindMapNodeData, 等）
└── mindmap.module.css             # 所有脑图样式

tauri/src/features/__dev__/tabs/
└── FileTreeMap.tsx                # 文件结构脑图（DevTools 新 tab）

tauri/src/features/admin/pages/
└── AdminMindMap.tsx               # 任务全景脑图页面
```

**修改的文件：**
- `tauri/package.json` — 新增依赖
- `tauri/src/features/__dev__/DevToolsPage.tsx` — 新增 tab
- `tauri/src/app/Router.tsx` — 新增路由
- `tauri/src/features/admin/AdminLayout.tsx` — 新增导航项
- `tauri/src/i18n/zh.json` + `en.json` — 新增翻译 key
- `tauri/src/lib/api/types.ts` — 新增 FileTreeNode 类型 + getFileTree 方法
- `tauri/src/lib/api/http.ts` — 实现 getFileTree
- `backend/app/routers/files.py` — 新增 file-tree 端点

---

### Task 1: 安装依赖

**Files:**
- Modify: `tauri/package.json`

- [ ] **Step 1: 安装 @xyflow/react 和 dagre**

```bash
cd /home/sichengli/Documents/code2/task-conductor/tauri && pnpm add @xyflow/react dagre @types/dagre
```

- [ ] **Step 2: 验证安装成功**

```bash
cd /home/sichengli/Documents/code2/task-conductor/tauri && node -e "require('@xyflow/react'); require('dagre'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd /home/sichengli/Documents/code2/task-conductor/tauri
git add package.json pnpm-lock.yaml
git commit -m "chore: add @xyflow/react and dagre dependencies for mindmap feature"
```

---

### Task 2: 类型定义 + 分支颜色工具

**Files:**
- Create: `tauri/src/components/mindmap/mindmap-types.ts`
- Create: `tauri/src/components/mindmap/mindmap-utils.ts`

- [ ] **Step 1: 创建类型定义**

```typescript
// tauri/src/components/mindmap/mindmap-types.ts

export interface MindMapNodeData {
  id: string
  type: 'root' | 'branch' | 'leaf'
  label: string
  icon?: string
  color?: string
  status?: string
  meta?: Record<string, unknown>
  collapsed?: boolean
  parentId: string | null
}

// FileTreeNode 定义在 api/types.ts 中，此处 re-export
export type { FileTreeNode } from '../../lib/api/types'

/** 分支颜色 palette */
export const BRANCH_COLORS = [
  '#2dd4bf', // 青绿
  '#a855f7', // 紫色
  '#fbbf24', // 琥珀
  '#3b82f6', // 蓝色
  '#f472b6', // 粉色
] as const

export const ROOT_COLOR = '#ff6b6b' // 珊瑚红
```

- [ ] **Step 2: 创建数据转换工具**

```typescript
// tauri/src/components/mindmap/mindmap-utils.ts

import type { MindMapNodeData, FileTreeNode } from './mindmap-types'
import { BRANCH_COLORS, ROOT_COLOR } from './mindmap-types'

let _idCounter = 0
function nextId(): string {
  return `mm-${++_idCounter}-${Date.now().toString(36)}`
}

export function resetIdCounter(): void {
  _idCounter = 0
}

/**
 * 递归文件树 → 扁平 MindMapNodeData[]
 */
export function fileTreeToNodes(
  tree: FileTreeNode,
  parentId: string | null = null,
  depth = 0,
  branchIdx = 0,
): MindMapNodeData[] {
  const id = nextId()
  const isRoot = parentId === null
  const color = isRoot ? ROOT_COLOR : BRANCH_COLORS[branchIdx % BRANCH_COLORS.length]

  const node: MindMapNodeData = {
    id,
    type: isRoot ? 'root' : tree.children?.length ? 'branch' : 'leaf',
    label: tree.name,
    icon: tree.type === 'directory' ? '📁' : '📄',
    color,
    parentId,
    collapsed: depth >= 2, // 深层默认折叠
    meta: { fileType: tree.type },
  }

  const result: MindMapNodeData[] = [node]

  if (tree.children) {
    tree.children.forEach((child, i) => {
      const childBranchIdx = isRoot ? i : branchIdx
      result.push(...fileTreeToNodes(child, id, depth + 1, childBranchIdx))
    })
  }

  return result
}

/**
 * 项目+任务数据 → 扁平 MindMapNodeData[]
 */
export function tasksToNodes(
  projects: Array<{ id: number; name: string }>,
  tasksByProject: Map<number, Array<{ id: number; title: string; current_stage?: string }>>,
): MindMapNodeData[] {
  const rootId = nextId()
  const result: MindMapNodeData[] = [
    {
      id: rootId,
      type: 'root',
      label: 'TaskConductor',
      icon: '🏗️',
      color: ROOT_COLOR,
      parentId: null,
    },
  ]

  projects.forEach((project, i) => {
    const projId = nextId()
    const color = BRANCH_COLORS[i % BRANCH_COLORS.length]
    const tasks = tasksByProject.get(project.id) ?? []

    result.push({
      id: projId,
      type: 'branch',
      label: project.name,
      icon: '📁',
      color,
      parentId: rootId,
      meta: { projectId: project.id },
    })

    tasks.forEach((task) => {
      result.push({
        id: nextId(),
        type: 'leaf',
        label: task.title,
        icon: '📋',
        color,
        status: task.current_stage ?? 'pending',
        parentId: projId,
        meta: { taskId: task.id },
      })
    })
  })

  return result
}

/**
 * 从节点列表派生 edges
 */
export function deriveEdges(nodes: MindMapNodeData[]) {
  return nodes
    .filter((n) => n.parentId !== null)
    .map((n) => ({
      id: `e-${n.parentId}-${n.id}`,
      source: n.parentId!,
      target: n.id,
      type: 'mindmap',
      data: { color: n.color },
    }))
}

/**
 * 获取某节点的所有后代 id（含自身）
 */
export function getDescendantIds(nodeId: string, nodes: MindMapNodeData[]): string[] {
  const ids = [nodeId]
  const children = nodes.filter((n) => n.parentId === nodeId)
  for (const child of children) {
    ids.push(...getDescendantIds(child.id, nodes))
  }
  return ids
}
```

- [ ] **Step 3: Commit**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/components/mindmap/mindmap-types.ts tauri/src/components/mindmap/mindmap-utils.ts
git commit -m "feat(mindmap): add type definitions and data transformation utilities"
```

---

### Task 3: Zustand Store（CRUD + 撤销/重做 + 持久化）

**Files:**
- Create: `tauri/src/components/mindmap/use-mindmap-store.ts`

- [ ] **Step 1: 创建 store**

```typescript
// tauri/src/components/mindmap/use-mindmap-store.ts

import { create } from 'zustand'
import type { MindMapNodeData } from './mindmap-types'
import { BRANCH_COLORS } from './mindmap-types'
import { getDescendantIds } from './mindmap-utils'

const MAX_HISTORY = 50

interface MindMapState {
  nodes: MindMapNodeData[]
  /** 历史栈 — 不进 localStorage */
  _history: MindMapNodeData[][]
  _future: MindMapNodeData[][]

  // 初始化
  initFromData(nodes: MindMapNodeData[]): void

  // CRUD
  addNode(parentId: string, label?: string): string
  addSibling(nodeId: string, label?: string): string
  updateNode(id: string, patch: Partial<MindMapNodeData>): void
  removeNode(id: string): void
  toggleCollapse(id: string): void
  reparentNode(nodeId: string, newParentId: string): void

  // 撤销/重做
  undo(): void
  redo(): void

  // 持久化
  save(key: string): void
  load(key: string): boolean
}

let _counter = 0
function newId() {
  return `mm-s-${++_counter}-${Date.now().toString(36)}`
}

function pushHistory(state: MindMapState): Partial<MindMapState> {
  const h = [...state._history, state.nodes]
  if (h.length > MAX_HISTORY) h.shift()
  return { _history: h, _future: [] }
}

export const useMindMapStore = create<MindMapState>()((set, get) => ({
  nodes: [],
  _history: [],
  _future: [],

  initFromData(nodes) {
    set({ nodes, _history: [], _future: [] })
  },

  addNode(parentId, label = '新节点') {
    const id = newId()
    const parent = get().nodes.find((n) => n.id === parentId)
    const color = parent?.color ?? BRANCH_COLORS[0]
    set((s) => ({
      ...pushHistory(s),
      nodes: [
        ...s.nodes,
        {
          id,
          type: 'leaf' as const,
          label,
          color,
          parentId,
          icon: '📝',
        },
      ],
    }))
    return id
  },

  addSibling(nodeId, label = '新节点') {
    const node = get().nodes.find((n) => n.id === nodeId)
    if (!node?.parentId) return ''
    return get().addNode(node.parentId, label)
  },

  updateNode(id, patch) {
    set((s) => ({
      ...pushHistory(s),
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    }))
  },

  removeNode(id) {
    const ids = new Set(getDescendantIds(id, get().nodes))
    set((s) => ({
      ...pushHistory(s),
      nodes: s.nodes.filter((n) => !ids.has(n.id)),
    }))
  },

  toggleCollapse(id) {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, collapsed: !n.collapsed } : n
      ),
    }))
  },

  reparentNode(nodeId, newParentId) {
    // 不能挂到自己的子树下
    const descendants = new Set(getDescendantIds(nodeId, get().nodes))
    if (descendants.has(newParentId)) return
    const newParent = get().nodes.find((n) => n.id === newParentId)
    set((s) => ({
      ...pushHistory(s),
      nodes: s.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, parentId: newParentId, color: newParent?.color ?? n.color }
          : n
      ),
    }))
  },

  undo() {
    const { _history, _future, nodes } = get()
    if (_history.length === 0) return
    const prev = _history[_history.length - 1]
    set({
      nodes: prev,
      _history: _history.slice(0, -1),
      _future: [nodes, ..._future],
    })
  },

  redo() {
    const { _future, _history, nodes } = get()
    if (_future.length === 0) return
    const next = _future[0]
    set({
      nodes: next,
      _future: _future.slice(1),
      _history: [..._history, nodes],
    })
  },

  save(key) {
    localStorage.setItem(key, JSON.stringify(get().nodes))
  },

  load(key) {
    const raw = localStorage.getItem(key)
    if (!raw) return false
    try {
      const nodes = JSON.parse(raw) as MindMapNodeData[]
      set({ nodes, _history: [], _future: [] })
      return true
    } catch {
      return false
    }
  },
}))
```

- [ ] **Step 2: Commit**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/components/mindmap/use-mindmap-store.ts
git commit -m "feat(mindmap): add Zustand store with CRUD, undo/redo, and localStorage persistence"
```

---

### Task 4: dagre 布局 hook

**Files:**
- Create: `tauri/src/components/mindmap/use-mindmap-layout.ts`

- [ ] **Step 1: 创建布局 hook**

```typescript
// tauri/src/components/mindmap/use-mindmap-layout.ts

import { useMemo } from 'react'
import dagre from 'dagre'
import type { Node, Edge } from '@xyflow/react'
import type { MindMapNodeData } from './mindmap-types'
import { deriveEdges } from './mindmap-utils'

const NODE_WIDTH = 200
const NODE_HEIGHT = 50
const RANK_SEP = 80
const NODE_SEP = 30

/**
 * 计算可见节点（排除被折叠祖先隐藏的节点）
 */
function getVisibleNodes(allNodes: MindMapNodeData[]): MindMapNodeData[] {
  const collapsedIds = new Set(
    allNodes.filter((n) => n.collapsed).map((n) => n.id)
  )

  return allNodes.filter((node) => {
    // root 永远可见
    if (!node.parentId) return true
    // 检查所有祖先是否有折叠的
    let current = node
    while (current.parentId) {
      if (collapsedIds.has(current.parentId)) return false
      const parent = allNodes.find((n) => n.id === current.parentId)
      if (!parent) break
      current = parent
    }
    return true
  })
}

export function useMindMapLayout(allNodes: MindMapNodeData[]) {
  return useMemo(() => {
    const visibleNodes = getVisibleNodes(allNodes)
    const edges = deriveEdges(visibleNodes)

    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph({
      rankdir: 'LR', // 左→右布局（脑图风格）
      ranksep: RANK_SEP,
      nodesep: NODE_SEP,
    })

    visibleNodes.forEach((node) => {
      g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
    })

    edges.forEach((edge) => {
      g.setEdge(edge.source, edge.target)
    })

    dagre.layout(g)

    const flowNodes: Node[] = visibleNodes.map((node) => {
      const pos = g.node(node.id)
      return {
        id: node.id,
        type: 'mindmap',
        position: {
          x: pos.x - NODE_WIDTH / 2,
          y: pos.y - NODE_HEIGHT / 2,
        },
        data: node,
      }
    })

    const flowEdges: Edge[] = edges.map((e) => ({
      ...e,
      type: 'mindmap',
    }))

    return { nodes: flowNodes, edges: flowEdges }
  }, [allNodes])
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/components/mindmap/use-mindmap-layout.ts
git commit -m "feat(mindmap): add dagre layout hook for tree positioning"
```

---

### Task 5: 自定义节点 + 自定义边

**Files:**
- Create: `tauri/src/components/mindmap/MindMapNode.tsx`
- Create: `tauri/src/components/mindmap/MindMapEdge.tsx`
- Create: `tauri/src/components/mindmap/mindmap.module.css`

- [ ] **Step 1: 创建 CSS 样式文件**

```css
/* tauri/src/components/mindmap/mindmap.module.css */

/* ── Canvas ────────────────────────────────── */
.canvas {
  width: 100%;
  height: 100%;
  position: relative;
  background: #13131a;
}

/* ── Node ──────────────────────────────────── */
.node {
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 100px;
  max-width: 260px;
  transition: box-shadow 0.15s;
  user-select: none;
}

.node[data-type='root'] {
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  padding: 12px 18px;
}

.nodeSelected {
  /* applied dynamically via JS — glow effect */
}

.nodeLabel {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nodeLabelEdit {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: inherit;
  font-size: inherit;
  font-weight: inherit;
  font-family: inherit;
  padding: 0;
  margin: 0;
  width: 100%;
}

.nodeIcon {
  flex-shrink: 0;
  font-size: 14px;
}

.nodeBadge {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 3px;
  flex-shrink: 0;
}

.nodeCollapseBtn {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.15);
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.5);
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.nodeChildCount {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.35);
  flex-shrink: 0;
}

/* ── Toolbar (floating) ────────────────────── */
.toolbar {
  position: absolute;
  display: flex;
  gap: 1px;
  padding: 4px 6px;
  background: rgba(30,30,42,0.95);
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  z-index: 50;
}

.toolbarBtn {
  padding: 4px 8px;
  font-size: 12px;
  color: #ccc;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
}

.toolbarBtn:hover {
  background: rgba(255,255,255,0.08);
}

/* ── Context Menu ──────────────────────────── */
.contextMenu {
  position: fixed;
  min-width: 160px;
  background: rgba(25,25,35,0.98);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  padding: 4px;
  z-index: 100;
}

.contextMenuItem {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: #ccc;
  border: none;
  background: none;
  border-radius: 5px;
  cursor: pointer;
  width: 100%;
  text-align: left;
}

.contextMenuItem:hover {
  background: rgba(255,255,255,0.06);
}

.contextMenuDivider {
  height: 1px;
  background: rgba(255,255,255,0.06);
  margin: 3px 0;
}

.contextMenuItemDanger {
  composes: contextMenuItem;
  color: #f87171;
}

/* ── Zoom Controls ─────────────────────────── */
.zoomControls {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 8px;
  background: rgba(30,30,42,0.9);
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.08);
  z-index: 10;
}

.zoomBtn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #888;
  cursor: pointer;
  border: none;
  background: none;
  border-radius: 50%;
}

.zoomBtn:hover {
  color: #ccc;
  background: rgba(255,255,255,0.06);
}

.zoomLevel {
  font-size: 11px;
  color: #666;
  padding: 0 8px;
  min-width: 36px;
  text-align: center;
}

/* ── Left Tool Rail ────────────────────────── */
.toolRail {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 4px;
  background: rgba(255,255,255,0.04);
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.06);
  z-index: 10;
}

.toolRailBtn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #888;
  border: none;
  background: none;
  border-radius: 5px;
  cursor: pointer;
}

.toolRailBtn:hover {
  color: #ccc;
  background: rgba(255,255,255,0.06);
}

/* ── Status Badge Colors ───────────────────── */
.statusDone {
  background: rgba(74,222,128,0.12);
  color: #4ade80;
}

.statusDev, .statusPrd, .statusPlan, .statusAnalysis {
  background: rgba(0,122,204,0.12);
  color: #7cc;
}

.statusPending, .statusInput {
  background: rgba(255,255,255,0.04);
  color: #666;
}
```

- [ ] **Step 2: 创建自定义节点组件**

```typescript
// tauri/src/components/mindmap/MindMapNode.tsx

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { MindMapNodeData } from './mindmap-types'
import { useMindMapStore } from './use-mindmap-store'
import styles from './mindmap.module.css'

/** 状态 → CSS class 映射 */
function statusClass(status?: string): string {
  if (!status) return ''
  if (status === 'done') return styles.statusDone
  if (status === 'pending' || status === 'input') return styles.statusPending
  return styles.statusDev // analysis, prd, plan, dev, test, deploy 等
}

export function MindMapNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as MindMapNodeData
  const { updateNode, toggleCollapse, removeNode, addNode } = useMindMapStore()
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(nodeData.label)
  const inputRef = useRef<HTMLInputElement>(null)

  // 子节点数量（从全局 nodes 获取）
  const childCount = useMindMapStore(
    (s) => s.nodes.filter((n) => n.parentId === nodeData.id).length
  )

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const commitEdit = useCallback(() => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== nodeData.label) {
      updateNode(nodeData.id, { label: trimmed })
    } else {
      setEditValue(nodeData.label)
    }
    setEditing(false)
  }, [editValue, nodeData.id, nodeData.label, updateNode])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        commitEdit()
      } else if (e.key === 'Escape') {
        setEditValue(nodeData.label)
        setEditing(false)
      }
    },
    [commitEdit, nodeData.label]
  )

  const bgColor = nodeData.color ? `${nodeData.color}14` : 'rgba(255,255,255,0.04)'
  const borderColor = nodeData.color ? `${nodeData.color}88` : 'rgba(255,255,255,0.12)'
  const borderWidth = nodeData.type === 'root' ? 2 : 1.5
  const glowShadow = selected && nodeData.color
    ? `0 0 18px ${nodeData.color}26`
    : 'none'

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div
        className={styles.node}
        data-type={nodeData.type}
        style={{
          background: bgColor,
          border: `${borderWidth}px solid ${borderColor}`,
          color: nodeData.color ?? '#ccc',
          boxShadow: glowShadow,
        }}
        onDoubleClick={() => {
          setEditValue(nodeData.label)
          setEditing(true)
        }}
      >
        {nodeData.icon && <span className={styles.nodeIcon}>{nodeData.icon}</span>}

        {editing ? (
          <input
            ref={inputRef}
            className={styles.nodeLabelEdit}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <span className={styles.nodeLabel}>{nodeData.label}</span>
        )}

        {nodeData.status && (
          <span className={`${styles.nodeBadge} ${statusClass(nodeData.status)}`}>
            {nodeData.status}
          </span>
        )}

        {childCount > 0 && (
          <>
            <span className={styles.nodeChildCount}>{childCount}</span>
            <button
              className={styles.nodeCollapseBtn}
              onClick={(e) => {
                e.stopPropagation()
                toggleCollapse(nodeData.id)
              }}
            >
              {nodeData.collapsed ? '▸' : '▾'}
            </button>
          </>
        )}
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </>
  )
}
```

- [ ] **Step 3: 创建自定义边组件**

```typescript
// tauri/src/components/mindmap/MindMapEdge.tsx

import { type EdgeProps, getBezierPath } from '@xyflow/react'

export function MindMapEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const color = (data as any)?.color ?? 'rgba(255,255,255,0.15)'
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.4,
  })

  return (
    <path
      id={id}
      d={edgePath}
      fill="none"
      stroke={`${color}66`}
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  )
}
```

- [ ] **Step 4: Commit**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/components/mindmap/MindMapNode.tsx tauri/src/components/mindmap/MindMapEdge.tsx tauri/src/components/mindmap/mindmap.module.css
git commit -m "feat(mindmap): add custom node and edge components with colored branches and inline editing"
```

---

### Task 6: 右键菜单 + 浮动工具栏 + 缩放控件

**Files:**
- Create: `tauri/src/components/mindmap/MindMapContextMenu.tsx`
- Create: `tauri/src/components/mindmap/MindMapToolbar.tsx`
- Create: `tauri/src/components/mindmap/MindMapZoomControls.tsx`

- [ ] **Step 1: 创建右键菜单**

```typescript
// tauri/src/components/mindmap/MindMapContextMenu.tsx

import { useEffect, useRef } from 'react'
import { useMindMapStore } from './use-mindmap-store'
import styles from './mindmap.module.css'

interface Props {
  x: number
  y: number
  nodeId: string
  onClose(): void
}

export function MindMapContextMenu({ x, y, nodeId, onClose }: Props) {
  const { addNode, addSibling, removeNode } = useMindMapStore()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const node = useMindMapStore((s) => s.nodes.find((n) => n.id === nodeId))

  return (
    <div ref={ref} className={styles.contextMenu} style={{ left: x, top: y }}>
      <button className={styles.contextMenuItem}
        onClick={() => { addNode(nodeId); onClose() }}>
        ＋ 添加子节点
      </button>
      {node?.parentId && (
        <button className={styles.contextMenuItem}
          onClick={() => { addSibling(nodeId); onClose() }}>
          ＋ 添加同级
        </button>
      )}
      <div className={styles.contextMenuDivider} />
      {node?.parentId && (
        <button className={styles.contextMenuItemDanger}
          onClick={() => { removeNode(nodeId); onClose() }}>
          ✕ 删除
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 创建浮动工具栏**

```typescript
// tauri/src/components/mindmap/MindMapToolbar.tsx

import { useMindMapStore } from './use-mindmap-store'
import styles from './mindmap.module.css'

interface Props {
  nodeId: string
  /** 工具栏应出现的画布坐标（节点上方） */
  x: number
  y: number
}

export function MindMapToolbar({ nodeId, x, y }: Props) {
  const { addNode, removeNode } = useMindMapStore()
  const node = useMindMapStore((s) => s.nodes.find((n) => n.id === nodeId))

  if (!node) return null

  return (
    <div className={styles.toolbar} style={{ left: x, top: y - 40 }}>
      <button className={styles.toolbarBtn}
        onClick={() => addNode(nodeId)} title="添加子节点">＋</button>
      {node.parentId && (
        <button className={styles.toolbarBtn}
          onClick={() => removeNode(nodeId)} title="删除">✕</button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 创建缩放控件**

```typescript
// tauri/src/components/mindmap/MindMapZoomControls.tsx

import { useReactFlow } from '@xyflow/react'
import { useState, useEffect } from 'react'
import styles from './mindmap.module.css'

export function MindMapZoomControls() {
  const { zoomIn, zoomOut, fitView, getZoom } = useReactFlow()
  const [zoom, setZoom] = useState(100)

  useEffect(() => {
    // 初始读取一次
    setZoom(Math.round(getZoom() * 100))
  }, [getZoom])

  return (
    <div className={styles.zoomControls}>
      <button className={styles.zoomBtn} onClick={() => { zoomOut(); setZoom(Math.round(getZoom() * 100)) }} title="缩小">
        −
      </button>
      <button className={styles.zoomBtn} onClick={() => { fitView({ padding: 0.2 }); setZoom(Math.round(getZoom() * 100)) }} title="适应">
        ○
      </button>
      <span className={styles.zoomLevel}>{zoom}%</span>
      <button className={styles.zoomBtn} onClick={() => { zoomIn(); setZoom(Math.round(getZoom() * 100)) }} title="放大">
        +
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/components/mindmap/MindMapContextMenu.tsx tauri/src/components/mindmap/MindMapToolbar.tsx tauri/src/components/mindmap/MindMapZoomControls.tsx
git commit -m "feat(mindmap): add context menu, floating toolbar, and zoom controls"
```

---

### Task 7: MindMapCanvas（核心画布封装）

**Files:**
- Create: `tauri/src/components/mindmap/MindMapCanvas.tsx`

- [ ] **Step 1: 创建画布组件**

```typescript
// tauri/src/components/mindmap/MindMapCanvas.tsx

import { useCallback, useState, useEffect, type MouseEvent, type KeyboardEvent as ReactKE } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type OnNodeDrag,
  type NodeMouseHandler,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import type { MindMapNodeData } from './mindmap-types'
import { useMindMapStore } from './use-mindmap-store'
import { useMindMapLayout } from './use-mindmap-layout'
import { MindMapNode } from './MindMapNode'
import { MindMapEdge } from './MindMapEdge'
import { MindMapContextMenu } from './MindMapContextMenu'
import { MindMapZoomControls } from './MindMapZoomControls'
import styles from './mindmap.module.css'

const nodeTypes = { mindmap: MindMapNode }
const edgeTypes = { mindmap: MindMapEdge }

interface Props {
  /** localStorage 持久化 key */
  storageKey: string
  /** 初始数据（首次加载或刷新时使用） */
  initialNodes: MindMapNodeData[]
  /** 刷新数据的回调 */
  onRefresh?: () => Promise<MindMapNodeData[]>
}

function MindMapCanvasInner({ storageKey, initialNodes, onRefresh }: Props) {
  const store = useMindMapStore()
  const { fitView } = useReactFlow()

  // 右键菜单状态
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null)
  // 选中节点
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // 初始化：优先从 localStorage 恢复，否则用 initialNodes
  useEffect(() => {
    const loaded = store.load(storageKey)
    if (!loaded && initialNodes.length > 0) {
      store.initFromData(initialNodes)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  // initialNodes 变化时如果 store 为空则重新初始化
  useEffect(() => {
    if (store.nodes.length === 0 && initialNodes.length > 0) {
      store.initFromData(initialNodes)
    }
  }, [initialNodes, store])

  // 自动保存到 localStorage
  useEffect(() => {
    if (store.nodes.length > 0) {
      store.save(storageKey)
    }
  }, [store.nodes, storageKey, store])

  // 布局计算
  const { nodes: flowNodes, edges: flowEdges } = useMindMapLayout(store.nodes)

  // 首次 fitView
  useEffect(() => {
    if (flowNodes.length > 0) {
      setTimeout(() => fitView({ padding: 0.2 }), 100)
    }
  }, [flowNodes.length > 0]) // eslint-disable-line

  // 右键菜单
  const onNodeContextMenu: NodeMouseHandler = useCallback(
    (event: MouseEvent, node) => {
      event.preventDefault()
      setCtxMenu({ x: event.clientX, y: event.clientY, nodeId: node.id })
    },
    []
  )

  // 节点拖拽结束 — 检查是否 reparent
  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, draggedNode, nodes) => {
      // 找到拖拽结束时下方的节点（简易碰撞检测）
      const target = nodes.find(
        (n) =>
          n.id !== draggedNode.id &&
          Math.abs(n.position.x - draggedNode.position.x) < 120 &&
          Math.abs(n.position.y - draggedNode.position.y) < 30
      )
      if (target) {
        store.reparentNode(draggedNode.id, target.id)
      }
    },
    [store]
  )

  // 键盘快捷键
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key === 'z') {
        e.preventDefault()
        store.undo()
      } else if (mod && e.key === 'y') {
        e.preventDefault()
        store.redo()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          const node = store.nodes.find((n) => n.id === selectedNodeId)
          if (node?.parentId) {
            store.removeNode(selectedNodeId)
            setSelectedNodeId(null)
          }
        }
      } else if (e.key === 'Tab' && selectedNodeId) {
        e.preventDefault()
        store.addNode(selectedNodeId)
      } else if (e.key === 'Enter' && selectedNodeId && !e.shiftKey) {
        e.preventDefault()
        store.addSibling(selectedNodeId)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedNodeId, store])

  const handleRefresh = useCallback(async () => {
    if (onRefresh) {
      const fresh = await onRefresh()
      store.initFromData(fresh)
      localStorage.removeItem(storageKey)
    }
  }, [onRefresh, store, storageKey])

  return (
    <div className={styles.canvas}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeContextMenu={onNodeContextMenu}
        onNodeDragStop={onNodeDragStop}
        onSelectionChange={({ nodes }) => {
          setSelectedNodeId(nodes.length === 1 ? nodes[0].id : null)
        }}
        onPaneClick={() => {
          setCtxMenu(null)
          setSelectedNodeId(null)
        }}
        fitView
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(255,255,255,0.06)" />
      </ReactFlow>

      {/* 左侧工具条 */}
      <div className={styles.toolRail}>
        <button className={styles.toolRailBtn} onClick={() => { if (selectedNodeId) store.addNode(selectedNodeId) }} title="添加子节点">
          ＋
        </button>
        <button className={styles.toolRailBtn} onClick={handleRefresh} title="重新生成">
          ⟳
        </button>
        <button className={styles.toolRailBtn} onClick={() => fitView({ padding: 0.2 })} title="适应视口">
          ⤓
        </button>
      </div>

      {/* 缩放控件 */}
      <MindMapZoomControls />

      {/* 右键菜单 */}
      {ctxMenu && (
        <MindMapContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          nodeId={ctxMenu.nodeId}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}

/** 带 ReactFlowProvider 的导出 */
export function MindMapCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <MindMapCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd /home/sichengli/Documents/code2/task-conductor/tauri && npx tsc --noEmit 2>&1 | head -30
```

如有类型错误，修复后继续。

- [ ] **Step 3: Commit**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/components/mindmap/MindMapCanvas.tsx
git commit -m "feat(mindmap): add MindMapCanvas with keyboard shortcuts, drag-reparent, and auto-save"
```

---

### Task 8: 后端 file-tree API

**Files:**
- Modify: `backend/app/routers/files.py`

- [ ] **Step 1: 在 files.py 中新增 file-tree 端点**

在 `backend/app/routers/files.py` 文件的现有端点之后添加：

```python
# ── 递归文件树（脑图用） ──────────────────────────

def _build_tree(path: Path, depth: int, max_depth: int) -> dict:
    """递归构建目录树 JSON"""
    name = path.name
    if path.is_file():
        return {"name": name, "type": "file"}

    result: dict = {"name": name, "type": "directory", "children": []}
    if depth >= max_depth:
        return result

    try:
        entries = sorted(path.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower()))
    except PermissionError:
        return result

    for entry in entries:
        if entry.name in IGNORE_NAMES:
            continue
        if entry.name.startswith(".") and entry.name not in (".env.example", ".gitignore", ".editorconfig"):
            continue
        result["children"].append(_build_tree(entry, depth + 1, max_depth))

    return result


@router.get("/{project_id}/file-tree", summary="递归项目目录树（脑图用）")
def get_file_tree(
    project_id: int,
    depth: int = Query(3, ge=1, le=10, description="递归深度限制"),
    db: Session = Depends(_get_db),
):
    base = _get_project_path(project_id, db)
    if not base.is_dir():
        raise HTTPException(404, "项目目录不存在")

    tree = _build_tree(base, 0, depth)
    return tree
```

- [ ] **Step 2: 验证后端启动正常**

```bash
cd /home/sichengli/Documents/code2/task-conductor/backend && source .venv/bin/activate && python -c "from app.routers.files import router; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add backend/app/routers/files.py
git commit -m "feat(api): add recursive file-tree endpoint for mindmap visualization"
```

---

### Task 9: 前端 API 层 + i18n

**Files:**
- Modify: `tauri/src/lib/api/types.ts`
- Modify: `tauri/src/lib/api/http.ts`
- Modify: `tauri/src/i18n/zh.json`
- Modify: `tauri/src/i18n/en.json`

- [ ] **Step 1: 添加 FileTreeNode 类型和 API 方法声明**

在 `tauri/src/lib/api/types.ts` 的 `ApiAdapter` 接口末尾（`clearSessions` 之后）添加：

```typescript
  getFileTree(projectId: number, depth?: number): Promise<FileTreeNode>
```

在文件顶层类型区域添加：

```typescript
export interface FileTreeNode {
  name: string
  type: 'directory' | 'file'
  children?: FileTreeNode[]
}
```

- [ ] **Step 2: 实现 getFileTree**

在 `tauri/src/lib/api/http.ts` 中已有方法后添加：

```typescript
  getFileTree(projectId: number, depth = 3) {
    return this.fetch<FileTreeNode>(`/api/projects/${projectId}/file-tree?depth=${depth}`)
  }
```

注意：此方法不走缓存（每次刷新都应拉最新），直接 `this.fetch`。

同时在文件顶部 import 中增加 `FileTreeNode`:

```typescript
import type { ..., FileTreeNode } from './types'
```

- [ ] **Step 3: 添加 i18n key**

在 `tauri/src/i18n/zh.json` 的 `admin.nav` 对象中添加：

```json
"mindmap": "脑图"
```

在 `tauri/src/i18n/en.json` 的对应位置添加：

```json
"mindmap": "Mind Map"
```

- [ ] **Step 4: Commit**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/lib/api/types.ts tauri/src/lib/api/http.ts tauri/src/i18n/zh.json tauri/src/i18n/en.json
git commit -m "feat(mindmap): add file-tree API method and i18n keys"
```

---

### Task 10: FileTreeMap（DevTools 新 tab）

**Files:**
- Create: `tauri/src/features/__dev__/tabs/FileTreeMap.tsx`
- Modify: `tauri/src/features/__dev__/DevToolsPage.tsx`

- [ ] **Step 1: 创建 FileTreeMap 组件**

```typescript
// tauri/src/features/__dev__/tabs/FileTreeMap.tsx

import { useState, useEffect, useCallback } from 'react'
import { MindMapCanvas } from '../../../components/mindmap/MindMapCanvas'
import { fileTreeToNodes, resetIdCounter } from '../../../components/mindmap/mindmap-utils'
import type { MindMapNodeData, FileTreeNode } from '../../../components/mindmap/mindmap-types'
import { useAppStore } from '../../../lib/store/app'
import { api } from '../../../lib/api'

export function FileTreeMap() {
  const projectId = useAppStore((s) => s.activeProjectId)
  const [initialNodes, setInitialNodes] = useState<MindMapNodeData[]>([])
  const [error, setError] = useState<string | null>(null)

  const fetchTree = useCallback(async (): Promise<MindMapNodeData[]> => {
    if (!projectId) return []
    try {
      resetIdCounter()
      const tree = await api.getFileTree(Number(projectId))
      const nodes = fileTreeToNodes(tree)
      return nodes
    } catch (e) {
      setError('无法加载项目文件树')
      return []
    }
  }, [projectId])

  useEffect(() => {
    fetchTree().then(setInitialNodes)
  }, [fetchTree])

  if (!projectId) {
    return (
      <div style={{ padding: 32, color: 'var(--tc-foreground-secondary)', fontSize: 13 }}>
        请先在工作台选择一个项目
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 32, color: 'var(--tc-error)', fontSize: 13 }}>
        {error}
      </div>
    )
  }

  return (
    <div style={{ height: 'calc(100vh - 180px)', minHeight: 400 }}>
      <MindMapCanvas
        storageKey={`mindmap:file:${projectId}`}
        initialNodes={initialNodes}
        onRefresh={fetchTree}
      />
    </div>
  )
}
```

- [ ] **Step 2: 修改 DevToolsPage.tsx 添加新 tab**

在 `tauri/src/features/__dev__/DevToolsPage.tsx` 中：

1. 修改 Tab 类型（第 163 行）：
```typescript
type Tab = 'file-icons' | 'ui-icons' | 'components' | 'file-map'
```

2. 在文件顶部 import 区域添加：
```typescript
import { FileTreeMap } from './tabs/FileTreeMap'
```

3. 在 tabs 渲染区域（第 198-208 行之间）添加新 tab 按钮（在 File Icons 按钮之后）：
```typescript
<button className={styles.tab} data-active={tab === 'file-map'} onClick={() => setTab('file-map')}>
  File Map
</button>
```

4. 在文件末尾 `</div>` 前（约第 503 行之前）添加 tab 内容渲染：
```typescript
{tab === 'file-map' && <FileTreeMap />}
```

- [ ] **Step 3: 验证 TypeScript**

```bash
cd /home/sichengli/Documents/code2/task-conductor/tauri && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/features/__dev__/tabs/FileTreeMap.tsx tauri/src/features/__dev__/DevToolsPage.tsx
git commit -m "feat(mindmap): add FileTreeMap tab in DevTools page"
```

---

### Task 11: AdminMindMap（任务全景脑图页面）

**Files:**
- Create: `tauri/src/features/admin/pages/AdminMindMap.tsx`

- [ ] **Step 1: 创建任务全景脑图页面**

```typescript
// tauri/src/features/admin/pages/AdminMindMap.tsx

import { useState, useEffect, useCallback } from 'react'
import { MindMapCanvas } from '../../../components/mindmap/MindMapCanvas'
import { tasksToNodes, resetIdCounter } from '../../../components/mindmap/mindmap-utils'
import type { MindMapNodeData } from '../../../components/mindmap/mindmap-types'
import { api } from '../../../lib/api'

export default function AdminMindMap() {
  const [initialNodes, setInitialNodes] = useState<MindMapNodeData[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async (): Promise<MindMapNodeData[]> => {
    try {
      resetIdCounter()
      const projects = await api.getProjects()
      const tasksByProject = new Map<number, Array<{ id: number; title: string; current_stage?: string }>>()

      await Promise.all(
        projects.map(async (p) => {
          const tasks = await api.getTasks(p.id)
          tasksByProject.set(p.id, tasks)
        })
      )

      return tasksToNodes(projects, tasksByProject)
    } catch {
      return []
    }
  }, [])

  useEffect(() => {
    fetchData().then((nodes) => {
      setInitialNodes(nodes)
      setLoading(false)
    })
  }, [fetchData])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--tc-foreground)', margin: 0 }}>
          任务全景脑图
        </h1>
        <p style={{ fontSize: 13, color: 'var(--tc-foreground-secondary)', margin: '4px 0 0' }}>
          项目 → 任务 → 阶段 全局视图
        </p>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: '16px 24px 24px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--tc-foreground-secondary)', fontSize: 13 }}>
            加载中...
          </div>
        ) : (
          <MindMapCanvas
            storageKey="mindmap:task:global"
            initialNodes={initialNodes}
            onRefresh={fetchData}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/features/admin/pages/AdminMindMap.tsx
git commit -m "feat(mindmap): add AdminMindMap page for task panorama visualization"
```

---

### Task 12: 路由 + 导航集成

**Files:**
- Modify: `tauri/src/app/Router.tsx`
- Modify: `tauri/src/features/admin/AdminLayout.tsx`

- [ ] **Step 1: Router.tsx — 添加路由**

在 `tauri/src/app/Router.tsx` 中：

1. 添加 lazy import（在第 17 行 `AdminSessions` 之后）：
```typescript
const AdminMindMap     = lazy(() => import('../features/admin/pages/AdminMindMap'))
```

2. 添加路由（在第 50 行 `AdminSessions` 路由之后、DevToolsPage 之前）：
```typescript
<Route path="/admin/mindmap" element={<AdminMindMap />} />
```

- [ ] **Step 2: AdminLayout.tsx — 添加导航项**

在 `tauri/src/features/admin/AdminLayout.tsx` 中：

1. 在文件顶部 import 中，将 `IconGitBranch` 加入 icon 导入列表（从 `'../../ui/icon'` 导入）。

2. 在 `NAV_ITEMS` 数组中，在 sessions 项之后（即 `shortcut: \`${modKey}4\`` 之后）添加：

```typescript
{ key: '/admin/mindmap', icon: <IconGitBranch size={18} />, i18n: 'admin.nav.mindmap', shortcut: `${modKey}5` },
```

3. 将原来 dev_tools 的 shortcut 从 `${modKey}5` 改为 `${modKey}6`。

- [ ] **Step 3: 验证 TypeScript**

```bash
cd /home/sichengli/Documents/code2/task-conductor/tauri && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/app/Router.tsx tauri/src/features/admin/AdminLayout.tsx
git commit -m "feat(mindmap): integrate AdminMindMap route and sidebar navigation"
```

---

### Task 13: 端到端验证

- [ ] **Step 1: 启动后端**

```bash
cd /home/sichengli/Documents/code2/task-conductor/backend && source .venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8765 --reload &
```

- [ ] **Step 2: 启动前端**

```bash
cd /home/sichengli/Documents/code2/task-conductor/tauri && pnpm dev
```

- [ ] **Step 3: 验证清单**

在浏览器打开 `http://localhost:7071`：

1. 导航到 `/admin/dev` → 检查 "File Map" tab 是否出现
2. 选择 File Map tab → 检查脑图是否渲染（需先在工作台选中一个项目）
3. 导航到 `/admin/mindmap` → 检查任务全景脑图是否渲染
4. 测试交互：
   - 双击节点 → 编辑文本
   - 右键节点 → 上下文菜单
   - Tab 键 → 添加子节点
   - Delete 键 → 删除节点
   - Ctrl+Z → 撤销
   - 滚轮 → 缩放
   - 拖拽 → 移动
5. 刷新页面 → 检查编辑状态是否从 localStorage 恢复

- [ ] **Step 4: 修复发现的问题**

如有 TypeScript 错误或运行时问题，逐个修复。

- [ ] **Step 5: 最终 Commit**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add -A
git commit -m "fix(mindmap): address issues found during end-to-end testing"
```
