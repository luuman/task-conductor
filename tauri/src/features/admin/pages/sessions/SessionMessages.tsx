import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AiSession, SessionEvent } from '../../../../lib/api/types'
import { api } from '../../../../lib/api'
import { EmptyState } from '../../../../ui/empty-state/EmptyState'
import { Skeleton } from '../../../../ui/skeleton/Skeleton'
import styles from './sessions.module.css'

// ── Module-level event cache (persists across re-renders) ──

const eventCache = new Map<string, SessionEvent[]>()
const cacheInsertOrder: string[] = []
const MAX_CACHE_SESSIONS = 20

function cacheSet(sessionId: string, events: SessionEvent[]) {
  if (!eventCache.has(sessionId)) {
    if (cacheInsertOrder.length >= MAX_CACHE_SESSIONS) {
      const oldest = cacheInsertOrder.shift()
      if (oldest) eventCache.delete(oldest)
    }
    cacheInsertOrder.push(sessionId)
  }
  eventCache.set(sessionId, events)
}

function cacheGet(sessionId: string): SessionEvent[] | undefined {
  return eventCache.get(sessionId)
}

// ── Tool detail formatter ──

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
    case 'PreToolUse': return '\u2192'
    case 'PostToolUse': return '\u2713'
    case 'Notification': return '\u25C6'
    case 'Stop': return '\u25A0'
    case 'SessionStart': return '\u25B6'
    case 'SessionEnd': return '\u25C0'
    case 'SubagentStart': return '\u21B3'
    case 'SubagentStop': return '\u21B5'
    default: return '\u00B7'
  }
}

const SYSTEM_EVENTS = new Set(['SessionStart', 'SessionEnd', 'Stop', 'SubagentStart', 'SubagentStop'])

function toUtcDate(iso: string): Date {
  const s = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z'
  return new Date(s)
}

function formatTimeFull(iso: string): string {
  try {
    return toUtcDate(iso).toLocaleTimeString(undefined, { hour12: false })
  } catch {
    return ''
  }
}

function formatResult(result: unknown): string {
  if (!result) return ''
  if (typeof result === 'string') return result.slice(0, 2000)
  try { return JSON.stringify(result, null, 2).slice(0, 2000) } catch { return '' }
}

