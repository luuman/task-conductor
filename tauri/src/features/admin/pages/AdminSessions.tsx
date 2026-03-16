import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../../ui/skeleton/Skeleton'
import { EmptyState } from '../../../ui/empty-state'
import { api } from '../../../lib/api'
import type { AiSession } from '../../../lib/api/types'
import styles from '../admin.module.css'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function AdminSessions() {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState<AiSession[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    api.getSessions()
      .then(setSessions)
      .catch(() => setError('Failed to load sessions'))
  }, [])

  const loading = sessions === null && error === null

  const filtered = sessions?.filter(s =>
    !filter || s.session_id.toLowerCase().includes(filter.toLowerCase())
  ) ?? []

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.headerTitle}>{t('admin.sessions.title')}</h1>
          <p className={styles.headerHint}>{t('admin.sessions.hint')}</p>
        </div>

        {error && <p style={{ color: 'var(--tc-error)', fontSize: 13 }}>{error}</p>}

        {/* 搜索栏 */}
        <div style={{ marginBottom: 16 }}>
          {loading
            ? <Skeleton variant="rect" width="100%" height={36} borderRadius={6} />
            : <input
                className={styles.searchInput}
                placeholder={t('admin.sessions.search_placeholder')}
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
          }
        </div>

        {/* 会话卡片网格 */}
        {loading
          ? <div className={styles.cardGrid}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={styles.section}>
                  <div className={styles.sectionBody}>
                    <Skeleton variant="text" width="70%" height={13} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Skeleton variant="text" width={60} height={10} />
                      <Skeleton variant="text" width={40} height={10} />
                    </div>
                    <Skeleton variant="text" width={90} height={10} />
                  </div>
                </div>
              ))}
            </div>
          : filtered.length === 0
            ? <div className={styles.section}>
                <div className={styles.sectionBody}>
                  <span className={styles.emptyHint}>{t('admin.sessions.no_sessions')}</span>
                </div>
              </div>
            : <div className={styles.cardGrid}>
                {filtered.map((s) => (
                  <div key={s.session_id} className={styles.sessionCard}>
                    <div className={styles.sessionCardHeader}>
                      <span className={styles.sessionIcon}>
                        {s.provider === 'claude' ? '🤖' : '💬'}
                      </span>
                      <span className={styles.sessionId}>
                        {s.session_id.slice(0, 8)}...{s.session_id.slice(-4)}
                      </span>
                      <span className={styles.eventBadge}>{s.event_count} events</span>
                    </div>
                    <div className={styles.sessionCardMeta}>
                      <span className={styles.sessionMeta}>{s.provider}</span>
                      <span className={styles.sessionMetaDot} />
                      <span className={styles.sessionMeta}>{timeAgo(s.started_at)}</span>
                      <span className={styles.sessionMetaDot} />
                      <span className={styles.sessionMeta}>last: {timeAgo(s.last_event_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
        }
      </div>
    </div>
  )
}
