import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../../lib/api'
import type { AiSession, SessionEvent } from '../../../lib/api/types'
import { SessionCalendar } from './sessions/SessionCalendar'
import styles from './sessions/sessions.module.css'

// ── Timestamp parsing (append Z if missing) ─────────────────

function parseTs(iso: string): Date {
  if (!iso) return new Date()
  const s = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z'
  return new Date(s)
}

// ── Tool detail formatter (match frontend) ──────────────────

function getToolDetail(
  tool: string | null | undefined,
  input: Record<string, unknown> | null | undefined,
): string {
  if (!tool || !input) return ''
  switch (tool) {
    case 'Read': case 'Write': case 'Edit':
      return String(input.file_path || input.notebook_path || '')
    case 'Bash':
      return String(input.command || '').slice(0, 160)
    case 'Glob':
      return String(input.pattern || '')
    case 'Grep':
      return `"${input.pattern}"${input.path ? '  ' + input.path : ''}`
    case 'WebSearch':
      return String(input.query || '')
    case 'WebFetch':
      return String(input.url || '')
    case 'Agent':
      return String(input.description || input.prompt || '').slice(0, 100)
    default:
      try { return JSON.stringify(input).slice(0, 100) } catch { return '' }
  }
}

// ── EventRow type (match frontend) ──────────────────────────

interface EventRow {
  id: string
  ts: string
  icon: string
  iconColor: string   // CSS color value
  eventType: string
  tool: string
  detail: string
  sessionId: string
}

// ── Event style (CSS color values, not Tailwind) ────────────

function applyEventStyle(eventType: string): { icon: string; iconColor: string } {
  switch (eventType) {
    case 'PreToolUse':   return { icon: '\u2192', iconColor: '#79c0ff' }
    case 'PostToolUse':  return { icon: '\u2713', iconColor: '#56d364' }
    case 'Notification': return { icon: '\u25C6', iconColor: '#e3b341' }
    case 'Stop':         return { icon: '\u25A0', iconColor: '#f85149' }
    case 'SessionStart': return { icon: '\u25B6', iconColor: '#bc8cff' }
    case 'SessionEnd':   return { icon: '\u25C0', iconColor: '#a371f7' }
    default:             return { icon: '\u00B7', iconColor: '#8b949e' }
  }
}

// ── DB event → EventRow ─────────────────────────────────────

function dbEventToRow(e: SessionEvent): EventRow {
  const ts = parseTs(e.created_at).toLocaleTimeString(undefined, { hour12: false })
  const { icon, iconColor } = applyEventStyle(e.event_type)
  let displayTool = e.tool_name || e.event_type
  let detail = getToolDetail(e.tool_name, e.tool_input as Record<string, unknown> | null)

  if (e.event_type === 'Notification') {
    displayTool = 'Notify'
    detail = String((e.extra as Record<string, unknown>)?.message || '').slice(0, 160)
  }
  if (e.event_type === 'Stop') displayTool = 'Stop'
  if (e.event_type === 'SessionStart') displayTool = 'SessionStart'
  if (e.event_type === 'SessionEnd') displayTool = 'SessionEnd'

  return {
    id: `db-${e.id}`,
    ts, icon, iconColor, eventType: e.event_type,
    tool: displayTool || '', detail,
    sessionId: e.session_id.slice(0, 8),
  }
}

// ── WS event → EventRow ─────────────────────────────────────

let wsRowCounter = 0

function wsEventToRow(data: Record<string, unknown>): EventRow {
  const eventType = String(data.event_type || '')
  const toolName = data.tool_name as string | null
  const toolInput = data.tool_input as Record<string, unknown> | null
  const extra = data.extra as Record<string, unknown> | null
  const rawTs = data.ts as string | undefined
  const sessionId = String(data.session_id || '').slice(0, 8)

  const ts = rawTs
    ? parseTs(rawTs).toLocaleTimeString(undefined, { hour12: false })
    : new Date().toLocaleTimeString(undefined, { hour12: false })

  const { icon, iconColor } = applyEventStyle(eventType)
  let displayTool = toolName || eventType
  let detail = getToolDetail(toolName, toolInput)

  if (eventType === 'Notification') {
    displayTool = 'Notify'
    detail = String(extra?.message || '').slice(0, 160)
  }
  if (eventType === 'Stop') displayTool = 'Stop'
  if (eventType === 'SessionStart') displayTool = 'SessionStart'
  if (eventType === 'SessionEnd') displayTool = 'SessionEnd'

  return {
    id: `ws-${wsRowCounter++}`,
    ts, icon, iconColor, eventType,
    tool: displayTool || '', detail,
    sessionId,
  }
}

