import { useTranslation } from 'react-i18next'
import type { AiSession } from '../../../../lib/api/types'
import { Skeleton } from '../../../../ui/skeleton/Skeleton'
import styles from './sessions.module.css'

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

function sessionEmoji(provider: string): string {
  switch (provider) {
    case 'claude': return '\u{1F916}'
    case 'openai': return '\u{1F4AC}'
    default: return '\u{2699}\u{FE0F}'
  }
}

interface Props {
  sessions: AiSession[] | null
  loading: boolean
  selectedId: string | null
  filter: string
  onFilterChange: (v: string) => void
  onSelect: (sessionId: string) => void
}

export function SessionList({ sessions, loading, selectedId, filter, onFilterChange, onSelect }: Props) {
  const { t } = useTranslation()

  const filtered = sessions?.filter(s => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return (s.summary?.toLowerCase().includes(q))
      || (s.cwd?.toLowerCase().includes(q))
      || s.provider.toLowerCase().includes(q)
      || (s.note?.alias?.toLowerCase().includes(q))
  }) ?? []

  return (
    <div className={styles.listPanel}>
      <div className={styles.listHeader}>
        <div className={styles.listHeaderRow}>
          <span className={styles.listTitle}>{t('admin.sessions.list')}</span>
          {sessions && <span className={styles.listCount}>{filtered.length}</span>}
        </div>
        {loading ? (
          <Skeleton variant="rect" width="100%" height={30} borderRadius={6} />
        ) : (
          <input
            className={styles.searchInput}
            placeholder={t('admin.sessions.search_placeholder')}
            value={filter}
            onChange={e => onFilterChange(e.target.value)}
          />
        )}
      </div>

      <div className={styles.listBody}>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ padding: '10px 12px', display: 'flex', gap: 10 }}>
              <Skeleton variant="rect" width={24} height={24} borderRadius={6} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Skeleton variant="text" width="70%" height={12} />
                <Skeleton variant="text" width="50%" height={10} />
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className={styles.loadingCenter} style={{ minHeight: 120 }}>
            <span>{t('admin.sessions.no_sessions')}</span>
          </div>
        ) : (
          filtered.map(s => (
            <button
              key={s.session_id}
              className={selectedId === s.session_id ? styles.sessionItemActive : styles.sessionItem}
              onClick={() => onSelect(s.session_id)}
            >
              <span className={styles.sessionIcon}>{sessionEmoji(s.provider)}</span>
              <div className={styles.sessionInfo}>
                <div className={styles.sessionIdRow}>
                  <span className={styles.sessionId}>
                    {s.session_id.slice(0, 8)}...{s.session_id.slice(-4)}
                  </span>
                  <span className={styles.eventBadge}>{s.event_count}</span>
                </div>
                <div className={styles.sessionMeta}>
                  <span className={styles.sessionProvider}>{s.provider}</span>
                  <span className={styles.metaDot} />
                  <span>{timeAgo(s.last_event_at)}</span>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
