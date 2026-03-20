import type { Project, Task } from '../../../lib/api/types'
import { Skeleton } from '../../../ui/skeleton/Skeleton'
import styles from './ProjectOverview.module.css'

interface Props {
  project: Project | null
  tasks: Task[]
  loading: boolean
}

export function ProjectOverview({ project, tasks, loading }: Props) {
  const total = tasks.length
  const inProgress = tasks.filter((t) => t.status === 'running' || t.status === 'in_progress').length
  const completed = tasks.filter((t) => t.status === 'completed' || t.status === 'done').length
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0

  const kpis = [
    { label: '总任务', value: total },
    { label: '进行中', value: inProgress },
    { label: '已完成', value: completed },
    { label: '完成率', value: `${rate}%` },
  ]

  if (loading) {
    return (
      <div className={styles.root}>
        <Skeleton variant="text" width="40%" height={20} />
        <Skeleton variant="text" width="60%" height={12} />
        <div className={styles.kpiGrid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.kpiCard}>
              <Skeleton variant="text" width="60%" height={11} />
              <Skeleton variant="text" width="40%" height={24} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <h2 className={styles.title}>{project?.name ?? '—'}</h2>
      {project?.description && <p className={styles.desc}>{project.description}</p>}
      <div className={styles.kpiGrid}>
        {kpis.map((k, i) => (
          <div key={i} className={styles.kpiCard}>
            <span className={styles.kpiLabel}>{k.label}</span>
            <span className={styles.kpiValue}>{k.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
