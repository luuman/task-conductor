import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Task } from '../../../lib/api/types'
import { Skeleton } from '../../../ui/skeleton/Skeleton'
import styles from './TaskChart.module.css'

interface Props {
  tasks: Task[]
  loading: boolean
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

export function TaskChart({ tasks, loading }: Props) {
  const { t } = useTranslation()
  const statusSegments = useMemo(() => {
    if (tasks.length === 0) return []
    const counts: Record<string, number> = {}
    for (const t of tasks) {
      counts[t.status] = (counts[t.status] || 0) + 1
    }
    return Object.entries(counts).map(([status, count]) => ({
      status,
      count,
      pct: (count / tasks.length) * 100,
      color: STATUS_COLORS[status] || '#6b7280',
    }))
  }, [tasks])

  const trendData = useMemo(() => {
    const days: Record<string, number> = {}
    for (const t of tasks) {
      const day = t.created_at.slice(0, 10)
      days[day] = (days[day] || 0) + 1
    }
    // Last 14 days
    const result: { date: string; count: number }[] = []
    const now = new Date()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      result.push({ date: key, count: days[key] || 0 })
    }
    return result
  }, [tasks])

  if (loading) {
    return (
      <div className={styles.section}>
        <div className={styles.header}><span className={styles.title}>{t('dashboard.task_distribution')}</span></div>
        <div className={styles.body}>
          <Skeleton variant="rect" width="100%" height={24} borderRadius={6} />
          <Skeleton variant="rect" width="100%" height={80} borderRadius={6} />
        </div>
      </div>
    )
  }

  const maxCount = Math.max(...trendData.map((d) => d.count), 1)
  const svgW = 400
  const svgH = 80
  const points = trendData.map((d, i) => {
    const x = (i / 13) * svgW
    const y = svgH - (d.count / maxCount) * (svgH - 10) - 5
    return `${x},${y}`
  }).join(' ')

  return (
    <div className={styles.section}>
      <div className={styles.header}><span className={styles.title}>{t('dashboard.task_distribution')}</span></div>
      <div className={styles.body}>
        {/* Status bar */}
        {tasks.length > 0 ? (
          <>
            <div className={styles.bar}>
              {statusSegments.map((seg) => (
                <div
                  key={seg.status}
                  className={styles.segment}
                  style={{ width: `${seg.pct}%`, background: seg.color }}
                  title={`${seg.status}: ${seg.count}`}
                />
              ))}
            </div>
            <div className={styles.legend}>
              {statusSegments.map((seg) => (
                <span key={seg.status} className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: seg.color }} />
                  {seg.status} ({seg.count})
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className={styles.empty}>{t('dashboard.no_task_data')}</p>
        )}

        {/* Trend line */}
        <div className={styles.trendLabel}>{t('dashboard.trend_14d')}</div>
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className={styles.svg} preserveAspectRatio="none">
          <polyline
            points={points}
            fill="none"
            stroke="var(--tc-accent, #007acc)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {trendData.map((d, i) => {
            const x = (i / 13) * svgW
            const y = svgH - (d.count / maxCount) * (svgH - 10) - 5
            return d.count > 0 ? (
              <circle key={i} cx={x} cy={y} r="3" fill="var(--tc-accent, #007acc)" />
            ) : null
          })}
        </svg>
      </div>
    </div>
  )
}
