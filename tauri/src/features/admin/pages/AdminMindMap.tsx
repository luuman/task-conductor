import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { MindMapCanvas } from '../../../components/mindmap/MindMapCanvas'
import { tasksToNodes, resetIdCounter } from '../../../components/mindmap/mindmap-utils'
import type { MindMapNodeData } from '../../../components/mindmap/mindmap-types'
import { api } from '../../../lib/api'

export default function AdminMindMap() {
  const { t } = useTranslation()
  const [initialNodes, setInitialNodes] = useState<MindMapNodeData[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async (): Promise<MindMapNodeData[]> => {
    try {
      resetIdCounter()
      const projects = await api.getProjects()
      const tasksByProject = new Map<number, Array<{ id: number; title: string; stage?: string }>>()

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
