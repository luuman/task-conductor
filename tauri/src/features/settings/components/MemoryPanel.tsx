import type { MemoryResponse } from '../../../lib/api/types'
import styles from '../settings.module.css'

const CATEGORY_META = {
  user:      { label: '用户',   color: '#6366f1', bg: '#6366f115' },
  feedback:  { label: '反馈',   color: '#f59e0b', bg: '#f59e0b15' },
  project:   { label: '项目',   color: '#10b981', bg: '#10b98115' },
  reference: { label: '参考',   color: '#0ea5e9', bg: '#0ea5e915' },
} as const

interface MemoryPanelProps {
  data: MemoryResponse | undefined
  isLoading: boolean
}

export function MemoryPanel({ data, isLoading }: MemoryPanelProps) {
  if (isLoading) {
    return <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)' }}>加载中...</div>
  }

  const categories: Array<keyof typeof CATEGORY_META> = ['user', 'feedback', 'project', 'reference']

  return (
    <div className={styles.memoryGrid}>
      {categories.map((cat) => {
        const meta = CATEGORY_META[cat]
        const entries = data?.[cat] ?? []
        return (
          <div key={cat} className={styles.memoryCell}>
            <span
              className={styles.memoryCellBadge}
              style={{ background: meta.bg, color: meta.color }}
            >
              {meta.label}
            </span>
            <div className={styles.memoryCellCount}>{entries.length}</div>
            <ul className={styles.memoryCellList}>
              {entries.slice(0, 5).map((e) => (
                <li key={e.file} title={e.description}>{e.name}</li>
              ))}
              {entries.length > 5 && (
                <li style={{ opacity: 0.5 }}>+{entries.length - 5} 更多</li>
              )}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
