import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ReactFlow, type Node, type Edge, Position, Background } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Task } from '../../../lib/api/types'
import styles from './TaskDependencyGraph.module.css'

interface Props {
  tasks: Task[]
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#6b7280',
  running: '#3b82f6',
  in_progress: '#3b82f6',
  waiting_approval: '#f59e0b',
  completed: '#22c55e',
  done: '#22c55e',
  failed: '#ef4444',
}

export function TaskDependencyGraph({ tasks }: Props) {
  const { t } = useTranslation()
  const { nodes, edges } = useMemo(() => {
    if (tasks.length === 0) return { nodes: [], edges: [] }

    const sorted = [...tasks].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    const cols = 4
    const xGap = 220
    const yGap = 80

    const nodes: Node[] = sorted.map((task, i) => ({
      id: String(task.id),
      position: { x: (i % cols) * xGap, y: Math.floor(i / cols) * yGap },
      data: {
        label: (
          <div style={{ fontSize: 11, lineHeight: 1.3 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>
              {task.title.length > 20 ? task.title.slice(0, 20) + '...' : task.title}
            </div>
            <div style={{ fontSize: 9, opacity: 0.7 }}>{task.stage}</div>
          </div>
        ),
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: {
        background: '#1e1e1e',
        border: `2px solid ${STATUS_COLORS[task.status] || '#6b7280'}`,
        borderRadius: 8,
        padding: '6px 10px',
        color: '#e0e0e0',
        fontSize: 11,
        minWidth: 120,
      },
    }))

    const edges: Edge[] = sorted.slice(1).map((task, i) => ({
      id: `e-${sorted[i].id}-${task.id}`,
      source: String(sorted[i].id),
      target: String(task.id),
      animated: task.status === 'running' || task.status === 'in_progress',
      style: { stroke: '#444', strokeWidth: 1.5 },
    }))

    return { nodes, edges }
  }, [tasks])

  if (tasks.length === 0) {
    return (
      <div className={styles.section}>
        <div className={styles.header}>
          <span className={styles.title}>{t('dashboard.task_dependency')}</span>
        </div>
        <div className={styles.emptyBody}>
          <p className={styles.empty}>{t('dashboard.no_tasks')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <span className={styles.title}>{t('dashboard.task_dependency')}</span>
      </div>
      <div className={styles.graphContainer}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          zoomOnScroll={false}
          panOnDrag={false}
          minZoom={0.5}
          maxZoom={1.5}
        >
          <Background gap={20} size={1} color="#333" />
        </ReactFlow>
      </div>
    </div>
  )
}
