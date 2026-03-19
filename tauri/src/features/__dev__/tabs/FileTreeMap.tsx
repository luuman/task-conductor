import { useState, useEffect, useCallback } from 'react'
import { MindMapCanvas } from '../../../components/mindmap/MindMapCanvas'
import { fileTreeToNodes, resetIdCounter } from '../../../components/mindmap/mindmap-utils'
import type { MindMapNodeData } from '../../../components/mindmap/mindmap-types'
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
