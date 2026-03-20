import type { Task } from '../../../lib/api/types'
import styles from './ActivityTimeline.module.css'

interface Props {
  tasks: Task[]
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  return `${days}天前`
}

export function ActivityTimeline({ tasks }: Props) {
  const sorted = [...tasks]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 15)

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <span className={styles.title}>活动时间线</span>
      </div>
      <div className={styles.body}>
        {sorted.length === 0 ? (
          <p className={styles.empty}>暂无活动</p>
        ) : (
          <div className={styles.timeline}>
            {sorted.map((task) => (
              <div key={task.id} className={styles.item}>
                <div className={styles.dotLine}>
                  <span className={styles.dot} />
                  <span className={styles.line} />
                </div>
                <div className={styles.content}>
                  <span className={styles.itemTitle}>{task.title}</span>
                  <span className={styles.meta}>
                    <span className={styles.stage}>{task.current_stage}</span>
                    <span className={styles.status}>{task.status}</span>
                    <span className={styles.time}>{timeAgo(task.created_at)}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
