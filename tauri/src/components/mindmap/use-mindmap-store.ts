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
