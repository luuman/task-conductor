import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../../lib/api'
import type { AiSession } from '../../../lib/api/types'
import { SessionList } from './sessions/SessionList'
import { SessionMessages } from './sessions/SessionMessages'
import { SessionCalendar } from './sessions/SessionCalendar'
import styles from './sessions/sessions.module.css'

type ViewMode = 'messages' | 'calendar'

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function AdminSessions() {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState<AiSession[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('messages')
  const [calendarDate, setCalendarDate] = useState<string | null>(null)

  useEffect(() => {
    api.getSessions()
      .then(setSessions)
      .catch(() => setError('Failed to load sessions'))
  }, [])

  const loading = sessions === null && error === null

  // When in calendar mode and a date is selected, filter sessions to that date
  const filteredByDate = useMemo(() => {
    if (!sessions) return null
    if (!calendarDate) return sessions
    return sessions.filter(s => {
      const key = toDateKey(new Date(s.started_at))
      return key === calendarDate
    })
  }, [sessions, calendarDate])

  const selectedSession = useMemo(() => {
    if (!selectedId || !sessions) return null
    return sessions.find(s => s.session_id === selectedId) ?? null
  }, [selectedId, sessions])

  const handleSelect = (sid: string) => {
    setSelectedId(prev => prev === sid ? null : sid)
  }

  const handleCalendarDate = (dateKey: string | null) => {
    setCalendarDate(dateKey)
    setSelectedId(null)
  }

  return (
    <div className={styles.root}>
      {/* Session list (left) */}
      <SessionList
        sessions={viewMode === 'calendar' ? filteredByDate : sessions}
        loading={loading}
        selectedId={selectedId}
        filter={filter}
        onFilterChange={setFilter}
        onSelect={handleSelect}
      />

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* View toggle bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: '1px solid var(--tc-border)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 14, fontWeight: 600, color: 'var(--tc-foreground)', margin: 0 }}>
              {t('admin.sessions.title')}
            </h1>
            {error && <span style={{ color: 'var(--tc-error, #f44)', fontSize: 11 }}>{error}</span>}
          </div>
          <div className={styles.viewTabs}>
            <button
              className={viewMode === 'messages' ? styles.viewTabActive : styles.viewTab}
              onClick={() => setViewMode('messages')}
            >
              {t('admin.sessions.view_messages')}
            </button>
            <button
              className={viewMode === 'calendar' ? styles.viewTabActive : styles.viewTab}
              onClick={() => setViewMode('calendar')}
            >
              {t('admin.sessions.view_calendar')}
            </button>
          </div>
        </div>

        {/* Content area */}
        {viewMode === 'messages' ? (
          <SessionMessages
            session={selectedSession}
            onDeselect={() => setSelectedId(null)}
          />
        ) : (
          <SessionCalendar
            sessions={sessions}
            selectedDate={calendarDate}
            onSelectDate={handleCalendarDate}
          />
        )}
      </div>
    </div>
  )
}
