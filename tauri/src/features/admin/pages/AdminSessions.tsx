// AdminSessions.tsx — 1:1 copy of frontend Sessions.tsx (Tailwind → CSS Modules)
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../../lib/api'
import type { AiSession, SessionEvent } from '../../../lib/api/types'
import styles from './sessions/sessions.module.css'

// ── Timestamp parsing (append Z if missing) ─────────────────

function safeDate(iso: string): Date {
  if (!iso) return new Date()
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z')
}

// ── Tool detail formatter ───────────────────────────────────

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

// ── EventRow type ───────────────────────────────────────────

interface EventRow {
  id: string
  ts: string
  icon: string
  iconColor: string   // CSS color value (e.g. '#79c0ff')
  eventType: string
  tool: string
  detail: string
  sessionId: string
}

// ── Event style (returns CSS color values) ──────────────────

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
  const ts = safeDate(e.created_at).toLocaleTimeString(undefined, { hour12: false })
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
    ? safeDate(rawTs).toLocaleTimeString(undefined, { hour12: false })
    : new Date().toLocaleTimeString(undefined, { hour12: false })

  const { icon, iconColor } = applyEventStyle(eventType)
  let displayTool = toolName || eventType
  let detail = getToolDetail(toolName, toolInput ?? undefined)

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

function StatusBadge({ status }: { status: AiSession['status'] }) {
  const { t } = useTranslation()
  const color = status === 'active' ? '#56d364'
    : status === 'idle' ? '#e3b341'
    : '#8b949e'
  const bg = status === 'active' ? 'rgba(86,211,100,0.15)'
    : status === 'idle' ? 'rgba(229,161,0,0.15)'
    : 'rgba(128,128,128,0.15)'

  return (
    <span className={styles.statusBadge} style={{ background: bg, color }}>
      {status === 'active' ? t('admin.sessions.statusBadge.running') : status === 'idle' ? t('admin.sessions.statusBadge.idle') : t('admin.sessions.statusBadge.stopped')}
    </span>
  )
}

// ── System event types ──────────────────────────────────────

const SYSTEM_EVENTS = new Set([
  'SessionStart', 'SessionEnd', 'Stop', 'Notification',
  'SubagentStart', 'SubagentStop',
])

// ── Chat bubbles ────────────────────────────────────────────

