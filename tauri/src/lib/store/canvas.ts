import { create } from 'zustand'
import type { CanvasNodeData, CanvasEdgeData } from '../api/types'

export interface CanvasTab {
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

export const useCanvasStore = create<CanvasStore>()((set) => ({
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
