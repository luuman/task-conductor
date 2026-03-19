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
