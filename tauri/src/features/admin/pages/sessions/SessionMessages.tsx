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

function toUtcDate(iso: string | undefined | null): Date {
  if (!iso) return new Date()
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
  const [filter, setFilter] = useState('')
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

  // ── Filtered events ──

  const filteredEvents = filter.trim()
    ? events.filter(e => {
        const q = filter.toLowerCase()
        return (e.tool_name?.toLowerCase().includes(q))
          || e.event_type.toLowerCase().includes(q)
          || getToolDetail(e.tool_name, e.tool_input).toLowerCase().includes(q)
      })
    : events

  // ── Empty state (no session selected) ──

  if (!session) {
    return (
      <div className={styles.messagePanel}>
        {/* Toolbar: no session */}
        <div className={styles.toolbar}>
          <span className={styles.toolbarLabel}>
            {t('admin.sessions.list')}
          </span>
          <div />
        </div>
        <EmptyState
          icon={'\u2317'}
          title={t('admin.sessions.select_session')}
          description={t('admin.sessions.select_session_hint')}
        />
      </div>
    )
  }

  return (
    <div className={styles.messagePanel}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <button className={styles.toolbarSessionBtn} onClick={onDeselect}>
            <span style={{ color: 'var(--tc-border-active)' }}>{session.session_id.slice(0, 8)}</span>
            <span style={{ color: 'var(--tc-foreground-secondary)', marginLeft: 6 }}>{'\u2715'}</span>
          </button>
          {/* WS status dot */}
          <div className={styles.toolbarWsGroup}>
            <span
              className={styles.toolbarWsDot}
              data-status={wsStatus}
            />
            <span className={styles.toolbarWsLabel}>
              {wsStatus === 'connected' ? 'live' : wsStatus === 'connecting' ? '...' : 'off'}
            </span>
          </div>
        </div>
        <input
          className={styles.toolbarFilter}
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder={t('admin.sessions.search_placeholder')}
        />
      </div>

      {/* Messages */}
      {loading ? (
        <div className={styles.messageBody}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={i % 2 === 0 ? styles.bubbleLeft : styles.bubbleRight}
            >
              <Skeleton variant="rect" width={200 + (i % 3) * 40} height={52} borderRadius={12} />
            </div>
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className={styles.loadingCenter}>
          <span>{filter ? t('admin.sessions.no_events') : t('admin.sessions.no_events')}</span>
        </div>
      ) : (
        <div
          className={styles.messageBody}
          ref={scrollRef}
          onScroll={handleScroll}
        >
          {refreshing && (
            <div className={styles.refreshingBar}>refreshing...</div>
          )}

          {filteredEvents.map((event, idx) => {
            const isSystem = SYSTEM_EVENTS.has(event.event_type)
            const isOutgoing = event.event_type === 'PreToolUse'
            const isNotification = event.event_type === 'Notification'
            const isResult = event.event_type === 'PostToolUse'

            const icon = getToolIcon(event.event_type)
            const toolName = event.tool_name || event.event_type

            const detail = isNotification
              ? String((event.extra as Record<string, unknown>)?.message || '').slice(0, 160)
              : getToolDetail(event.tool_name, event.tool_input)

            // System event -> centered pill
            if (isSystem) {
              return (
                <div key={`${event.id}-${idx}`} className={styles.bubbleCenter}>
                  <span className={styles.systemPill}>
                    <span className={styles.systemIcon}>{icon}</span>
                    <span>{toolName}</span>
                    {detail && <span style={{ opacity: 0.7 }}>{'\u00B7'} {detail}</span>}
                    <span className={styles.systemTs}>{formatTimeFull(event.created_at)}</span>
                  </span>
                </div>
              )
            }

            // PreToolUse -> left, PostToolUse -> right, Notification -> left
            const isLeft = isOutgoing || isNotification
            return (
              <div key={`${event.id}-${idx}`} className={isLeft ? styles.bubbleLeft : styles.bubbleRight}>
                <div className={`${styles.bubbleCard} ${isLeft ? styles.bubbleCardOutgoing : styles.bubbleCardIncoming}`}>
                  {/* Header: tool icon + tool name | timestamp */}
                  <div className={styles.bubbleHeader}>
                    <span className={isOutgoing ? styles.bubbleToolNameBlue : isNotification ? styles.bubbleToolNameYellow : styles.bubbleToolNameGreen}>
                      <span style={{ marginRight: 4 }}>{icon}</span>
                      {toolName}
                    </span>
                    <span className={styles.bubbleTs}>{formatTimeFull(event.created_at)}</span>
                  </div>
                  {/* Detail text */}
                  {detail && <div className={styles.bubbleDetail}>{detail}</div>}
                  {/* Collapsible result for PostToolUse */}
                  {isResult && <CollapsibleResult result={event.tool_result} />}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Status bar */}
      <div className={styles.statusBar}>
        <span>{filteredEvents.length} {t('admin.sessions.events')}</span>
        {filter && (
          <button
            className={styles.statusBarClearBtn}
            onClick={() => setFilter('')}
          >
            {t('admin.sessions.clear_filter')}
          </button>
        )}
      </div>
    </div>
  )
}
