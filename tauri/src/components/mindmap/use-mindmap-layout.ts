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
        data: node as unknown as Record<string, unknown>,
      }
    })

    const flowEdges: Edge[] = edges.map((e) => ({
      ...e,
      type: 'mindmap',
    }))

    return { nodes: flowNodes, edges: flowEdges }
  }, [allNodes])
}
