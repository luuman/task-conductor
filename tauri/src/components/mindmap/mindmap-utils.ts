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
