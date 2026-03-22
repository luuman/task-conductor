// SessionList.tsx — D4 全要素卡片布局
// 活跃/历史双区域，头像+摘要+标签+Chips+进度条

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
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function projName(cwd?: string): string {
  return (cwd || '').split('/').filter(Boolean).pop() || ''
}

// ── Section header ──

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className={styles.cardSectionHeader}>
      <span className={styles.cardSectionLabel}>{label}</span>
      <span className={styles.cardSectionCount}>{count}</span>
    </div>
  )
}

// ── Session Card (D4) ──

function SessionCard({
  session, isSelected, onSelect, maxEventCount, showProjectName,
}: {
  session: AiSession
  isSelected: boolean
  onSelect: (s: AiSession) => void
  maxEventCount: number
  showProjectName: boolean
}) {
  const { t } = useTranslation()
  const title = session.note?.alias || session.summary || session.session_id.slice(0, 8)
  const alias = session.note?.alias && session.note.alias !== session.summary ? session.summary : null
  const tags = session.note?.tags ?? []
  const time = relativeTime(session.last_seen_at || session.started_at, t)
  const dur = duration(session.started_at, session.last_seen_at || session.started_at)
  const proj = projName(session.cwd)
  const pct = Math.min(100, (session.event_count / Math.max(maxEventCount, 1)) * 100)

  const isActive = session.status === 'active'
  const isIdle = session.status === 'idle'

  const avatarCls = isActive ? styles.cardAvatarActive
    : isIdle ? styles.cardAvatarIdle
    : styles.cardAvatarStopped

  const statusCls = isActive ? styles.chipStatusActive
    : isIdle ? styles.chipStatusIdle
    : styles.chipStatusStopped

  const statusText = isActive ? t('admin.sessions.status_active', '运行中')
    : isIdle ? t('admin.sessions.status_idle', '空闲')
    : t('admin.sessions.status_stopped', '已结束')

  const emoji = isActive ? '\u26A1' : isIdle ? '\uD83D\uDCA4' : '\u2713'

  const dotCls = isActive ? styles.statusDotActive
    : isIdle ? styles.statusDotIdle
    : styles.statusDotStopped

  const barColor = isActive ? '#56d364' : isIdle ? '#e3b341' : 'var(--tc-border-active)'

  return (
    <button
      className={isSelected ? styles.cardActive : styles.card}
      onClick={() => onSelect(session)}
    >
      {/* Top: avatar + title */}
      <div className={styles.cardTop}>
        <div className={`${styles.cardAvatar} ${avatarCls}`}>
          {emoji}
          <span className={`${styles.cardAvatarDot} ${dotCls} ${isActive ? styles.cardAvatarDotPulse : ''}`} />
        </div>
        <div className={styles.cardMain}>
          <div className={styles.cardRow1}>
            <span className={styles.cardTitle}>{title}</span>
            <span className={styles.cardTime}>{time}</span>
          </div>
          {alias && (
            <div className={styles.cardAlias}>
              <span className={styles.cardAliasIcon}>{'\u2726'}</span>
              {alias}
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      {session.summary && (
        <div className={styles.cardSummary}>{session.summary}</div>
      )}

      {/* Chips */}
      <div className={styles.cardChips}>
        <span className={`${styles.chip} ${statusCls}`}>{statusText}</span>
        {dur && <span className={`${styles.chip} ${styles.chipDur}`}>{'\u23F1'} {dur}</span>}
        <span className={`${styles.chip} ${styles.chipEvt}`}>{'\u26A1'} {session.event_count}</span>
        {showProjectName && proj && (
          <span className={`${styles.chip} ${styles.chipProj}`}>{'\uD83D\uDCC1'} {proj}</span>
        )}
        {session.note?.linked_task_id && (
          <span className={`${styles.chip} ${styles.chipTask}`}>{'\uD83D\uDD17'} Task #{session.note.linked_task_id}</span>
        )}
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className={styles.cardTags}>
          {tags.slice(0, 4).map(tag => (
            <span key={tag} className={styles.cardTag}>{tag}</span>
          ))}
        </div>
      )}

      {/* Progress bar */}
      <div className={styles.cardProgress}>
        <div className={styles.cardProgressBar}>
          <div className={styles.cardProgressFill} style={{ width: `${pct}%`, background: barColor }} />
        </div>
        <span className={styles.cardProgressLabel}>{session.event_count} ev</span>
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
  const { activeSessions, historySessions, maxEventCount } = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      const aActive = a.status === 'active' ? 2 : a.status === 'idle' ? 1 : 0
      const bActive = b.status === 'active' ? 2 : b.status === 'idle' ? 1 : 0
      if (bActive !== aActive) return bActive - aActive
      return safeDate(b.last_seen_at || b.started_at).getTime() -
        safeDate(a.last_seen_at || a.started_at).getTime()
    })
    const active = sorted.filter(s => s.status === 'active' || s.status === 'idle')
    const history = sorted.filter(s => s.status !== 'active' && s.status !== 'idle')
    const max = Math.max(...sorted.map(s => s.event_count), 1)
    return { activeSessions: active, historySessions: history, maxEventCount: max }
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
          <>
            {activeSessions.length > 0 && (
              <>
                <SectionHeader
                  label={`● ${t('admin.sessions.section_active', '活跃中')}`}
                  count={activeSessions.length}
                />
                {activeSessions.map(s => (
                  <SessionCard
                    key={s.session_id}
                    session={s}
                    isSelected={s.session_id === selectedId}
                    onSelect={onSelect}
                    maxEventCount={maxEventCount}
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
                  <SessionCard
                    key={s.session_id}
                    session={s}
                    isSelected={s.session_id === selectedId}
                    onSelect={onSelect}
                    maxEventCount={maxEventCount}
                    showProjectName={showProjectName}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
