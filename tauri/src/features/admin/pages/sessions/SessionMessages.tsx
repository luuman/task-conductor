import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AiSession, SessionEvent } from '../../../../lib/api/types'
import { api } from '../../../../lib/api'
import { EmptyState } from '../../../../ui/empty-state/EmptyState'
import { Skeleton } from '../../../../ui/skeleton/Skeleton'
import styles from './sessions.module.css'

// ── Tool detail formatter (adapted from reference frontend) ──

function getToolDetail(tool: string | null, input: unknown): string {
  if (!tool || !input || typeof input !== 'object') return ''
  const inp = input as Record<string, unknown>
  switch (tool) {
    case 'Read': case 'Write': case 'Edit':
      return String(inp.file_path || inp.notebook_path || '')
    case 'Bash':
      return String(inp.command || '').slice(0, 160)
    case 'Glob':
      return String(inp.pattern || '')
    case 'Grep':
      return `"${inp.pattern}"${inp.path ? '  ' + inp.path : ''}`
    case 'WebSearch':
      return String(inp.query || '')
    case 'WebFetch':
      return String(inp.url || '')
    case 'Agent':
      return String(inp.description || inp.prompt || '').slice(0, 100)
    default:
      try { return JSON.stringify(input).slice(0, 100) } catch { return '' }
  }
}

function getToolIcon(eventType: string): string {
  switch (eventType) {
    case 'PreToolUse': return '\u{2192}'
    case 'PostToolUse': return '\u{2713}'
    case 'Notification': return '\u{1F514}'
    case 'Stop': return '\u{25A0}'
    case 'SessionStart': return '\u{25B6}'
    case 'SessionEnd': return '\u{25C0}'
    case 'SubagentStart': return '\u{21B3}'
    case 'SubagentStop': return '\u{21B5}'
    default: return '\u{00B7}'
  }
}

const SYSTEM_EVENTS = new Set(['SessionStart', 'SessionEnd', 'Stop', 'SubagentStart', 'SubagentStop'])

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour12: false })
  } catch {
    return ''
  }
}

function formatResult(result: unknown): string {
  if (!result) return ''
  if (typeof result === 'string') return result.slice(0, 2000)
  try { return JSON.stringify(result, null, 2).slice(0, 2000) } catch { return '' }
}

// ── Collapsible result block ──

function CollapsibleResult({ result }: { result: unknown }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const text = formatResult(result)
  if (!text) return null

  return (
    <div className={styles.bubbleCollapse}>
      <button className={styles.collapseToggle} onClick={() => setOpen(!open)}>
        {open ? t('admin.sessions.collapse') : t('admin.sessions.expand_result')}
      </button>
      {open && <div className={styles.collapseContent}>{text}</div>}
    </div>
  )
}

// ── Single bubble ──

function EventBubble({ event }: { event: SessionEvent }) {
  const isSystem = SYSTEM_EVENTS.has(event.event_type)
  const isNotification = event.event_type === 'Notification'
  const isResult = event.event_type === 'PostToolUse'
  const icon = getToolIcon(event.event_type)
  const toolName = event.tool_name || event.event_type
  const detail = isNotification
    ? String((event.extra as Record<string, unknown>)?.message || '').slice(0, 160)
    : getToolDetail(event.tool_name, event.tool_input)

  if (isSystem) {
    return (
      <div className={styles.bubbleRowCenter}>
        <div className={styles.bubbleSystem}>
          <span>{icon}</span>
          <span>{toolName}</span>
          {detail && <span style={{ opacity: 0.7 }}>{detail}</span>}
          <span style={{ opacity: 0.5 }}>{formatTime(event.created_at)}</span>
        </div>
      </div>
    )
  }

  if (isNotification) {
    return (
      <div className={styles.bubbleRowLeft}>
        <div className={styles.bubbleNotify}>
          <div className={styles.bubbleToolName}>
            <span className={styles.bubbleToolIcon}>{icon}</span>
            Notification
          </div>
          {detail && <div className={styles.bubbleDetail}>{detail}</div>}
          <div className={styles.bubbleTime}>{formatTime(event.created_at)}</div>
        </div>
      </div>
    )
  }

  if (isResult) {
    return (
      <div className={styles.bubbleRowRight}>
        <div className={styles.bubbleResult}>
          <div className={styles.bubbleToolName} style={{ color: 'var(--tc-success)' }}>
            <span className={styles.bubbleToolIcon}>{icon}</span>
            {toolName}
          </div>
          {detail && <div className={styles.bubbleDetail}>{detail}</div>}
          <CollapsibleResult result={event.tool_result} />
          <div className={styles.bubbleTime}>{formatTime(event.created_at)}</div>
        </div>
      </div>
    )
  }

  // PreToolUse or other
  return (
    <div className={styles.bubbleRowLeft}>
      <div className={styles.bubbleTool}>
        <div className={styles.bubbleToolName}>
          <span className={styles.bubbleToolIcon}>{icon}</span>
          {toolName}
        </div>
        {detail && <div className={styles.bubbleDetail}>{detail}</div>}
        <div className={styles.bubbleTime}>{formatTime(event.created_at)}</div>
      </div>
    </div>
  )
}

// ── Main messages component ──

interface Props {
  session: AiSession | null
  onDeselect: () => void
}

export function SessionMessages({ session, onDeselect }: Props) {
  const { t } = useTranslation()
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!session) {
      setEvents([])
      return
    }
    setLoading(true)
    api.getSessionEvents(session.session_id)
      .then(evs => {
        setEvents(evs)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [session])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  if (!session) {
    return (
      <div className={styles.messagePanel}>
        <EmptyState
          icon="\u{2328}"
          title={t('admin.sessions.select_session')}
          description={t('admin.sessions.select_session_hint')}
        />
      </div>
    )
  }

  return (
    <div className={styles.messagePanel}>
      {/* Header */}
      <div className={styles.messageHeader}>
        <div className={styles.messageHeaderLeft}>
          <span className={styles.messageHeaderId}>{session.session_id.slice(0, 12)}</span>
          <span className={styles.messageHeaderMeta}>
            {session.provider} &middot; {session.event_count} {t('admin.sessions.events')}
          </span>
        </div>
        <button
          onClick={onDeselect}
          style={{
            background: 'none',
            border: '1px solid var(--tc-border)',
            borderRadius: 6,
            padding: '3px 10px',
            fontSize: 11,
            color: 'var(--tc-foreground-secondary)',
            cursor: 'pointer',
          }}
        >
          {t('common.back')}
        </button>
      </div>

      {/* Messages */}
      {loading ? (
        <div className={styles.messageBody}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: i % 2 === 0 ? 'flex-start' : 'flex-end' }}>
              <Skeleton variant="rect" width={240} height={60} borderRadius={12} />
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className={styles.loadingCenter}>
          <span>{t('admin.sessions.no_events')}</span>
        </div>
      ) : (
        <div className={styles.messageBody}>
          {events.map(ev => (
            <EventBubble key={ev.id} event={ev} />
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Status bar */}
      <div className={styles.statusBar}>
        <span>{events.length} {t('admin.sessions.events')}</span>
        <span>{formatTime(session.started_at)}</span>
      </div>
    </div>
  )
}
