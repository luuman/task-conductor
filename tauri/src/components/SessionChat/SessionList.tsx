// SessionList.tsx — G. Notion 表格布局
// 扁平表格行，列头+紧凑行，Notion 风格

import { useMemo } from 'react'
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

function duration(startIso: string, endIso: string): string {
  const s = safeDate(startIso), e = safeDate(endIso)
  const mins = Math.round((e.getTime() - s.getTime()) / 60000)
  if (mins < 1) return '<1m'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60), m = mins % 60
  return m > 0 ? `${h}h${m}m` : `${h}h`
}

function projName(cwd?: string): string {
  return (cwd || '').split('/').filter(Boolean).pop() || ''
}

// ── Section header ──

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className={styles.ntSectionHeader}>
      <span className={styles.ntSectionLabel}>{label}</span>
      <span className={styles.ntSectionCount}>{count}</span>
    </div>
  )
}

// ── Table header ──

function TableHeader({ showProjectName }: { showProjectName: boolean }) {
  const { t } = useTranslation()
  return (
    <div className={styles.ntHeaderRow}>
      <span className={styles.ntColStatus} />
      <span className={styles.ntColTitle}>{t('admin.sessions.col_title', '标题')}</span>
      {showProjectName && (
        <span className={styles.ntColProject}>{t('admin.sessions.col_project', '项目')}</span>
      )}
      <span className={styles.ntColDuration}>{t('admin.sessions.col_duration', '时长')}</span>
      <span className={styles.ntColEvents}>{t('admin.sessions.col_events', '事件')}</span>
      <span className={styles.ntColTime}>{t('admin.sessions.col_time', '时间')}</span>
    </div>
  )
}

// ── Session Row (Notion table row) ──

function SessionRow({
  session, isSelected, onSelect, showProjectName,
}: {
  session: AiSession
  isSelected: boolean
  onSelect: (s: AiSession) => void
  showProjectName: boolean
}) {
  const { t } = useTranslation()
  const title = session.note?.alias || session.summary || session.session_id.slice(0, 8)
  const time = relativeTime(session.last_seen_at || session.started_at, t)
  const dur = duration(session.started_at, session.last_seen_at || session.started_at)
  const proj = projName(session.cwd)
  const tags = session.note?.tags ?? []

  const isActive = session.status === 'active'
  const isIdle = session.status === 'idle'

  const dotCls = isActive ? styles.ntDotActive
    : isIdle ? styles.ntDotIdle
    : styles.ntDotStopped

  return (
    <button
      className={isSelected ? styles.ntRowSelected : styles.ntRow}
      onClick={() => onSelect(session)}
    >
      {/* Status dot */}
      <span className={styles.ntColStatus}>
        <span className={`${styles.ntDot} ${dotCls} ${isActive ? styles.ntDotPulse : ''}`} />
      </span>

      {/* Title + tags */}
      <span className={styles.ntColTitle}>
        <span className={styles.ntTitle}>{title}</span>
        {tags.length > 0 && (
          <span className={styles.ntInlineTags}>
            {tags.slice(0, 2).map(tag => (
              <span key={tag} className={styles.ntTag}>{tag}</span>
            ))}
          </span>
        )}
      </span>

      {/* Project */}
      {showProjectName && (
        <span className={styles.ntColProject}>
          {proj && <span className={styles.ntProjectName}>{proj}</span>}
        </span>
      )}

      {/* Duration */}
      <span className={styles.ntColDuration}>
        <span className={styles.ntMono}>{dur}</span>
      </span>

      {/* Events */}
      <span className={styles.ntColEvents}>
        <span className={styles.ntEventCount}>{session.event_count}</span>
      </span>

      {/* Time */}
      <span className={styles.ntColTime}>
        <span className={styles.ntTimeText}>{time}</span>
      </span>
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
  showProjectName?: boolean
  className?: string
}

export function SessionList({
  sessions, selectedId, onSelect, onClearSelection,
  search, onSearchChange, loading, compact: _compact, showProjectName = true, className,
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

  // Split into active/history + sort
  const { activeSessions, historySessions } = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      const aActive = a.status === 'active' ? 2 : a.status === 'idle' ? 1 : 0
      const bActive = b.status === 'active' ? 2 : b.status === 'idle' ? 1 : 0
      if (bActive !== aActive) return bActive - aActive
      return safeDate(b.last_seen_at || b.started_at).getTime() -
        safeDate(a.last_seen_at || a.started_at).getTime()
    })
    const active = sorted.filter(s => s.status === 'active' || s.status === 'idle')
    const history = sorted.filter(s => s.status !== 'active' && s.status !== 'idle')
    return { activeSessions: active, historySessions: history }
  }, [filtered])

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
        ) : (
          <div className={styles.ntTable}>
            {/* Column headers */}
            <TableHeader showProjectName={showProjectName} />

            {activeSessions.length > 0 && (
              <>
                <SectionHeader
                  label={`● ${t('admin.sessions.section_active', '活跃中')}`}
                  count={activeSessions.length}
                />
                {activeSessions.map(s => (
                  <SessionRow
                    key={s.session_id}
                    session={s}
                    isSelected={s.session_id === selectedId}
                    onSelect={onSelect}
                    showProjectName={showProjectName}
                  />
                ))}
              </>
            )}
            {historySessions.length > 0 && (
              <>
                <SectionHeader
                  label={t('admin.sessions.section_history', '历史记录')}
                  count={historySessions.length}
                />
                {historySessions.map(s => (
                  <SessionRow
                    key={s.session_id}
                    session={s}
                    isSelected={s.session_id === selectedId}
                    onSelect={onSelect}
                    showProjectName={showProjectName}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
