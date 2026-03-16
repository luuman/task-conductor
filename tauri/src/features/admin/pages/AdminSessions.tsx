import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../../ui/skeleton/Skeleton'
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

        {/* 会话列表 */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className={styles.sectionTitle}>{t('admin.sessions.list')}</span>
              {!loading && (
                <span className={styles.sectionHint}>{filtered.length} {t('admin.dashboard.total')}</span>
              )}
            </div>
          </div>
          <div>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className={styles.listItem}>
                    <Skeleton variant="circle" width={32} />
                    <div className={styles.listItemContent}>
                      <Skeleton variant="text" width={`${50 + Math.random() * 30}%`} height={13} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Skeleton variant="text" width={60} height={10} />
                        <Skeleton variant="text" width={40} height={10} />
                      </div>
                    </div>
                    <div className={styles.listItemRight}>
                      <Skeleton variant="text" width={70} height={10} />
                      <Skeleton variant="rect" width={50} height={18} borderRadius={9} />
                    </div>
                  </div>
                ))
              : filtered.length === 0
                ? <div className={styles.listItem}>
                    <span className={styles.emptyHint}>{t('admin.sessions.no_sessions')}</span>
                  </div>
                : filtered.map((s) => (
                    <div key={s.session_id} className={styles.listItem}>
                      <span className={styles.sessionIcon}>
                        {s.provider === 'claude' ? '🤖' : '💬'}
                      </span>
                      <div className={styles.listItemContent}>
                        <span className={styles.sessionId}>
                          {s.session_id.slice(0, 8)}...{s.session_id.slice(-4)}
                        </span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <span className={styles.sessionMeta}>{s.provider}</span>
                          <span className={styles.sessionMeta}>{timeAgo(s.started_at)}</span>
                        </div>
                      </div>
                      <div className={styles.listItemRight}>
                        <span className={styles.sessionMeta}>{timeAgo(s.last_event_at)}</span>
                        <span className={styles.eventBadge}>{s.event_count} events</span>
                      </div>
                    </div>
                  ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}
