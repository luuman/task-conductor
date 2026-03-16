// AdminSessions.tsx — 3-column layout: session list, transcript viewer, question navigation
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../../lib/api'
import type { AiSession, TranscriptMessage, TranscriptBlock } from '../../../lib/api/types'
import styles from './sessions/sessions.module.css'

// ── Timestamp parsing (append Z if missing) ─────────────────

function safeDate(iso: string): Date {
  if (!iso) return new Date()
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z')
}

// ── Relative time ───────────────────────────────────────────

function relativeTime(iso: string): string {
  const d = safeDate(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '\u521A\u521A' // 刚刚
  if (mins < 60) return `${mins}\u5206\u949F\u524D`
  const hours = Math.floor(mins / 60)
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString())
    return `\u6628\u5929 ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}`
  if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)}\u5929\u524D`
  return `${d.getMonth() + 1}\u6708${d.getDate()}\u65E5`
}

// ── Group sessions by project (cwd) ────────────────────────

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
    sessions: items.sort(
      (a, b) =>
        safeDate(b.last_seen_at || b.started_at).getTime() -
        safeDate(a.last_seen_at || a.started_at).getTime()
    ),
    activeCount: items.filter(s => s.status === 'active').length,
  })).sort((a, b) => {
    if (a.activeCount > 0 && b.activeCount === 0) return -1
    if (b.activeCount > 0 && a.activeCount === 0) return 1
    return b.sessions[0]
      ? safeDate(b.sessions[0].last_seen_at || b.sessions[0].started_at).getTime() -
        safeDate(a.sessions[0].last_seen_at || a.sessions[0].started_at).getTime()
      : 0
  })
}

// ── Tool emoji mapping ──────────────────────────────────────

function getToolEmoji(toolName: string): string {
  const map: Record<string, string> = {
    Bash: '\uD83D\uDCBB',
    Read: '\uD83D\uDCC4',
    Write: '\u270F\uFE0F',
    Edit: '\uD83D\uDD27',
    MultiEdit: '\uD83D\uDD27',
    Grep: '\uD83D\uDD0D',
    Glob: '\uD83D\uDCC1',
    WebSearch: '\uD83C\uDF10',
    WebFetch: '\uD83C\uDF10',
    Agent: '\uD83E\uDD16',
    AskUserQuestion: '\u2753',
  }
  return map[toolName] || '\uD83D\uDCBB'
}

// ── Tool parameter summary ──────────────────────────────────

function getToolParam(block: TranscriptBlock): string {
  const input = block.tool_input
  const name = block.tool_name
  if (!name || !input) return ''
  switch (name) {
    case 'Bash':
      return String(input.command || '').slice(0, 120)
    case 'Read': case 'Write': case 'Edit': case 'MultiEdit':
      return String(input.file_path || '').split('/').pop() || ''
    case 'Glob':
      return String(input.pattern || '')
    case 'Grep':
      return `"${input.pattern || ''}"${input.path ? ' in ' + String(input.path).split('/').pop() : ''}`
    case 'WebSearch':
      return String(input.query || '').slice(0, 80)
    case 'WebFetch':
      return String(input.url || '').slice(0, 80)
    case 'Agent':
      return String(input.description || input.prompt || '').slice(0, 80)
    case 'AskUserQuestion':
      return String(input.question || '').slice(0, 80)
    default:
      return ''
  }
}

// ── Status dot ──────────────────────────────────────────────

function StatusDot({ status }: { status: AiSession['status'] }) {
  const cls =
    status === 'active' ? styles.statusDotActive
    : status === 'idle' ? styles.statusDotIdle
    : styles.statusDotStopped
  return <span className={cls} />
}

// ── Tool widget (collapsible) ───────────────────────────────

function ToolWidget({ block }: { block: TranscriptBlock }) {
  const [expanded, setExpanded] = useState(false)
  const toolName = block.tool_name || 'Tool'
  const param = getToolParam(block)
  const hasContent = block.tool_input != null || (block.tool_result != null && block.tool_result !== '')

  return (
    <div className={styles.toolWidget}>
      <button
        className={styles.toolHeader}
        onClick={() => hasContent && setExpanded(!expanded)}
      >
        <span className={styles.toolIcon}>{getToolEmoji(toolName)}</span>
        <span className={styles.toolName}>{toolName}</span>
        {param && <span className={styles.toolParam}>{param}</span>}
        {block.tool_error && <span className={styles.toolError}>{'\u2717'}</span>}
        {hasContent && (
          <span className={styles.toolChevron}>{expanded ? '\u25BE' : '\u25B8'}</span>
        )}
      </button>
      {expanded && (
        <div className={styles.toolBody}>
          {block.tool_input && (
            <pre className={styles.toolCode}>
              {JSON.stringify(block.tool_input, null, 2)}
            </pre>
          )}
          {block.tool_result != null && block.tool_result !== '' && (
            <pre className={styles.toolResult}>
              {block.tool_result}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// ── User message card ───────────────────────────────────────

function UserCard({ msg }: { msg: TranscriptMessage }) {
  const text = msg.blocks
    .filter(b => b.type === 'text')
    .map(b => b.text || '')
    .join('\n')
    .trim()
  if (!text) return null

  return (
    <div className={styles.msgRowRight}>
      <div className={styles.userBubble}>
        <div className={styles.userText}>{text}</div>
      </div>
      <div className={styles.avatarUser}>{'\uD83D\uDC64'}</div>
    </div>
  )
}

// ── Assistant message card ──────────────────────────────────

function AssistantCard({ msg }: { msg: TranscriptMessage }) {
  return (
    <div className={styles.msgRowLeft}>
      <div className={styles.avatarBot}>{'\uD83E\uDD16'}</div>
      <div className={styles.assistantBubble}>
        {msg.blocks.map((block, i) =>
          block.type === 'text' ? (
            <div key={i} className={styles.assistantText}>
              {block.text || ''}
            </div>
          ) : (
            <ToolWidget key={i} block={block} />
          )
        )}
      </div>
    </div>
  )
}

// ── Session list group (collapsible) ────────────────────────

function SessionGroup({
  group,
  selectedId,
  onSelect,
  defaultOpen,
}: {
  group: ProjectGroup
  selectedId: string | null
  onSelect: (s: AiSession) => void
  defaultOpen: boolean
}) {
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
        const time = relativeTime(s.last_seen_at || s.started_at)

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
              <span className={styles.sessionEvents}>{s.event_count} \u4E2A\u4E8B\u4EF6</span>
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

// ── Main page component ─────────────────────────────────────

export default function AdminSessions() {
  const { t } = useTranslation()

  // Session list
  const [sessions, setSessions] = useState<AiSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Transcript
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [fileFound, setFileFound] = useState(true)
  const transcriptCache = useRef<Map<string, { messages: TranscriptMessage[]; file_found: boolean }>>(new Map())
  const transcriptRef = useRef<HTMLDivElement>(null)

  // Question navigation
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(-1)
  const [autoExpand, setAutoExpand] = useState(true)

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

  // Select session -> load transcript
  const handleSelect = useCallback((s: AiSession) => {
    setSelectedId(s.session_id)
    setActiveQuestionIdx(-1)

    const cached = transcriptCache.current.get(s.session_id)
    if (cached) {
      setTranscript(cached.messages)
      setFileFound(cached.file_found)
      setTranscriptLoading(false)
      return
    }

    setTranscriptLoading(true)
    api.getTranscript(s.session_id)
      .then(r => {
        transcriptCache.current.set(s.session_id, { messages: r.messages, file_found: r.file_found })
        setTranscript(r.messages)
        setFileFound(r.file_found)
        setTranscriptLoading(false)
      })
      .catch(() => {
        setTranscript([])
        setFileFound(false)
        setTranscriptLoading(false)
      })
  }, [])

  // Clear selection
  const handleClearSelection = useCallback(() => {
    setSelectedId(null)
    setTranscript([])
    setFileFound(true)
    setActiveQuestionIdx(-1)
  }, [])

  // Auto-refresh transcript for active sessions
  const selectedSession = useMemo(() => sessions.find(s => s.session_id === selectedId), [sessions, selectedId])

  useEffect(() => {
    if (!selectedSession || selectedSession.status !== 'active') return
    const sid = selectedSession.session_id
    const poll = () => {
      api.getTranscript(sid)
        .then(r => {
          transcriptCache.current.set(sid, { messages: r.messages, file_found: r.file_found })
          setTranscript(r.messages)
          setFileFound(r.file_found)
        })
        .catch(() => {})
    }
    const id = setInterval(poll, 3000)
    return () => clearInterval(id)
  }, [selectedSession])

  // Scroll to bottom on transcript load
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  // Filtered sessions
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

  // Grouped sessions
  const groups = useMemo(() => groupByProject(filtered), [filtered])

  // Selected session's cwd for default-open logic
  const selectedCwd = selectedId
    ? sessions.find(s => s.session_id === selectedId)?.cwd
    : null

  // Extract user questions from transcript
  const questions = useMemo(() => {
    return transcript
      .map((msg, i) => ({ msg, i }))
      .filter(({ msg }) => msg.role === 'user')
      .map(({ msg, i }) => ({
        text: msg.blocks
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join(' ')
          .trim()
          .slice(0, 200),
        msgIndex: i,
      }))
      .filter(q => q.text)
  }, [transcript])

  // Jump to question
  const jumpToQuestion = useCallback((qIdx: number, msgIndex: number) => {
    setActiveQuestionIdx(qIdx)
    const container = transcriptRef.current
    if (!container) return
    const cards = container.querySelectorAll('[data-msg-index]')
    for (const card of cards) {
      if ((card as HTMLElement).dataset.msgIndex === String(msgIndex)) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }
  }, [])

  const hasQuestions = questions.length > 0 && !transcriptLoading && fileFound && selectedId != null

  return (
    <div className={styles.root}>

      {/* ── Left: session list ── */}
      <div className={styles.leftPanel}>
        {/* New chat button */}
        <div className={styles.leftHeader}>
          <span className={styles.leftTitle}>{t('admin.sessions.title')}</span>
          <button className={styles.newChatBtn} onClick={handleClearSelection}>
            + {'\u65B0\u5BF9\u8BDD'}
          </button>
        </div>

        {/* Search */}
        <div className={styles.searchWrap}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('admin.sessions.search_placeholder')}
            className={styles.searchInput}
          />
        </div>

        {/* Session groups */}
        <div className={styles.leftBody}>
          {sessionsLoading ? (
            <div className={styles.listLoadingCenter}>
              {t('common.loading')}
            </div>
          ) : groups.length === 0 ? (
            <div className={styles.listEmptyCenter}>
              <span className={styles.listEmptyIcon}>{'\u2317'}</span>
              <p className={styles.listEmptyText}>
                {search ? '\u65E0\u5339\u914D\u7ED3\u679C' : t('admin.sessions.no_sessions')}
              </p>
            </div>
          ) : (
            groups.map(g => (
              <SessionGroup
                key={g.cwd}
                group={g}
                selectedId={selectedId}
                onSelect={handleSelect}
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

      {/* ── Center: transcript ── */}
      <div className={styles.centerPanel}>
        {!selectedId ? (
          <div className={styles.emptyCenter}>
            <span style={{ fontSize: 28 }}>{'\u2317'}</span>
            <p style={{ fontSize: 12 }}>{t('admin.sessions.select_session')}</p>
            <p style={{ fontSize: 10, opacity: 0.6 }}>{t('admin.sessions.select_session_hint')}</p>
          </div>
        ) : transcriptLoading ? (
          <div className={styles.loadingCenter}>
            {t('common.loading')}
          </div>
        ) : !fileFound ? (
          <div className={styles.emptyCenter}>
            <span style={{ fontSize: 28 }}>{'\uD83D\uDCC2'}</span>
            <p style={{ fontSize: 12 }}>{'\u5BF9\u8BDD\u8BB0\u5F55\u6587\u4EF6\u672A\u627E\u5230'}</p>
          </div>
        ) : transcript.length === 0 ? (
          <div className={styles.emptyCenter}>
            <span style={{ fontSize: 28 }}>{'\uD83D\uDCAC'}</span>
            <p style={{ fontSize: 12 }}>{t('admin.sessions.no_events')}</p>
          </div>
        ) : (
          <div ref={transcriptRef} className={styles.transcriptScroll}>
            <div className={styles.transcriptBody}>
              {transcript.map((msg, i) => (
                <div key={i} data-msg-index={i}>
                  {msg.role === 'user' ? (
                    <UserCard msg={msg} />
                  ) : (
                    <AssistantCard msg={msg} />
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </div>
        )}
      </div>

      {/* ── Right: question navigation ── */}
      {hasQuestions && (
        <div className={styles.rightPanel}>
          <div className={styles.rightHeader}>
            <span className={styles.rightTitle}>{'\u95EE\u9898\u5BFC\u822A'}</span>
            <span className={styles.expandToggleWrap}>
              <span className={styles.expandLabel}>
                {autoExpand ? '\u5C55\u5F00' : '\u6298\u53E0'}
              </span>
              <button
                className={styles.expandToggle}
                style={{ background: autoExpand ? 'var(--tc-border-active)' : 'var(--tc-panel-bg)' }}
                onClick={() => setAutoExpand(v => !v)}
              >
                <span
                  className={styles.expandDot}
                  style={{ left: autoExpand ? 'calc(100% - 12px)' : '2px' }}
                />
              </button>
            </span>
          </div>
          <div className={styles.rightBody}>
            {questions.map((q, i) => (
              <button
                key={i}
                onClick={() => jumpToQuestion(i, q.msgIndex)}
                className={activeQuestionIdx === i ? styles.questionItemActive : styles.questionItem}
              >
                <span className={styles.questionNum}>{i + 1}</span>
                <span className={styles.questionText}>{q.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
