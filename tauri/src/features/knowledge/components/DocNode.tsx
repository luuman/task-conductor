import { Handle, Position, type NodeProps } from '@xyflow/react'
import styles from './DocNode.module.css'

const TYPE_ICONS: Record<string, string> = {
  requirements: '📋', research: '🔬', prd: '📄',
  architecture: '🏗️', 'ui-spec': '🎨', 'dev-plan': '🗓️',
  'test-plan': '✅', note: '📝',
}

const TYPE_COLORS: Record<string, string> = {
  requirements: '#3b82f6', research: '#8b5cf6', prd: '#06b6d4',
  architecture: '#f59e0b', 'ui-spec': '#ec4899', 'dev-plan': '#10b981',
  'test-plan': '#22c55e', note: '#6b7280',
}

export interface DocNodeData extends Record<string, unknown> {
  title: string
  doc_type: string
  task_title: string | null
  updated_at: string
  onOpen: (docId: number) => void
  docId: number
}

export function DocNode({ data, selected }: NodeProps) {
  const d = data as DocNodeData
  const color = TYPE_COLORS[d.doc_type] ?? '#6b7280'
  return (
    <div
      className={`${styles.node} ${selected ? styles.selected : ''}`}
      style={{ '--node-color': color } as React.CSSProperties}
    >
      <Handle type="target" position={Position.Left} className={styles.handle} />

      <div className={styles.typeRow}>
        <span className={styles.icon}>{TYPE_ICONS[d.doc_type] ?? '📄'}</span>
        <span className={styles.type} style={{ color }}>{d.doc_type}</span>
      </div>
      <div className={styles.title}>{d.title}</div>
      {d.task_title && <div className={styles.taskLabel}>{d.task_title}</div>}
      <div className={styles.footer}>
        <button
          className={styles.openBtn}
          onMouseDown={e => e.stopPropagation()}
          onClick={() => d.onOpen(d.docId)}
        >
          打开
        </button>
        <span className={styles.date}>
          {new Date(d.updated_at).toLocaleDateString()}
        </span>
      </div>

      <Handle type="source" position={Position.Right} className={styles.handle} />
    </div>
  )
}
