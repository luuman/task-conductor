import { useTranslation } from 'react-i18next'
import type { Task } from '../../../lib/api/types'
import styles from './ActivityTimeline.module.css'

interface Props {
  tasks: Task[]
}

function useTimeAgo() {
  const { t } = useTranslation()
  return (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return t('time.just_now')
    if (mins < 60) return t('time.mins_ago', { n: mins })
    const hours = Math.floor(mins / 60)
    if (hours < 24) return t('time.hours_ago', { n: hours })
    return t('time.days_ago', { n: Math.floor(hours / 24) })
  }
}

export function ActivityTimeline({ tasks }: Props) {
  const { t } = useTranslation()
  const timeAgo = useTimeAgo()
  const sorted = [...tasks]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 15)

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <span className={styles.title}>{t('dashboard.activity_timeline')}</span>
      </div>
      <div className={styles.body}>
        {sorted.length === 0 ? (
          <p className={styles.empty}>{t('dashboard.no_activity')}</p>
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
                    <span className={styles.stage}>{task.stage}</span>
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