function ChatBubbles({ rows, filter, emptyHint }: {
  rows: EventRow[]
  filter: string
  emptyHint: React.ReactNode
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

  return (
    <div className={styles.messageBody}>
      {filtered.map((line) => {
        const isSystem = SYSTEM_EVENTS.has(line.eventType)
        const isOutgoing = line.eventType === 'PreToolUse'

        // System events → centered pill
        if (isSystem) {
          return (
            <div key={line.id} className={styles.bubbleCenter}>
              <div className={styles.systemPill}>
                <span style={{ color: line.iconColor }}>{line.icon}</span>
                <span>{line.tool}</span>
                {line.detail && <span className={styles.systemDetailDim}>{'\u00B7'} {line.detail}</span>}
                <span className={styles.systemTs}>{line.ts}</span>
              </div>
            </div>
          )
        }

        // PreToolUse → left, PostToolUse → right
        return (
          <div key={line.id}
               className={isOutgoing ? styles.bubbleLeft : styles.bubbleRight}>
            <div className={isOutgoing ? styles.bubbleCardOutgoing : styles.bubbleCardIncoming}>
              {/* Header: tool name + timestamp */}
              <div className={styles.bubbleHeader}>
                <span className={isOutgoing ? styles.bubbleToolNameBlue : styles.bubbleToolNameGreen}>
                  <span style={{ color: line.iconColor, marginRight: 4 }}>{line.icon}</span>
                  {line.tool}
                </span>
                <span className={styles.bubbleTs}>
                  {line.ts}
                </span>
              </div>
              {/* Detail text */}
              {line.detail && (
                <p className={styles.bubbleDetail} title={line.detail}>
                  {line.detail}
                </p>
              )}
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}

// ── Per-session WebSocket hook ───────────────────────────────

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

// ── Main page component ─────────────────────────────────────

export default function AdminSessions() {
  const { t } = useTranslation()

  // Session list
  const [sessions, setSessions] = useState<AiSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // History events (loaded from DB when session selected)
  const [historyRows, setHistoryRows] = useState<EventRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Live events (from per-session WebSocket)
  const [liveRows, setLiveRows] = useState<EventRow[]>([])

  // Filter
  const [filter, setFilter] = useState('')

  // WS event callback
  const handleWsEvent = useCallback((row: EventRow) => {
    setLiveRows(prev => [...prev, row].slice(-500))
  }, [])

  const sessionWsStatus = useSessionWs(selectedId, handleWsEvent)

  // Load session list (on mount + 5s auto-refresh)
  const loadSessions = () => {
    api.getSessions()
      .then(s => { setSessions(s); setSessionsLoading(false) })
      .catch(() => setSessionsLoading(false))
  }

  useEffect(() => {
    loadSessions()
    const id = setInterval(loadSessions, 5000)
    return () => clearInterval(id)
  }, [])

  // Select / deselect session
  const handleSelectSession = (sid: string) => {
    if (selectedId === sid) {
      setSelectedId(null)
      setHistoryRows([])
      setLiveRows([])
      return
    }
    setSelectedId(sid)
    setLiveRows([])
    setHistoryLoading(true)
    api.getSessionEvents(sid)
      .then(evs => {
        setHistoryRows(evs.map(dbEventToRow))
        setHistoryLoading(false)
      })
      .catch(() => setHistoryLoading(false))
  }

  // Merge: history + live (deduped)
  const displayRows = useMemo(() => {
    if (!selectedId) return []
    const seen = new Set(historyRows.map(r => `${r.ts}|${r.tool}|${r.eventType}`))
    const newLive = liveRows.filter(r => !seen.has(`${r.ts}|${r.tool}|${r.eventType}`))
    return [...historyRows, ...newLive]
  }, [selectedId, liveRows, historyRows])

  // cwd → last 2 segments
  const cwd = (path: string) => {
    const parts = path.replace(/\\/g, '/').split('/')
    return parts.slice(-2).join('/') || path
  }

  return (
    <div className={styles.root}>

      {/* ── Left: session list ── */}
      <div className={styles.listPanel}>
        {/* Header */}
        <div className={styles.listHeader}>
          <span className={styles.listTitle}>{t('admin.sessions.list')}</span>
        </div>

        {/* List */}
        <div className={styles.listBody}>
          {sessionsLoading ? (
            <div className={styles.listLoadingCenter}>
              {t('admin.sessions.loading')}
            </div>
          ) : sessions.length === 0 ? (
            <div className={styles.listEmptyCenter}>
              <span className={styles.listEmptyIcon}>{'\u2317'}</span>
              <p className={styles.listEmptyText}>{t('admin.sessions.no_sessions')}</p>
              <p className={styles.listEmptyHint}>{t('admin.sessions.autoAppearHint')}</p>
            </div>
          ) : (
            sessions.map(s => (
              <button
                key={s.session_id}
                onClick={() => handleSelectSession(s.session_id)}
                className={selectedId === s.session_id ? styles.sessionBtnActive : styles.sessionBtn}
              >
                <div className={styles.sessionRow1}>
                  <span className={styles.sessionIdMono}>
                    {s.session_id.slice(0, 8)}
                  </span>
                  <StatusBadge status={s.status} />
                </div>
                <p className={styles.sessionCwd} title={s.cwd}>
                  {cwd(s.cwd || '') || '\u2014'}
                </p>
                <p className={styles.sessionCount}>
                  {s.event_count} {t('admin.sessions.events')}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Right: session event stream ── */}
      <div className={styles.rightPanel}>
        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            {selectedId ? (
              <>
                <button
                  onClick={() => { setSelectedId(null); setHistoryRows([]); setLiveRows([]) }}
                  className={styles.toolbarSessionBtn}
                >
                  <span style={{ color: 'var(--tc-border-active)' }}>{selectedId.slice(0, 8)}</span>
                  <span style={{ color: 'var(--tc-foreground-secondary)' }}>{'\u2715'}</span>
                </button>
                {/* WS status */}
                <div className={styles.toolbarWsGroup}>
                  <span className={
                    sessionWsStatus === 'connected' ? styles.toolbarWsDotConnected
                    : sessionWsStatus === 'connecting' ? styles.toolbarWsDotConnecting
                    : styles.toolbarWsDotDisconnected
                  } />
                  <span className={styles.toolbarWsLabel}>
                    {sessionWsStatus === 'connected' ? t('admin.sessions.realtime') : sessionWsStatus === 'connecting' ? t('admin.sessions.connecting') : t('admin.sessions.disconnected')}
                  </span>
                </div>
              </>
            ) : (
              <span className={styles.toolbarLabel}>
                {t('admin.sessions.allSessions')}
              </span>
            )}
          </div>

          <div className={styles.toolbarRight}>
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder={t('admin.sessions.filter')}
              className={styles.toolbarFilter}
            />
          </div>
        </div>

        {/* Content: chat bubbles */}
        <div className={styles.contentArea}>
          {historyLoading ? (
            <div className={styles.loadingCenter}>
              {t('admin.sessions.loadingHistory')}
            </div>
          ) : (
            <ChatBubbles
              rows={displayRows}
              filter={filter}
              emptyHint={
                selectedId ? (
                  <>
                    <span style={{ fontSize: 24 }}>{'\u2317'}</span>
                    <p style={{ fontSize: 12 }}>{t('admin.sessions.waitingEvents')}</p>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 24 }}>{'\u2317'}</span>
                    <p style={{ fontSize: 12 }}>{t('admin.sessions.selectSession')}</p>
                  </>
                )
              }
            />
          )}
        </div>

        {/* Status bar */}
        <div className={styles.statusBar}>
          <span>{t('admin.sessions.realtimeCount', { count: displayRows.length })}</span>
          {filter && (
            <button
              className={styles.statusBarClearBtn}
              onClick={() => setFilter('')}
            >
              {t('admin.sessions.clearFilter')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