// ── Status badge ────────────────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
  const color = status === 'active' ? 'var(--tc-success)'
    : status === 'idle' ? 'var(--tc-warning)'
    : 'var(--tc-foreground-secondary)'
  const bg = status === 'active' ? 'rgba(86,211,100,0.15)'
    : status === 'idle' ? 'rgba(229,161,0,0.15)'
    : 'rgba(128,128,128,0.15)'
  const label = status === 'active' ? 'Running' : status === 'idle' ? 'Idle' : 'Stopped'

  return (
    <span className={styles.statusBadge} style={{ background: bg, color }}>
      {label}
    </span>
  )
}

// ── System event types ──────────────────────────────────────

const SYSTEM_EVENTS = new Set([
  'SessionStart', 'SessionEnd', 'Stop', 'Notification',
  'SubagentStart', 'SubagentStop',
])

// ── Format result for collapsible ───────────────────────────

function formatResult(result: unknown): string {
  if (!result) return ''
  if (typeof result === 'string') return result.slice(0, 2000)
  try { return JSON.stringify(result, null, 2).slice(0, 2000) } catch { return '' }
}

// ── Collapsible result block ────────────────────────────────

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

// ── Chat bubbles (inline sub-component, match frontend) ─────

function ChatBubbles({ rows, filter, emptyHint, events }: {
  rows: EventRow[]
  filter: string
  emptyHint: React.ReactNode
  events: SessionEvent[]    // for tool_result access
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const filtered = filter.trim()
    ? rows.filter(l =>
        l.tool.toLowerCase().includes(filter.toLowerCase()) ||
        l.detail.toLowerCase().includes(filter.toLowerCase()) ||
        l.eventType.toLowerCase().includes(filter.toLowerCase()))
    : rows

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [rows])

  if (filtered.length === 0) {
    return (
      <div className={styles.emptyCenter}>
        {emptyHint}
      </div>
    )
  }

  // Build a map from EventRow id → SessionEvent for tool_result
  const eventById = new Map<string, SessionEvent>()
  events.forEach(e => eventById.set(`db-${e.id}`, e))

  return (
    <div className={styles.messageBody}>
      {filtered.map((line) => {
        const isSystem = SYSTEM_EVENTS.has(line.eventType)
        const isOutgoing = line.eventType === 'PreToolUse'
        const isResult = line.eventType === 'PostToolUse'

        // System events → centered pill
        if (isSystem) {
          return (
            <div key={line.id} className={styles.bubbleCenter}>
              <span className={styles.systemPill}>
                <span style={{ color: line.iconColor }}>{line.icon}</span>
                <span>{line.tool}</span>
                {line.detail && <span style={{ opacity: 0.7 }}>{'\u00B7'} {line.detail}</span>}
                <span className={styles.systemTs}>{line.ts}</span>
              </span>
            </div>
          )
        }

        // PreToolUse → left, PostToolUse → right
        const isLeft = isOutgoing
        const srcEvent = eventById.get(line.id)

        return (
          <div key={line.id} className={isLeft ? styles.bubbleLeft : styles.bubbleRight}>
            <div className={`${styles.bubbleCard} ${isLeft ? styles.bubbleCardOutgoing : styles.bubbleCardIncoming}`}>
              {/* Header: icon + tool name | timestamp */}
              <div className={styles.bubbleHeader}>
                <span className={isOutgoing ? styles.bubbleToolNameBlue : styles.bubbleToolNameGreen}>
                  <span style={{ marginRight: 4 }}>{line.icon}</span>
                  {line.tool}
                </span>
                <span className={styles.bubbleTs}>{line.ts}</span>
              </div>
              {/* Detail text */}
              {line.detail && (
                <div className={styles.bubbleDetail} title={line.detail}>
                  {line.detail}
                </div>
              )}
              {/* Collapsible result for PostToolUse */}
              {isResult && srcEvent && <CollapsibleResult result={srcEvent.tool_result} />}
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}

// ── Per-session WebSocket hook (match frontend) ─────────────

type SessionWsStatus = 'disconnected' | 'connecting' | 'connected'

function useSessionWs(
  sessionId: string | null,
  onEvent: (row: EventRow) => void,
) {
  const [status, setStatus] = useState<SessionWsStatus>('disconnected')
  const wsRef = useRef<WebSocket | null>(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    if (!sessionId) {
      setStatus('disconnected')
      return
    }

    setStatus('connecting')
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${proto}//${location.host}/ws/session/${sessionId}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => setStatus('connected')
    ws.onclose = () => setStatus('disconnected')
    ws.onerror = () => setStatus('disconnected')

    ws.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data)
        if (parsed.type === 'claude_event' && parsed.data) {
          onEventRef.current(wsEventToRow(parsed.data as Record<string, unknown>))
        }
      } catch { /* ignore */ }
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [sessionId])

  return status
}

// ── Helper: cwd last 2 segments ─────────────────────────────

function cwdShort(cwd?: string): string {
  if (!cwd) return ''
  const parts = cwd.replace(/\\/g, '/').split('/')
  return parts.slice(-2).join('/') || cwd
}

// ── Main page component ─────────────────────────────────────

export default function AdminSessions() {
  const { t } = useTranslation()

  // Session list
  const [sessions, setSessions] = useState<AiSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // History events (loaded from DB when session selected)
  const [historyRows, setHistoryRows] = useState<EventRow[]>([])
  const [historyEvents, setHistoryEvents] = useState<SessionEvent[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Live events (from per-session WebSocket)
  const [liveRows, setLiveRows] = useState<EventRow[]>([])

  // Filter
  const [filter, setFilter] = useState('')

  // View toggle (tauri bonus)
  const [view, setView] = useState<'messages' | 'calendar'>('messages')
  const [calendarDate, setCalendarDate] = useState<string | null>(null)

  // WS event callback
  const handleWsEvent = useCallback((row: EventRow) => {
    setLiveRows(prev => [...prev, row].slice(-500))
  }, [])

  const sessionWsStatus = useSessionWs(selectedId, handleWsEvent)

  // Load session list (on mount + 5s auto-refresh)
  const loadSessions = useCallback(() => {
    api.getSessions()
      .then(s => { setSessions(s); setSessionsLoading(false) })
      .catch(() => setSessionsLoading(false))
  }, [])

  useEffect(() => {
    loadSessions()
    const id = setInterval(loadSessions, 5000)
    return () => clearInterval(id)
  }, [loadSessions])

  // Select / deselect session
  const handleSelectSession = (sid: string) => {
    if (selectedId === sid) {
      setSelectedId(null)
      setHistoryRows([])
      setHistoryEvents([])
      setLiveRows([])
      return
    }
    setSelectedId(sid)
    setLiveRows([])
    setHistoryLoading(true)
    api.getSessionEvents(sid)
      .then(evs => {
        setHistoryEvents(evs)
        setHistoryRows(evs.map(dbEventToRow))
        setHistoryLoading(false)
      })
      .catch(() => setHistoryLoading(false))
  }

  const handleDeselect = () => {
    setSelectedId(null)
    setHistoryRows([])
    setHistoryEvents([])
    setLiveRows([])
  }

  // Merge: history + live (deduped)
  const displayRows = useMemo(() => {
    if (!selectedId) return []
    const seen = new Set(historyRows.map(r => `${r.ts}|${r.tool}|${r.eventType}`))
    const newLive = liveRows.filter(r => !seen.has(`${r.ts}|${r.tool}|${r.eventType}`))
    return [...historyRows, ...newLive]
  }, [selectedId, liveRows, historyRows])

  // Calendar date filter
  const handleCalendarDate = (dateKey: string | null) => {
    setCalendarDate(dateKey)
    setSelectedId(null)
    setHistoryRows([])
    setHistoryEvents([])
    setLiveRows([])
  }

  // Filter sessions by calendar date when in calendar mode
  const displaySessions = useMemo(() => {
    if (view !== 'calendar' || !calendarDate) return sessions
    return sessions.filter(s => {
      const d = parseTs(s.started_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return key === calendarDate
    })
  }, [sessions, view, calendarDate])

  return (
    <div className={styles.root}>
      {/* ── Left panel: session list (inline) ── */}
      <div className={styles.listPanel}>
        <div className={styles.listHeader}>
          <span className={styles.listTitle}>{t('admin.sessions.list')}</span>
        </div>

        <div className={styles.listBody}>
          {sessionsLoading ? (
            <div className={styles.loadingCenter} style={{ minHeight: 80 }}>
              <span>...</span>
            </div>
          ) : displaySessions.length === 0 ? (
            <div className={styles.emptyCenter} style={{ minHeight: 120, padding: '0 12px', textAlign: 'center' }}>
              <span style={{ fontSize: 24 }}>{'\u2317'}</span>
              <span style={{ fontSize: 11 }}>{t('admin.sessions.no_sessions')}</span>
            </div>
          ) : (
            displaySessions.map(s => (
              <button
                key={s.session_id}
                className={selectedId === s.session_id ? styles.sessionBtnActive : styles.sessionBtn}
                onClick={() => handleSelectSession(s.session_id)}
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

      {/* ── Right panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Title bar + view toggle */}
        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            <span className={styles.listTitle}>{t('admin.sessions.title')}</span>
          </div>
          <div className={styles.viewTabs}>
            <button
              className={view === 'messages' ? styles.viewTabActive : styles.viewTab}
              onClick={() => setView('messages')}
            >
              {t('admin.sessions.view_messages')}
            </button>
            <button
              className={view === 'calendar' ? styles.viewTabActive : styles.viewTab}
              onClick={() => setView('calendar')}
            >
              {t('admin.sessions.view_calendar')}
            </button>
          </div>
        </div>

        {view === 'calendar' ? (
          <SessionCalendar
            sessions={sessions}
            selectedDate={calendarDate}
            onSelectDate={handleCalendarDate}
          />
        ) : (
          /* Messages view */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Toolbar: session pill + WS status + filter */}
            <div className={styles.toolbar}>
              <div className={styles.toolbarLeft}>
                {selectedId ? (
                  <>
                    <button className={styles.toolbarSessionBtn} onClick={handleDeselect}>
                      <span style={{ color: 'var(--tc-border-active)' }}>{selectedId.slice(0, 8)}</span>
                      <span style={{ color: 'var(--tc-foreground-secondary)' }}>{'\u2715'}</span>
                    </button>
                    {/* WS status dot */}
                    <div className={styles.toolbarWsGroup}>
                      <span
                        className={styles.toolbarWsDot}
                        data-status={sessionWsStatus}
                      />
                      <span className={styles.toolbarWsLabel}>
                        {sessionWsStatus === 'connected' ? 'live'
                          : sessionWsStatus === 'connecting' ? '...'
                          : 'off'}
                      </span>
                    </div>
                  </>
                ) : (
                  <span className={styles.toolbarLabel}>
                    {t('admin.sessions.list')}
                  </span>
                )}
              </div>
              <input
                className={styles.toolbarFilter}
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder={t('admin.sessions.search_placeholder')}
              />
            </div>

            {/* Content: chat bubbles */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {historyLoading ? (
                <div className={styles.loadingCenter}>
                  <span>loading...</span>
                </div>
              ) : (
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <ChatBubbles
                    rows={displayRows}
                    filter={filter}
                    events={historyEvents}
                    emptyHint={
                      selectedId ? (
                        <>
                          <span style={{ fontSize: 24 }}>{'\u2317'}</span>
                          <p style={{ fontSize: 12 }}>{t('admin.sessions.no_events')}</p>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: 24 }}>{'\u2317'}</span>
                          <p style={{ fontSize: 12 }}>{t('admin.sessions.select_session')}</p>
                          <p style={{ fontSize: 11 }}>{t('admin.sessions.select_session_hint')}</p>
                        </>
                      )
                    }
                  />
                </div>
              )}
            </div>

            {/* Status bar */}
            <div className={styles.statusBar}>
              <span>{displayRows.length} {t('admin.sessions.events')}</span>
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
        )}
      </div>
    </div>
  )
}
