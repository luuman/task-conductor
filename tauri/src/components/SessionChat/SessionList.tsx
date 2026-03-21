// SessionList.tsx — Left panel session list (grouped by project)
// Extracted from AdminSessions for reuse.

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AiSession } from '../../lib/api/types'
import styles from './session-chat.module.css'

// ── Helpers ──

function safeDate(iso: string): Date {
  if (!iso) return new Date()
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z')
}

function relativeTime(iso: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const d = safeDate(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('time.just_now')
  if (mins < 60) return t('time.mins_ago', { n: mins })
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString())
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
  if (diff < 7 * 86400000) return t('time.days_ago', { n: Math.floor(diff / 86400000) })
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// ── Group sessions by project (cwd) ──

interface ProjectGroup {
  name: string
  cwd: string
  sessions: AiSession[]
  activeCount: number
}

function groupByProject(sessions: AiSession[]): ProjectGroup[] {
  const map = new Map<string, AiSession[]>()
  for (const s of sessions) {
    const key = s.cwd || 'unknown'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(s)
  }
  return Array.from(map.entries()).map(([cwd, items]) => ({
    name: cwd.split('/').filter(Boolean).pop() || cwd,
    cwd,
    sessions: items.sort((a, b) => {
      const aActive = a.status === 'active' ? 1 : 0
      const bActive = b.status === 'active' ? 1 : 0
      if (bActive !== aActive) return bActive - aActive
      if (b.event_count !== a.event_count) return b.event_count - a.event_count
      return safeDate(b.last_seen_at || b.started_at).getTime() -
        safeDate(a.last_seen_at || a.started_at).getTime()
    }),
    activeCount: items.filter(s => s.status === 'active').length,
  })).sort((a, b) => {
    if (a.activeCount > 0 && b.activeCount === 0) return -1
    if (b.activeCount > 0 && a.activeCount === 0) return 1
    const aTotal = a.sessions.reduce((sum, s) => sum + s.event_count, 0)
    const bTotal = b.sessions.reduce((sum, s) => sum + s.event_count, 0)
    if (bTotal !== aTotal) return bTotal - aTotal
    return b.sessions[0]
      ? safeDate(b.sessions[0].last_seen_at || b.sessions[0].started_at).getTime() -
        safeDate(a.sessions[0].last_seen_at || a.sessions[0].started_at).getTime()
      : 0
  })
}

// ── Status dot ──

function StatusDot({ status }: { status: AiSession['status'] }) {
  const cls =
    status === 'active' ? styles.statusDotActive
    : status === 'idle' ? styles.statusDotIdle
    : styles.statusDotStopped
  return <span className={cls} />
}

// ── Session Group (collapsible) ──

function SessionGroup({
  group, selectedId, onSelect, defaultOpen,
}: {
  group: ProjectGroup
  selectedId: string | null
  onSelect: (s: AiSession) => void
  defaultOpen: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={styles.group}>
      <button className={styles.groupHeader} onClick={() => setOpen(v => !v)}>
        <span className={styles.groupChevron} style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          {'\u25B6'}
        </span>
        <span className={styles.groupName}>{group.name}</span>
        {group.activeCount > 0 && (
          <span className={styles.groupActiveBadge}>{group.activeCount}</span>
        )}
        <span className={styles.groupCount}>{group.sessions.length}</span>
      </button>
      {open && group.sessions.map(s => {
        const isSelected = selectedId === s.session_id
        const title = s.note?.alias || s.summary || s.session_id.slice(0, 8)
        const tags = s.note?.tags ?? []
        const time = relativeTime(s.last_seen_at || s.started_at, t)

        return (
          <button
            key={s.session_id}
            className={isSelected ? styles.sessionItemActive : styles.sessionItem}
            onClick={() => onSelect(s)}
          >
            <div className={styles.sessionRow1}>
              <StatusDot status={s.status} />
              <span className={styles.sessionTitle}>{title}</span>
            </div>
            <div className={styles.sessionRow2}>
              <span className={styles.sessionTime}>{time}</span>
              <span className={styles.sessionEvents}>{s.event_count} {t('admin.sessions.events')}</span>
            </div>
            {tags.length > 0 && (
              <div className={styles.sessionTags}>
                {tags.slice(0, 3).map(tag => (
                  <span key={tag} className={styles.sessionTag}>{tag}</span>
                ))}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Session List item (flat, no groups — for compact mode) ──

function SessionItemFlat({
  session, isSelected, onSelect,
}: {
  session: AiSession
  isSelected: boolean
  onSelect: (s: AiSession) => void
}) {
  const { t } = useTranslation()
  const title = session.note?.alias || session.summary || session.session_id.slice(0, 8)
  const time = relativeTime(session.last_seen_at || session.started_at, t)

  return (
    <button
      className={isSelected ? styles.sessionItemActive : styles.sessionItem}
      onClick={() => onSelect(session)}
    >
      <div className={styles.sessionRow1}>
        <StatusDot status={session.status} />
        <span className={styles.sessionTitle}>{title}</span>
      </div>
      <div className={styles.sessionRow2}>
        <span className={styles.sessionTime}>{time}</span>
        <span className={styles.sessionEvents}>{session.event_count} {t('admin.sessions.events')}</span>
      </div>
    </button>
  )
}

// ── Main SessionList component ──

export interface SessionListProps {
  sessions: AiSession[]
  selectedId: string | null
  onSelect: (s: AiSession) => void
  onClearSelection?: () => void
  search: string
  onSearchChange: (v: string) => void
  loading: boolean
  compact?: boolean
  className?: string
}

export function SessionList({
  sessions, selectedId, onSelect, onClearSelection,
  search, onSearchChange, loading, compact, className,
}: SessionListProps) {
  const { t } = useTranslation()

  // Filter
  const filtered = useMemo(() => {
    if (!search.trim()) return sessions
    const q = search.toLowerCase()
    return sessions.filter(s =>
      (s.note?.alias ?? '').toLowerCase().includes(q) ||
      (s.cwd ?? '').toLowerCase().includes(q) ||
      (s.note?.tags ?? []).some(tag => tag.toLowerCase().includes(q)) ||
      (s.summary ?? '').toLowerCase().includes(q) ||
      s.session_id.toLowerCase().includes(q)
    )
  }, [sessions, search])

  // Groups (for full mode)
  const groups = useMemo(() => groupByProject(filtered), [filtered])

  // Selected cwd for default-open logic
  const selectedCwd = selectedId
    ? sessions.find(s => s.session_id === selectedId)?.cwd
    : null

  return (
    <div className={`${styles.leftPanel} ${className ?? ''}`}>
      {/* Header */}
      <div className={styles.leftHeader}>
        <span className={styles.leftTitle}>{t('admin.sessions.title')}</span>
        {onClearSelection && (
          <button className={styles.newChatBtn} onClick={onClearSelection}>
            + {t('admin_extra.new_conversation')}
          </button>
        )}
      </div>

      {/* Search */}
      <div className={styles.searchWrap}>
        <input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={t('admin.sessions.search_placeholder')}
          className={styles.searchInput}
        />
      </div>

      {/* Body */}
      <div className={styles.leftBody}>
        {loading ? (
          <div className={styles.listLoadingCenter}>
            {t('common.loading')}
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.listEmptyCenter}>
            <span className={styles.listEmptyIcon}>{'\u2317'}</span>
            <p className={styles.listEmptyText}>
              {search ? t('admin_extra.no_match_results') : t('admin.sessions.no_sessions')}
            </p>
          </div>
        ) : compact ? (
          filtered.map(s => (
            <SessionItemFlat
              key={s.session_id}
              session={s}
              isSelected={s.session_id === selectedId}
              onSelect={onSelect}
            />
          ))
        ) : (
          groups.map(g => (
            <SessionGroup
              key={g.cwd}
              group={g}
              selectedId={selectedId}
              onSelect={(s) => onSelect(s)}
              defaultOpen={
                groups.length <= 3 ||
                g.activeCount > 0 ||
                g.cwd === selectedCwd
              }
            />
          ))
        )}
      </div>
    </div>
  )
}
