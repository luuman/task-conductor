import { useTranslation } from 'react-i18next'
import type { AiSession } from '../../../../lib/api/types'
import { Skeleton } from '../../../../ui/skeleton/Skeleton'
import styles from './sessions.module.css'

function StatusBadge({ status }: { status?: string }) {
  const color = status === 'active' ? 'var(--tc-success)' : status === 'idle' ? 'var(--tc-warning)' : 'var(--tc-foreground-secondary)'
  const bg = status === 'active' ? 'rgba(86,211,100,0.15)' : status === 'idle' ? 'rgba(229,161,0,0.15)' : 'rgba(128,128,128,0.15)'
  const label = status === 'active' ? 'Running' : status === 'idle' ? 'Idle' : 'Stopped'
  return (
    <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 999, background: bg, color, fontFamily: "'Geist Mono', monospace" }}>
      {label}
    </span>
  )
}

function cwdShort(cwd?: string): string {
  if (!cwd) return ''
  const parts = cwd.replace(/\\/g, '/').split('/')
  return parts.slice(-2).join('/') || cwd
}

interface Props {
  sessions: AiSession[] | null
  loading: boolean
  selectedId: string | null
  filter: string
  onFilterChange: (v: string) => void
  onSelect: (sessionId: string) => void
}

export function SessionList({ sessions, loading, selectedId, filter, onFilterChange: _onFilterChange, onSelect }: Props) {
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
      {/* Header: simple title text */}
      <div className={styles.listHeader}>
        <span className={styles.listTitle}>{t('admin.sessions.list')}</span>
      </div>

      {/* Session list */}
      <div className={styles.listBody}>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ padding: '10px 12px' }}>
              <Skeleton variant="text" width="60%" height={10} />
              <div style={{ marginTop: 6 }}>
                <Skeleton variant="text" width="80%" height={11} />
              </div>
              <div style={{ marginTop: 4 }}>
                <Skeleton variant="text" width="40%" height={10} />
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className={styles.loadingCenter} style={{ minHeight: 120, flexDirection: 'column', gap: 8, padding: '0 12px', textAlign: 'center' }}>
            <span style={{ fontSize: 24 }}>{'\u2317'}</span>
            <span>{t('admin.sessions.no_sessions')}</span>
          </div>
        ) : (
          filtered.map(s => (
            <button
              key={s.session_id}
              className={selectedId === s.session_id ? styles.sessionBtnActive : styles.sessionBtn}
              onClick={() => onSelect(s.session_id)}
            >
              {/* Row 1: session_id (8 chars) + StatusBadge */}
              <div className={styles.sessionRow1}>
                <span className={styles.sessionIdMono}>
                  {s.session_id.slice(0, 8)}
                </span>
                <StatusBadge status={s.status} />
              </div>
              {/* Row 2: cwd path (last 2 segments) */}
              <p className={styles.sessionCwd} title={s.cwd}>
                {cwdShort(s.cwd) || '\u2014'}
              </p>
              {/* Row 3: event count */}
              <p className={styles.sessionCount}>
                {s.event_count} {t('admin.sessions.events')}
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
