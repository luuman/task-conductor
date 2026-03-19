// tauri/src/components/mindmap/MindMapCanvas.tsx

import { useCallback, useState, useEffect, type MouseEvent } from 'react'
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowNodes.length > 0])

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
