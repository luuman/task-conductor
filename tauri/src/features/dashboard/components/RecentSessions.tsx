import { useTranslation } from 'react-i18next'
import type { AiSession, Project } from '../../../lib/api/types'
import styles from './RecentSessions.module.css'

interface Props {
  sessions: AiSession[]
  project: Project | null
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

export function RecentSessions({ sessions, project }: Props) {
  const { t } = useTranslation()
  const timeAgo = useTimeAgo()
  const filtered = sessions
    .filter((s) => {
      if (!project?.repo_url || !s.cwd) return false
      return s.cwd.includes(project.repo_url)
    })
    .slice(0, 5)

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <span className={styles.title}>{t('dashboard.recent_sessions')}</span>
        <span className={styles.count}>{filtered.length}</span>
      </div>
      <div className={styles.body}>
        {filtered.length === 0 ? (
          <p className={styles.empty}>{t('dashboard.no_related_sessions')}</p>
        ) : (
          filtered.map((s) => (
            <div key={s.session_id} className={styles.item}>
              <span className={styles.sid}>{s.session_id.slice(0, 8)}...</span>
              <span className={styles.meta}>
                <span>{t('dashboard.events_count', { n: s.event_count })}</span>
                <span>{timeAgo(s.last_event_at || s.started_at)}</span>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