function cwdName(cwd?: string): string {
  if (!cwd) return ''
  const parts = cwd.replace(/\/$/, '').split('/')
  return parts[parts.length - 1] || ''
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

// ── Main messages component ──

interface Props {
  session: AiSession | null
  onDeselect: () => void
}

export function SessionMessages({ session, onDeselect }: Props) {
  const { t } = useTranslation()
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const scrollRef = useRef<HTMLDivElement>(null)
  const shouldAutoScroll = useRef(true)

  // ── Scroll helpers ──

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  const handleScroll = useCallback(() => {
    shouldAutoScroll.current = isNearBottom()
  }, [isNearBottom])

  // ── Load events (cache-first, then fetch fresh) ──

  useEffect(() => {
    if (!session) {
      setEvents([])
      setLoading(false)
      setRefreshing(false)
      return
    }

    const cached = cacheGet(session.session_id)
    if (cached) {
      setEvents(cached)
      setLoading(false)
      setRefreshing(true)
      // Scroll to bottom with cached data immediately
      requestAnimationFrame(() => scrollToBottom('instant'))
    } else {
      setLoading(true)
    }

    api.getSessionEvents(session.session_id)
      .then(evs => {
        setEvents(evs)
        cacheSet(session.session_id, evs)
        setLoading(false)
        setRefreshing(false)
        // Scroll to bottom on first load
        requestAnimationFrame(() => scrollToBottom('instant'))
      })
      .catch(() => {
        setLoading(false)
        setRefreshing(false)
      })
  }, [session, scrollToBottom])

  // ── WebSocket real-time updates ──

  useEffect(() => {
    if (!session) {
      setWsStatus('disconnected')
      return
    }

    setWsStatus('connecting')
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${proto}//${location.host}/ws/session/${session.session_id}`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => setWsStatus('connected')
    ws.onclose = () => setWsStatus('disconnected')
    ws.onerror = () => setWsStatus('disconnected')

    ws.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data)
        if (parsed.type === 'claude_event' && parsed.data) {
          const d = parsed.data as Record<string, unknown>
          const newEvent: SessionEvent = {
            id: Date.now(),
            session_id: session.session_id,
            event_type: String(d.event_type || ''),
            tool_name: (d.tool_name as string | null) || null,
            tool_input: d.tool_input ?? null,
            tool_result: d.tool_result ?? null,
            extra: d.extra ?? null,
            created_at: String(d.ts || new Date().toISOString()),
          }
          setEvents(prev => {
            const updated = [...prev, newEvent]
            cacheSet(session.session_id, updated)
            return updated
          })
        }
      } catch { /* ignore parse errors */ }
    }

    return () => {
      ws.close()
      setWsStatus('disconnected')
    }
  }, [session])

  // ── Auto-scroll when new events arrive ──

  useEffect(() => {
    if (shouldAutoScroll.current) {
      scrollToBottom('smooth')
    }
  }, [events, scrollToBottom])

  // ── Empty state ──

  if (!session) {
    return (
      <div className={styles.messagePanel}>
        <EmptyState
          icon={'\u2328'}
          title={t('admin.sessions.select_session')}
          description={t('admin.sessions.select_session_hint')}
        />
      </div>
    )
  }

  const headerTitle = session.note?.alias || session.summary || cwdName(session.cwd) || session.provider
  const headerMeta = [
    cwdName(session.cwd),
    `${session.event_count} ${t('admin.sessions.events')}`,
  ].filter(Boolean).join(' \u00B7 ')

  return (
    <div className={styles.messagePanel}>
      {/* Header */}
      <div className={styles.messageHeader}>
        <div className={styles.messageHeaderLeft}>
          <span className={styles.messageHeaderAvatar}>{'\uD83E\uDD16'}</span>
          <div className={styles.messageHeaderInfo}>
            <span className={styles.messageHeaderTitle}>{headerTitle}</span>
            <div className={styles.messageHeaderMeta}>
              <span>{headerMeta}</span>
              {session.status && (
                <span className={styles.statusDot} data-status={session.status} />
              )}
            </div>
          </div>
        </div>
        <div className={styles.headerRight}>
          {/* WS status indicator */}
          <div className={styles.wsIndicator}>
            <span
              className={styles.wsDot}
              data-status={wsStatus}
            />
            <span className={styles.wsLabel}>
              {wsStatus === 'connected' ? 'live' : wsStatus === 'connecting' ? '...' : 'off'}
            </span>
          </div>
          <button
            className={styles.messageHeaderBack}
            onClick={onDeselect}
          >
            {'\u2190'} {t('common.back')}
          </button>
        </div>
      </div>

      {/* Messages */}
      {loading ? (
        <div className={styles.messageBody}>
          {/* Skeleton bubbles */}
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={i % 2 === 0 ? styles.skeletonLeft : styles.skeletonRight}
            >
              <Skeleton variant="rect" width={200 + (i % 3) * 40} height={52} borderRadius={12} />
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className={styles.loadingCenter}>
          <span>{t('admin.sessions.no_events')}</span>
        </div>
      ) : (
        <div
          className={styles.messageBody}
          ref={scrollRef}
          onScroll={handleScroll}
        >
          {/* Refreshing indicator */}
          {refreshing && (
            <div className={styles.refreshingBar}>
              refreshing...
            </div>
          )}

          {events.map((event, idx) => {
            const isSystem = SYSTEM_EVENTS.has(event.event_type)
            const isOutgoing = event.event_type === 'PreToolUse'
            const isNotification = event.event_type === 'Notification'
            const isResult = event.event_type === 'PostToolUse'

            const icon = getToolIcon(event.event_type)
            const toolName = event.tool_name || event.event_type

            // Show date divider if day changed
            const prevEvent = idx > 0 ? events[idx - 1] : null
            const showDateDivider = !prevEvent ||
              toUtcDate(event.created_at).toDateString() !== toUtcDate(prevEvent.created_at).toDateString()
            const dateLabel = showDateDivider ? getDateLabel(event.created_at) : null

            const detail = isNotification
              ? String((event.extra as Record<string, unknown>)?.message || '').slice(0, 160)
              : getToolDetail(event.tool_name, event.tool_input)

            return (
              <div key={`${event.id}-${idx}`}>
                {/* Date divider */}
                {dateLabel && (
                  <div className={styles.dateDivider}>
                    <div className={styles.dateDividerLine} />
                    <span className={styles.dateDividerLabel}>{dateLabel}</span>
                    <div className={styles.dateDividerLine} />
                  </div>
                )}

                {/* System event → centered pill */}
                {isSystem ? (
                  <div className={styles.systemRow}>
                    <span className={styles.systemPill}>
                      <span className={styles.systemIcon}>{icon}</span>
                      <span>{toolName}</span>
                      <span className={styles.systemTs}>{formatTimeFull(event.created_at)}</span>
                    </span>
                  </div>
                ) : (
                  /* PreToolUse → left (outgoing), PostToolUse → right (incoming), Notification → left */
                  <div className={isOutgoing ? styles.bubbleRowLeft : isNotification ? styles.bubbleRowLeft : styles.bubbleRowRight}>
                    <div className={
                      isOutgoing
                        ? styles.bubbleOutgoing
                        : isNotification
                          ? styles.bubbleNotification
                          : styles.bubbleIncoming
                    }>
                      {/* Header: icon + tool name */}
                      <div className={styles.bubbleHeader}>
                        <span className={styles.bubbleToolIcon} data-type={event.event_type}>{icon}</span>
                        <span className={styles.bubbleToolName} data-type={event.event_type}>{toolName}</span>
                        <span className={styles.bubbleTs}>{formatTimeFull(event.created_at)}</span>
                      </div>
                      {/* Detail text */}
                      {detail && <div className={styles.bubbleDetail}>{detail}</div>}
                      {/* Collapsible result for PostToolUse */}
                      {isResult && <CollapsibleResult result={event.tool_result} />}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Status bar */}
      <div className={styles.statusBar}>
        <span>{events.length} {t('admin.sessions.events')}</span>
        <span>{formatTimeFull(session.started_at)}</span>
      </div>
    </div>
  )
}

// ── Helper ──

function getDateLabel(iso: string): string {
  const d = toUtcDate(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString()
}
