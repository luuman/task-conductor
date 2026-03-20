import type { AiSession, Project } from '../../../lib/api/types'
import styles from './RecentSessions.module.css'

interface Props {
  sessions: AiSession[]
  project: Project | null
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  return `${Math.floor(hours / 24)}天前`
}

export function RecentSessions({ sessions, project }: Props) {
  const filtered = sessions
    .filter((s) => {
      if (!project?.repo_url || !s.cwd) return false
      return s.cwd.includes(project.repo_url)
    })
    .slice(0, 5)

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <span className={styles.title}>最近会话</span>
        <span className={styles.count}>{filtered.length}</span>
      </div>
      <div className={styles.body}>
        {filtered.length === 0 ? (
          <p className={styles.empty}>暂无关联会话</p>
        ) : (
          filtered.map((s) => (
            <div key={s.session_id} className={styles.item}>
              <span className={styles.sid}>{s.session_id.slice(0, 8)}...</span>
              <span className={styles.meta}>
                <span>{s.event_count} 事件</span>
                <span>{timeAgo(s.last_event_at || s.started_at)}</span>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
