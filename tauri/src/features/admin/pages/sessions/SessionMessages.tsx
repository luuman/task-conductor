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
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch {
    return ''
  }
}

function formatTimeFull(iso: string): string {
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

function getDateLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString()
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

// ── Date divider ──

function DateDivider({ label }: { label: string }) {
  return (
    <div className={styles.dateDivider}>
      <div className={styles.dateDividerLine} />
      <span className={styles.dateDividerLabel}>{label}</span>
      <div className={styles.dateDividerLine} />
    </div>
  )
}

// ── System event (center pill) ──

function SystemEvent({ event }: { event: SessionEvent }) {
  const icon = getToolIcon(event.event_type)
  const toolName = event.tool_name || event.event_type
  return (
    <div className={styles.dateDivider}>
      <div className={styles.dateDividerLine} />
      <span className={styles.dateDividerLabel}>
        {icon} {toolName} &middot; {formatTimeFull(event.created_at)}
      </span>
      <div className={styles.dateDividerLine} />
    </div>
  )
}

// ── Message bubble group ──

interface BubbleGroupProps {
  events: SessionEvent[]
  side: 'left' | 'right'
  senderName: string
  avatarClass: string
  avatarContent: string
  bubbleClass: string
}

function BubbleGroup({ events, side, senderName, avatarClass, avatarContent, bubbleClass }: BubbleGroupProps) {
  const rowClass = side === 'right' ? styles.msgRowRight : styles.msgRowLeft
  const first = events[0]

  return (
    <div className={rowClass}>
      <div className={`${styles.avatar} ${avatarClass}`}>{avatarContent}</div>
      <div className={styles.msgContent}>
        <div className={side === 'right' ? styles.senderNameRight : styles.senderName}>
          {senderName}
          <span className={styles.senderTime}>{formatTime(first.created_at)}</span>
        </div>
        {events.map(event => {
          const icon = getToolIcon(event.event_type)
          const toolName = event.tool_name || event.event_type
          const isNotification = event.event_type === 'Notification'
          const isResult = event.event_type === 'PostToolUse'
          const detail = isNotification
            ? String((event.extra as Record<string, unknown>)?.message || '').slice(0, 160)
            : getToolDetail(event.tool_name, event.tool_input)

          return (
            <div key={event.id} className={bubbleClass}>
              <div className={styles.toolLabel}>
                <span className={styles.toolLabelIcon}>{icon}</span>
                <span className={styles.toolLabelName}>{toolName}</span>
              </div>
              {detail && <div className={styles.bubbleDetail}>{detail}</div>}
              {isResult && <CollapsibleResult result={event.tool_result} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Group events into renderable sections ──

interface Section {
  type: 'date'
  label: string
}
interface SystemSection {
  type: 'system'
  event: SessionEvent
}
interface BubbleSection {
  type: 'bubble'
  side: 'left' | 'right'
  senderName: string
  avatarClass: string
  avatarContent: string
  bubbleClass: string
  events: SessionEvent[]
}

type RenderSection = Section | SystemSection | BubbleSection

function classifyEvent(ev: SessionEvent): { side: 'left' | 'right'; senderName: string; avatarClass: string; avatarContent: string; bubbleClass: string } {
  if (ev.event_type === 'PreToolUse') {
    return {
      side: 'right',
      senderName: 'Claude',
      avatarClass: styles.avatarClaude,
      avatarContent: 'C',
      bubbleClass: styles.msgBubbleRight,
    }
  }
  if (ev.event_type === 'Notification') {
    return {
      side: 'left',
      senderName: 'Notification',
      avatarClass: styles.avatarNotify,
      avatarContent: '\u{1F514}',
      bubbleClass: styles.msgBubbleLeft,
    }
  }
  // PostToolUse and others → left
  return {
    side: 'left',
    senderName: ev.tool_name || ev.event_type,
    avatarClass: styles.avatarTool,
    avatarContent: ev.tool_name ? ev.tool_name.charAt(0) : '\u{1F527}',
    bubbleClass: styles.msgBubbleLeft,
  }
}

function buildSections(events: SessionEvent[]): RenderSection[] {
  const sections: RenderSection[] = []
  let lastDate = ''
  let currentGroup: BubbleSection | null = null

  const flushGroup = () => {
    if (currentGroup) {
      sections.push(currentGroup)
      currentGroup = null
    }
  }

  for (const ev of events) {
    // Date divider check
    const dateLabel = getDateLabel(ev.created_at)
    if (dateLabel !== lastDate) {
      flushGroup()
      sections.push({ type: 'date', label: dateLabel })
      lastDate = dateLabel
    }

    // System events → center divider
    if (SYSTEM_EVENTS.has(ev.event_type)) {
      flushGroup()
      sections.push({ type: 'system', event: ev })
      continue
    }

    // Classify this event
    const cls = classifyEvent(ev)

    // If same sender/side as current group, append
    if (currentGroup && currentGroup.side === cls.side && currentGroup.senderName === cls.senderName) {
      currentGroup.events.push(ev)
    } else {
      flushGroup()
      currentGroup = {
        type: 'bubble',
        ...cls,
        events: [ev],
      }
    }
  }
  flushGroup()
  return sections
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

  const headerTitle = session.note?.alias || session.summary || cwdName(session.cwd) || session.provider
  const headerMeta = [
    cwdName(session.cwd),
    `${session.event_count} ${t('admin.sessions.events')}`,
    formatTime(session.started_at),
  ].filter(Boolean).join(' \u00B7 ')

  const sections = buildSections(events)

  return (
    <div className={styles.messagePanel}>
      {/* Header */}
      <div className={styles.messageHeader}>
        <div className={styles.messageHeaderLeft}>
          <span className={styles.messageHeaderAvatar}>{'\u{1F916}'}</span>
          <div className={styles.messageHeaderInfo}>
            <span className={styles.messageHeaderTitle}>{headerTitle}</span>
            <span className={styles.messageHeaderMeta}>{headerMeta}</span>
          </div>
        </div>
        <button
          className={styles.messageHeaderBack}
          onClick={onDeselect}
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
          {sections.map((section, i) => {
            if (section.type === 'date') {
              return <DateDivider key={`date-${i}`} label={section.label} />
            }
            if (section.type === 'system') {
              return <SystemEvent key={`sys-${section.event.id}`} event={section.event} />
            }
            return (
              <BubbleGroup
                key={`grp-${section.events[0].id}`}
                events={section.events}
                side={section.side}
                senderName={section.senderName}
                avatarClass={section.avatarClass}
                avatarContent={section.avatarContent}
                bubbleClass={section.bubbleClass}
              />
            )
          })}
          <div ref={bottomRef} />
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
