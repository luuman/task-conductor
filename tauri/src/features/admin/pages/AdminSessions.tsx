// AdminSessions.tsx — 3-column layout: session list, transcript viewer, question navigation
import { useCallback, useEffect, useMemo, useRef, useState, createContext, useContext, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import hljs from 'highlight.js/lib/core'
import '../../../styles/hljs-ayu-dark.css'
import {
  IconTerminal, IconFileText, IconPencil, IconWrench, IconSearch,
  IconFolderOpen, IconGlobe, IconBot, IconCircleHelp, IconChevronDown,
  IconChevronRight, IconUser,
} from '../../../ui/icon'
import typescript from 'highlight.js/lib/languages/typescript'
import javascript from 'highlight.js/lib/languages/javascript'
import python from 'highlight.js/lib/languages/python'
import bashLang from 'highlight.js/lib/languages/bash'
import jsonLang from 'highlight.js/lib/languages/json'
import cssLang from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import sql from 'highlight.js/lib/languages/sql'
import yaml from 'highlight.js/lib/languages/yaml'
import markdownLang from 'highlight.js/lib/languages/markdown'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import javaLang from 'highlight.js/lib/languages/java'
import cpp from 'highlight.js/lib/languages/cpp'

hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('bash', bashLang)
hljs.registerLanguage('json', jsonLang)
hljs.registerLanguage('css', cssLang)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('markdown', markdownLang)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('java', javaLang)
hljs.registerLanguage('cpp', cpp)

import { api } from '../../../lib/api'
import { wsManager } from '../../../lib/ws'
import type { AiSession, TranscriptMessage, TranscriptBlock } from '../../../lib/api/types'
import styles from './sessions/sessions.module.css'

// ── Context ─────────────────────────────────────────────────
// signal > 0 = expand all (increments), signal < 0 = collapse all (decrements)
const ExpandSignalCtx = createContext(0)
const AutoExpandCtx = createContext(false)

// ── Timestamp parsing (append Z if missing) ─────────────────

function safeDate(iso: string): Date {
  if (!iso) return new Date()
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z')
}

// ── Relative time ───────────────────────────────────────────

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
    return `${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}`
  if (diff < 7 * 86400000) return t('time.days_ago', { n: Math.floor(diff / 86400000) })
  return `${d.getMonth() + 1}/${d.getDate()}`
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
    sessions: items.sort((a, b) => {
      // active sessions first
      const aActive = a.status === 'active' ? 1 : 0
      const bActive = b.status === 'active' ? 1 : 0
      if (bActive !== aActive) return bActive - aActive
      // then by event_count descending (more active = more events)
      if (b.event_count !== a.event_count) return b.event_count - a.event_count
      // then by last_seen_at descending
      return safeDate(b.last_seen_at || b.started_at).getTime() -
        safeDate(a.last_seen_at || a.started_at).getTime()
    }),
    activeCount: items.filter(s => s.status === 'active').length,
  })).sort((a, b) => {
    // groups with active sessions first
    if (a.activeCount > 0 && b.activeCount === 0) return -1
    if (b.activeCount > 0 && a.activeCount === 0) return 1
    // then by total event count descending
    const aTotal = a.sessions.reduce((sum, s) => sum + s.event_count, 0)
    const bTotal = b.sessions.reduce((sum, s) => sum + s.event_count, 0)
    if (bTotal !== aTotal) return bTotal - aTotal
    // then by most recent activity
    return b.sessions[0]
      ? safeDate(b.sessions[0].last_seen_at || b.sessions[0].started_at).getTime() -
        safeDate(a.sessions[0].last_seen_at || a.sessions[0].started_at).getTime()
      : 0
  })
}

// ── Tool SVG icon mapping ───────────────────────────────────

function getToolIcon(toolName: string, size = 13): ReactNode {
  const props = { size, color: 'currentColor' }
  switch (toolName) {
    case 'Bash': return <IconTerminal {...props} />
    case 'Read': return <IconFileText {...props} />
    case 'Write': return <IconPencil {...props} />
    case 'Edit': case 'MultiEdit': return <IconWrench {...props} />
    case 'Grep': return <IconSearch {...props} />
    case 'Glob': return <IconFolderOpen {...props} />
    case 'WebSearch': case 'WebFetch': return <IconGlobe {...props} />
    case 'Agent': return <IconBot {...props} />
    case 'AskUserQuestion': return <IconCircleHelp {...props} />
    default: return <IconTerminal {...props} />
  }
}

// ── Block grouping for smart layout ─────────────────────────

const READONLY_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch'])
const WRITE_TOOLS = new Set(['Edit', 'MultiEdit', 'Write'])

type GroupedUnit =
  | { kind: 'text'; block: TranscriptBlock }
  | { kind: 'tool'; block: TranscriptBlock }
  | { kind: 'read-group'; blocks: TranscriptBlock[] }

function groupBlocks(blocks: TranscriptBlock[]): GroupedUnit[] {
  const units: GroupedUnit[] = []
  let readBuf: TranscriptBlock[] = []

  const flushReads = () => {
    if (readBuf.length === 0) return
    if (readBuf.length === 1) {
      units.push({ kind: 'tool', block: readBuf[0] })
    } else {
      units.push({ kind: 'read-group', blocks: [...readBuf] })
    }
    readBuf = []
  }

  for (const block of blocks) {
    if (block.type === 'text') {
      flushReads()
      units.push({ kind: 'text', block })
    } else if (block.type === 'tool_use' && READONLY_TOOLS.has(block.tool_name || '')) {
      readBuf.push(block)
    } else {
      flushReads()
      units.push({ kind: 'tool', block })
    }
  }
  flushReads()
  return units
}

// ── Message-level grouping: consecutive assistant msgs → turns ──

interface AssistantTurn {
  texts: string[]
  reads: TranscriptBlock[]
  edits: TranscriptBlock[]
  bashes: TranscriptBlock[]
  others: TranscriptBlock[]
  allBlocks: TranscriptBlock[]
}

function groupMessagesIntoTurns(messages: TranscriptMessage[]): Array<{ kind: 'user'; msg: TranscriptMessage } | { kind: 'turn'; turn: AssistantTurn }> {
  const result: Array<{ kind: 'user'; msg: TranscriptMessage } | { kind: 'turn'; turn: AssistantTurn }> = []
  let currentTurn: AssistantTurn | null = null

  const flushTurn = () => {
    if (!currentTurn) return
    if (currentTurn.texts.length || currentTurn.allBlocks.length) {
      result.push({ kind: 'turn', turn: currentTurn })
    }
    currentTurn = null
  }

  const newTurn = (): AssistantTurn => ({ texts: [], reads: [], edits: [], bashes: [], others: [], allBlocks: [] })

  for (const msg of messages) {
    if (msg.role === 'user') {
      flushTurn()
      result.push({ kind: 'user', msg })
      continue
    }
    // assistant message
    const block = msg.blocks[0]
    if (!block) continue

    if (block.type === 'text' && block.text) {
      // Text creates a "segment" boundary within the turn — flush accumulated tools
      // then start fresh but keep in same logical turn group
      if (currentTurn && (currentTurn.reads.length || currentTurn.edits.length || currentTurn.bashes.length || currentTurn.others.length)) {
        flushTurn()
      }
      if (!currentTurn) currentTurn = newTurn()
      currentTurn.texts.push(block.text)
    } else if (block.type === 'tool_use') {
      if (!currentTurn) currentTurn = newTurn()
      currentTurn.allBlocks.push(block)
      const tn = block.tool_name || ''
      if (READONLY_TOOLS.has(tn)) {
        currentTurn.reads.push(block)
      } else if (WRITE_TOOLS.has(tn)) {
        currentTurn.edits.push(block)
      } else if (tn === 'Bash') {
        currentTurn.bashes.push(block)
      } else {
        currentTurn.others.push(block)
      }
    }
  }
  flushTurn()
  return result
}

// ── Tool parameter summary ──────────────────────────────────

function getToolDetail(name: string | null | undefined, input: Record<string, unknown> | null | undefined): string {
  if (!name || !input) return ''
  switch (name) {
    case 'Bash': return String(input.command || '').slice(0, 120)
    case 'Read': case 'Write': return String(input.file_path || '')
    case 'Edit': case 'MultiEdit': return String(input.file_path || '')
    case 'Glob': return String(input.pattern || '')
    case 'Grep': return `"${input.pattern || ''}"${input.path ? ' in ' + input.path : ''}`
    case 'WebSearch': return String(input.query || '').slice(0, 80)
    case 'WebFetch': return String(input.url || '').slice(0, 80)
    case 'Agent': return String(input.description || input.prompt || '').slice(0, 80)
    case 'AskUserQuestion': return String(input.question || '').slice(0, 120)
    default: return ''
  }
}

// ── Parse special XML tags in text blocks ───────────────────

interface TaskNotification {
  taskId: string
  toolUseId: string
  outputFile: string
  status: string
  summary: string
}

interface SystemReminder {
  content: string
}

type ParsedSegment =
  | { kind: 'text'; content: string }
  | { kind: 'task-notification'; data: TaskNotification }
  | { kind: 'system-reminder'; data: SystemReminder }

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)
  return re.exec(xml)?.[1]?.trim() ?? ''
}

function parseTextSegments(text: string): ParsedSegment[] {
  const segments: ParsedSegment[] = []
  // Match <task-notification>...</task-notification> and <system-reminder>...</system-reminder>
  const re = /<(task-notification|system-reminder)>([\s\S]*?)<\/\1>/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index).trim()
      if (before) segments.push({ kind: 'text', content: before })
    }
    if (match[1] === 'task-notification') {
      const xml = match[2]
      segments.push({
        kind: 'task-notification',
        data: {
          taskId: extractTag(xml, 'task-id'),
          toolUseId: extractTag(xml, 'tool-use-id'),
          outputFile: extractTag(xml, 'output-file'),
          status: extractTag(xml, 'status'),
          summary: extractTag(xml, 'summary'),
        },
      })
    } else {
      segments.push({ kind: 'system-reminder', data: { content: match[2].trim() } })
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    // Also strip trailing "Read the output file to retrieve the result: ..." line
    let rest = text.slice(lastIndex).trim()
    rest = rest.replace(/^Read the output file to retrieve the result:\s*\S+\s*/m, '').trim()
    if (rest) segments.push({ kind: 'text', content: rest })
  }
  return segments
}

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  completed: { color: '#3fb950', bg: 'rgba(63, 185, 80, 0.08)' },
  killed: { color: '#d29922', bg: 'rgba(210, 153, 34, 0.08)' },
  failed: { color: '#f85149', bg: 'rgba(248, 81, 73, 0.08)' },
  running: { color: '#58a6ff', bg: 'rgba(88, 166, 255, 0.08)' },
}

function StatusCircle({ color }: { color: string }) {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" style={{ flexShrink: 0 }}>
      <circle cx="4" cy="4" r="4" fill={color} />
    </svg>
  )
}

function TaskNotificationCard({ data }: { data: TaskNotification }) {
  const st = STATUS_STYLE[data.status] || STATUS_STYLE.completed
  return (
    <div className={styles.taskNotification} style={{ borderColor: st.color, background: st.bg }}>
      <div className={styles.taskNotifHeader}>
        <StatusCircle color={st.color} />
        <span className={styles.taskNotifTitle}>Background Task</span>
        <span className={styles.taskNotifStatus} style={{ color: st.color }}>{data.status}</span>
      </div>
      <div className={styles.taskNotifSummary}>{data.summary}</div>
      <div className={styles.taskNotifMeta}>
        <span className={styles.taskNotifLabel}>ID</span>
        <code className={styles.taskNotifCode}>{data.taskId}</code>
      </div>
      {data.outputFile && (
        <div className={styles.taskNotifMeta}>
          <span className={styles.taskNotifLabel}>Output</span>
          <code className={styles.taskNotifCode}>{data.outputFile.split('/').slice(-1)[0]}</code>
        </div>
      )}
    </div>
  )
}

function SystemReminderCard({ data }: { data: SystemReminder }) {
  return (
    <details className={styles.systemReminder}>
      <summary className={styles.systemReminderSummary}>System Reminder</summary>
      <div className={styles.systemReminderBody}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{data.content}</ReactMarkdown>
      </div>
    </details>
  )
}

function RichTextBlock({ text }: { text: string }) {
  const segments = useMemo(() => parseTextSegments(text), [text])
  if (segments.length === 1 && segments[0].kind === 'text') {
    return <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{segments[0].content}</ReactMarkdown>
  }
  return (
    <>
      {segments.map((seg, i) => {
        switch (seg.kind) {
          case 'text':
            return <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={mdComponents}>{seg.content}</ReactMarkdown>
          case 'task-notification':
            return <TaskNotificationCard key={i} data={seg.data} />
          case 'system-reminder':
            return <SystemReminderCard key={i} data={seg.data} />
        }
      })}
    </>
  )
}

// ── Copy button ─────────────────────────────────────────────

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [text])
  return (
    <button onClick={copy} className={`${styles.copyBtn} ${className ?? ''}`} title="Copy">
      {copied ? '\u2713' : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  )
}

// ── Markdown components ─────────────────────────────────────

const mdComponents: Components = {
  p: ({ children }) => <p className={styles.mdP}>{children}</p>,
  h1: ({ children }) => <h1 className={styles.mdH1}>{children}</h1>,
  h2: ({ children }) => <h2 className={styles.mdH2}>{children}</h2>,
  h3: ({ children }) => <h3 className={styles.mdH3}>{children}</h3>,
  ul: ({ children }) => <ul className={styles.mdUl}>{children}</ul>,
  ol: ({ children }) => <ol className={styles.mdOl}>{children}</ol>,
  li: ({ children }) => <li className={styles.mdLi}>{children}</li>,
  strong: ({ children }) => <strong className={styles.mdStrong}>{children}</strong>,
  em: ({ children }) => <em className={styles.mdEm}>{children}</em>,
  code: ({ children, className }) => {
    if (className?.includes('language-')) {
      const lang = className.replace('language-', '')
      const raw = String(children).replace(/\n$/, '')
      let highlighted: string | null = null
      try {
        if (hljs.getLanguage(lang)) {
          highlighted = hljs.highlight(raw, { language: lang }).value
        } else {
          highlighted = hljs.highlightAuto(raw).value
        }
      } catch { /* fallback */ }
      if (highlighted) {
        return (
          <>
            <CopyButton text={raw} className={styles.codeCopyBtn} />
            <code className={`hljs ${styles.mdCodeBlock}`}
                  dangerouslySetInnerHTML={{ __html: highlighted }} />
          </>
        )
      }
      return (
        <>
          <CopyButton text={raw} className={styles.codeCopyBtn} />
          <code className={styles.mdCodeBlockPlain}>
            {children}
          </code>
        </>
      )
    }
    // Multi-line without language → plain code block
    const raw = String(children).replace(/\n$/, '')
    if (raw.includes('\n')) {
      return (
        <>
          <CopyButton text={raw} className={styles.codeCopyBtn} />
          <code className={styles.mdCodeBlockPlain}>
            {children}
          </code>
        </>
      )
    }
    return (
      <code className={styles.mdInlineCode}>
        {children}
      </code>
    )
  },
  pre: ({ children }) => <pre className={styles.mdPre}>{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote className={styles.mdBlockquote}>
      {children}
    </blockquote>
  ),
  hr: () => <hr className={styles.mdHr} />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className={styles.mdLink}>
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className={styles.mdTableWrap}>
      <table className={styles.mdTable}>{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className={styles.mdTh}>{children}</th>
  ),
  td: ({ children }) => (
    <td className={styles.mdTd}>{children}</td>
  ),
}

// ── Diff algorithm (LCS) ────────────────────────────────────

interface DiffLine {
  type: 'add' | 'del' | 'ctx'
  text: string
  oldNum?: number
  newNum?: number
}

function computeDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldL = oldStr.split('\n')
  const newL = newStr.split('\n')
  const m = oldL.length, n = newL.length

  if (m + n > 400) {
    const out: DiffLine[] = []
    oldL.forEach((t, i) => out.push({ type: 'del', text: t, oldNum: i + 1 }))
    newL.forEach((t, i) => out.push({ type: 'add', text: t, newNum: i + 1 }))
    return out
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = oldL[i - 1] === newL[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])

  const raw: DiffLine[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldL[i - 1] === newL[j - 1]) {
      raw.push({ type: 'ctx', text: oldL[i - 1], oldNum: i, newNum: j })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.push({ type: 'add', text: newL[j - 1], newNum: j })
      j--
    } else {
      raw.push({ type: 'del', text: oldL[i - 1], oldNum: i })
      i--
    }
  }
  raw.reverse()
  return raw
}

// ── guessLang / stripLineNumbers ────────────────────────────

function guessLang(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java', kt: 'kotlin',
    rb: 'ruby', sh: 'bash', zsh: 'bash', bash: 'bash',
    css: 'css', scss: 'scss', less: 'less', html: 'xml', xml: 'xml', svg: 'xml',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini', md: 'markdown',
    sql: 'sql', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
    dockerfile: 'dockerfile', makefile: 'makefile',
  }
  return map[ext] || ''
}

function stripLineNumbers(text: string): string {
  return text.replace(/^ *\d+[→\t]/gm, '')
}

// ── EditDiffView ────────────────────────────────────────────

function EditDiffView({ input }: { input: Record<string, unknown> }) {
  const oldStr = String(input.old_string ?? '')
  const newStr = String(input.new_string ?? '')
  const filePath = String(input.file_path ?? '')
  const fileName = filePath.split('/').pop() || filePath

  const raw = useMemo(() => computeDiff(oldStr, newStr), [oldStr, newStr])
  const added = raw.filter(d => d.type === 'add').length
  const removed = raw.filter(d => d.type === 'del').length

  const lines: (DiffLine | { type: 'fold'; count: number })[] = []
  let ctxRun: DiffLine[] = []
  const flushCtx = () => {
    if (ctxRun.length <= 4) { lines.push(...ctxRun) }
    else {
      lines.push(ctxRun[0])
      lines.push({ type: 'fold', count: ctxRun.length - 2 })
      lines.push(ctxRun[ctxRun.length - 1])
    }
    ctxRun = []
  }
  for (const d of raw) {
    if (d.type === 'ctx') ctxRun.push(d)
    else { if (ctxRun.length) flushCtx(); lines.push(d) }
  }
  if (ctxRun.length) flushCtx()

  return (
    <div className={styles.diffWrap}>
      <div className={styles.diffHeader}>
        <IconWrench size={12} />
        <span className={styles.diffFilePath} title={filePath}>{fileName}</span>
        <span style={{ flex: 1 }} />
        <span className={styles.diffStats}>
          {added > 0 && <span className={styles.diffStatsAdd}>+{added}</span>}
          {removed > 0 && <span className={styles.diffStatsDel}>{'\u2212'}{removed}</span>}
        </span>
      </div>
      <div className={styles.diffBody}>
        {lines.map((item, idx) => {
          if ('count' in item) {
            return (
              <div key={idx} className={styles.diffFold}>
                <span>{'\u22EF'} {item.count} unchanged lines {'\u22EF'}</span>
              </div>
            )
          }
          const isAdd = item.type === 'add'
          const isDel = item.type === 'del'
          return (
            <div key={idx}
                 className={isAdd ? styles.diffLineAdd : isDel ? styles.diffLineDel : styles.diffLineCtx}>
              <span className={`${styles.diffSign} ${isAdd ? styles.diffSignAdd : isDel ? styles.diffSignDel : ''}`}>
                {isAdd ? '+' : isDel ? '\u2212' : ' '}
              </span>
              <span className={`${styles.diffText} ${isAdd ? styles.diffTextAdd : isDel ? styles.diffTextDel : styles.diffTextCtx}`}>
                {item.text || ' '}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── BashOutput ──────────────────────────────────────────────

function BashOutput({ command, result, isError }: { command: string; result: string; isError: boolean }) {
  return (
    <div className={styles.bashWrap} style={isError ? { borderColor: 'rgba(244,63,94,0.3)' } : undefined}>
      <div className={styles.bashHeader}>
        <span className={styles.bashPrompt}>$</span>
        <span className={styles.bashCmd}>{command}</span>
      </div>
      <pre className={`${styles.bashOutput} ${isError ? styles.bashOutputError : ''}`}>
        {result}
      </pre>
    </div>
  )
}

// ── ReadFileView ────────────────────────────────────────────

function ReadFileView({ filePath, result }: { filePath: string; result: string }) {
  const stripped = stripLineNumbers(result)
  const lineCount = stripped.split('\n').length
  const lang = guessLang(filePath)
  const fileName = filePath.split('/').pop() || filePath

  const highlighted = useMemo(() => {
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(stripped, { language: lang }).value
      }
      return hljs.highlightAuto(stripped).value
    } catch {
      return null
    }
  }, [stripped, lang])

  return (
    <div className={styles.readWrap}>
      <div className={styles.readHeader}>
        <IconFileText size={12} />
        <span className={styles.readFilePath} title={filePath}>{fileName}</span>
        <span style={{ flex: 1 }} />
        <span className={styles.readLineCount}>{lineCount} lines</span>
      </div>
      {highlighted ? (
        <pre className={`hljs ${styles.readBody}`}
             dangerouslySetInnerHTML={{ __html: highlighted }} />
      ) : (
        <pre className={styles.readBody}>
          {stripped}
        </pre>
      )}
    </div>
  )
}

// ── AgentResultView ─────────────────────────────────────────

function AgentResultView({ result, description }: { result: string; description: string }) {
  return (
    <div className={styles.agentWrap}>
      {description && (
        <div className={styles.agentHeader}>
          <IconBot size={12} />
          <span className={styles.agentDesc}>{description}</span>
        </div>
      )}
      <div className={styles.agentBody}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {result}
        </ReactMarkdown>
      </div>
    </div>
  )
}

// ── AskUserQuestionView ─────────────────────────────────────

function AskUserQuestionView({ input, result }: { input: Record<string, unknown>; result?: string | null }) {
  const question = String(input.question || '')

  return (
    <div className={styles.askWrap}>
      <div className={styles.askHeader}>
        <IconCircleHelp size={13} />
        <span className={styles.askTitle}>AskUserQuestion</span>
      </div>
      <div className={styles.askBody}>
        <p className={styles.askQuestion}>{question}</p>
      </div>
      {result && (
        <div className={styles.askAnswer}>
          <span style={{ flexShrink: 0, marginTop: 1, display: 'flex' }}><IconUser size={12} /></span>
          <p className={styles.askAnswerText}>{result}</p>
        </div>
      )}
    </div>
  )
}

// ── OutputBlock (generic markdown result) ───────────────────

function OutputBlock({ result, isError }: { result: string; isError: boolean }) {
  return (
    <div className={styles.outputWrap} style={isError ? { borderColor: 'rgba(244,63,94,0.3)' } : undefined}>
      <div className={`${styles.outputBody} ${isError ? styles.outputBodyError : ''}`}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {result}
        </ReactMarkdown>
      </div>
    </div>
  )
}

// ── ToolWidget ──────────────────────────────────────────────

function ToolWidget({ block }: { block: TranscriptBlock }) {
  const signal = useContext(ExpandSignalCtx)
  const autoExpand = useContext(AutoExpandCtx)
  const toolName = block.tool_name || 'Tool'
  const isAskUserInit = toolName === 'AskUserQuestion'
  const [open, setOpen] = useState(autoExpand || isAskUserInit)
  const toggle = useCallback(() => setOpen(v => !v), [])

  // Respond to global expand/collapse signal
  const prevSignal = useRef(signal)
  useEffect(() => {
    if (signal === prevSignal.current) return
    prevSignal.current = signal
    setOpen(signal > 0)
  }, [signal])

  const detail = getToolDetail(block.tool_name, block.tool_input)
  const hasFilePath = ['Read', 'Write', 'Edit', 'MultiEdit'].includes(toolName) && block.tool_input?.file_path
  const filePath = hasFilePath ? String(block.tool_input!.file_path) : ''
  const fileName = filePath ? filePath.split('/').pop() || filePath : ''
  const hasResult = block.tool_result != null && block.tool_result !== ''
  const isError = block.tool_error === true
  const isEdit = toolName === 'Edit' || toolName === 'MultiEdit'
  const isBash = toolName === 'Bash'
  const isRead = toolName === 'Read'
  const isAgent = toolName === 'Agent'
  const isAskUser = toolName === 'AskUserQuestion'
  const hasEditData = isEdit && block.tool_input && (block.tool_input.old_string || block.tool_input.new_string)
  const bashCmd = isBash ? String(block.tool_input?.command ?? '') : ''
  const canExpand = hasResult || hasEditData || isAskUser

  const editInfo = useMemo(() => {
    if (!hasEditData || !block.tool_input) return ''
    const oldN = String(block.tool_input.old_string ?? '').split('\n').length
    const newN = String(block.tool_input.new_string ?? '').split('\n').length
    const parts: string[] = []
    if (newN > 0) parts.push(`+${newN}`)
    if (oldN > 0) parts.push(`\u2212${oldN}`)
    return parts.join(' ')
  }, [hasEditData, block.tool_input])

  const preview = hasResult
    ? block.tool_name === 'Read'
      ? `${block.tool_result!.split('\n').length} lines`
      : block.tool_result!.split('\n')[0].slice(0, 100)
    : ''

  return (
    <div className={styles.toolWidget}>
      <button
        onClick={canExpand ? toggle : undefined}
        className={`${styles.toolHeader} ${canExpand ? styles.toolHeaderClickable : ''}`}
      >
        <span className={styles.toolIcon}>{getToolIcon(toolName)}</span>
        {hasFilePath ? (
          <span className={styles.toolParam} title={filePath}>
            {fileName}
            {editInfo && <span className={styles.toolEditInfo}>{editInfo}</span>}
          </span>
        ) : detail ? (
          <code className={styles.toolParam}>{detail}</code>
        ) : (
          <span className={styles.toolName}>{isEdit ? 'Edit' : toolName}</span>
        )}
        {isError && (
          <span className={styles.toolError}>ERROR</span>
        )}
        <span style={{ flex: 1 }} />
        {!open && preview && (
          <span className={styles.toolPreview}>{preview}</span>
        )}
        {canExpand && (
          <span className={styles.toolChevron} style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 0.15s' }}>
            <IconChevronRight size={10} />
          </span>
        )}
      </button>
      {open && (
        <div className={styles.toolBody}>
          {!!hasEditData && <EditDiffView input={block.tool_input!} />}
          {isBash && hasResult && <BashOutput command={bashCmd} result={block.tool_result!} isError={isError} />}
          {isRead && hasResult && <ReadFileView filePath={String(block.tool_input?.file_path ?? '')} result={block.tool_result!} />}
          {isAgent && hasResult && <AgentResultView result={block.tool_result!} description={String(block.tool_input?.description ?? '')} />}
          {isAskUser && <AskUserQuestionView input={block.tool_input || {}} result={block.tool_result} />}
          {!isEdit && !isBash && !isRead && !isAgent && !isAskUser && hasResult && <OutputBlock result={block.tool_result!} isError={isError} />}
        </div>
      )}
    </div>
  )
}

// ── ReadGroupStrip (collapsed read-only tools) ──────────────

function ReadGroupStrip({ blocks }: { blocks: TranscriptBlock[] }) {
  const [open, setOpen] = useState(false)

  const pills = useMemo(() => blocks.map(b => {
    const name = b.tool_name || 'Tool'
    const detail = name === 'Read'
      ? String(b.tool_input?.file_path ?? '').split('/').pop() || ''
      : name === 'Grep'
        ? `"${String(b.tool_input?.pattern ?? '')}"`
        : name === 'Glob'
          ? String(b.tool_input?.pattern ?? '')
          : name === 'WebSearch'
            ? String(b.tool_input?.query ?? '').slice(0, 40)
            : String(b.tool_input?.url ?? '').split('/').pop()?.slice(0, 40) || ''
    return { name, detail, icon: getToolIcon(name, 11) }
  }), [blocks])

  return (
    <div className={styles.readGroupStrip}>
      <button className={styles.readGroupHeader} onClick={() => setOpen(v => !v)}>
        <span className={styles.readGroupChevron} style={{ transform: open ? 'rotate(90deg)' : undefined }}>
          <IconChevronRight size={10} />
        </span>
        <div className={styles.readGroupPills}>
          {pills.map((p, i) => (
            <span key={i} className={styles.readGroupPill} title={p.detail}>
              <span className={styles.readGroupPillIcon}>{p.icon}</span>
              <span className={styles.readGroupPillText}>{p.detail}</span>
            </span>
          ))}
        </div>
      </button>
      {open && (
        <div className={styles.readGroupBody}>
          {blocks.map((block, i) => (
            <ToolWidget key={i} block={block} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Avatars ─────────────────────────────────────────────────

function ClaudeAvatar() {
  return (
    <div className={styles.avatarBot}><IconBot size={14} /></div>
  )
}

function UserAvatar() {
  return (
    <div className={styles.avatarUser}><IconUser size={14} /></div>
  )
}

// ── Message cards ───────────────────────────────────────────

function UserCard({ msg }: { msg: TranscriptMessage }) {
  const text = msg.blocks
    .filter(b => b.type === 'text')
    .map(b => b.text || '')
    .join('\n')
    .trim()
  if (!text) return null

  return (
    <div className={styles.msgRowRight}>
      <div className={styles.bubbleWrap}>
        <div className={styles.userBubble}>
          <div className={styles.mdContent}>
            <RichTextBlock text={text} />
          </div>
        </div>
        <CopyButton text={text} className={styles.msgCopyBtn} />
      </div>
      <UserAvatar />
    </div>
  )
}

// @ts-expect-error kept for fallback
function AssistantCard({ msg }: { msg: TranscriptMessage }) {
  const fullText = msg.blocks
    .filter(b => b.type === 'text')
    .map(b => b.text || '')
    .join('\n')
    .trim()
  const units = useMemo(() => groupBlocks(msg.blocks), [msg.blocks])
  return (
    <div className={styles.msgRowLeft}>
      <ClaudeAvatar />
      <div className={styles.bubbleWrap}>
        <div className={styles.assistantBubble}>
          <div className={styles.mdContent}>
            {units.map((unit, i) => {
              switch (unit.kind) {
                case 'text':
                  return <RichTextBlock key={i} text={unit.block.text ?? ''} />
                case 'tool':
                  return <ToolWidget key={i} block={unit.block} />
                case 'read-group':
                  return <ReadGroupStrip key={i} blocks={unit.blocks} />
              }
            })}
          </div>
        </div>
        {fullText && <CopyButton text={fullText} className={styles.msgCopyBtn} />}
      </div>
    </div>
  )
}

// ── Scheme C: Smart grouping components ─────────────────────

// ── Parse search results into file entries ──────────────────
function parseSearchResultFiles(result: string): { path: string; name: string }[] {
  if (!result) return []
  const lines = result.split('\n').filter(l => l.trim())
  const files: { path: string; name: string }[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    // Grep results: "filepath:linenum:content" or just file paths from Glob
    const match = line.match(/^(.+?\.\w+)(?::\d|$)/)
    const fp = match ? match[1].trim() : line.trim()
    if (!fp || seen.has(fp)) continue
    // Basic heuristic: looks like a file path
    if (fp.includes('/') || fp.includes('.')) {
      seen.add(fp)
      files.push({ path: fp, name: fp.split('/').pop() || fp })
    }
  }
  return files
}

function ReadPillRow({ blocks }: { blocks: TranscriptBlock[] }) {
  const { t } = useTranslation()
  const [expandedIdx, setExpandedIdx] = useState<string | null>(null)

  const readFiles = blocks.filter(b => b.tool_name === 'Read')
  const greps = blocks.filter(b => b.tool_name === 'Grep')
  const globs = blocks.filter(b => b.tool_name === 'Glob')
  const rest = blocks.filter(b => !['Read', 'Grep', 'Glob'].includes(b.tool_name || ''))

  const toggle = useCallback((key: string) => {
    setExpandedIdx(prev => prev === key ? null : key)
  }, [])

  // Find the expanded block
  const expandedBlock = useMemo(() => {
    if (!expandedIdx) return null
    const [prefix, idxStr] = expandedIdx.split(':')
    const idx = parseInt(idxStr, 10)
    if (prefix === 'r') return readFiles[idx] ?? null
    if (prefix === 'g') return greps[idx] ?? null
    if (prefix === 'gl') return globs[idx] ?? null
    return null
  }, [expandedIdx, readFiles, greps, globs])

  return (
    <div className={styles.pillRowWrap}>
      <div className={styles.pillRow}>
        {readFiles.length > 0 && (
          <>
            <span className={styles.pillLabel}>{t('admin.sessions.pill_read')}</span>
            {readFiles.map((b, i) => {
              const fp = String(b.tool_input?.file_path || '')
              const name = fp.split('/').pop() || fp
              const key = `r:${i}`
              const isActive = expandedIdx === key
              const hasContent = b.tool_result != null && b.tool_result !== ''
              return (
                <span
                  key={key}
                  className={`${styles.pill} ${isActive ? styles.pillActive : ''} ${hasContent ? styles.pillClickable : ''}`}
                  title={fp}
                  onClick={hasContent ? () => toggle(key) : undefined}
                >
                  <span className={styles.pillIcon}>{getToolIcon('Read', 10)}</span>
                  <span className={styles.pillText}>{name}</span>
                </span>
              )
            })}
          </>
        )}
        {greps.length > 0 && (
          <>
            <span className={styles.pillLabel}>{t('admin.sessions.pill_search')}</span>
            {greps.map((b, i) => {
              const key = `g:${i}`
              const isActive = expandedIdx === key
              const hasContent = b.tool_result != null && b.tool_result !== ''
              return (
                <span
                  key={key}
                  className={`${styles.pill} ${styles.pillGrep} ${isActive ? styles.pillActive : ''} ${hasContent ? styles.pillClickable : ''}`}
                  title={String(b.tool_input?.pattern || '')}
                  onClick={hasContent ? () => toggle(key) : undefined}
                >
                  <span className={styles.pillIcon}>{getToolIcon('Grep', 10)}</span>
                  <span className={styles.pillText}>&quot;{String(b.tool_input?.pattern || '').slice(0, 30)}&quot;</span>
                </span>
              )
            })}
          </>
        )}
        {globs.map((b, i) => {
          const key = `gl:${i}`
          const isActive = expandedIdx === key
          const hasContent = b.tool_result != null && b.tool_result !== ''
          return (
            <span
              key={key}
              className={`${styles.pill} ${isActive ? styles.pillActive : ''} ${hasContent ? styles.pillClickable : ''}`}
              title={String(b.tool_input?.pattern || '')}
              onClick={hasContent ? () => toggle(key) : undefined}
            >
              <span className={styles.pillIcon}>{getToolIcon('Glob', 10)}</span>
              <span className={styles.pillText}>{String(b.tool_input?.pattern || '').slice(0, 30)}</span>
            </span>
          )
        })}
        {rest.map((b, i) => (
          <span key={`o${i}`} className={styles.pill}>
            <span className={styles.pillIcon}>{getToolIcon(b.tool_name || '', 10)}</span>
            <span className={styles.pillText}>{b.tool_name}</span>
          </span>
        ))}
      </div>
      {/* Inline expanded panel */}
      {expandedBlock && expandedIdx && (
        <PillExpandedPanel block={expandedBlock} toolType={expandedIdx.split(':')[0]} />
      )}
    </div>
  )
}

// ── Expanded panel for pill content ─────────────────────────

function PillExpandedPanel({ block, toolType }: { block: TranscriptBlock; toolType: string }) {
  const result = block.tool_result || ''

  if (toolType === 'r') {
    // Read → show file content
    const filePath = String(block.tool_input?.file_path ?? '')
    return (
      <div className={styles.pillExpandedPanel}>
        <ReadFileView filePath={filePath} result={result} />
      </div>
    )
  }

  // Grep / Glob → show search results as file list
  const files = useMemo(() => parseSearchResultFiles(result), [result])
  const pattern = toolType === 'g'
    ? String(block.tool_input?.pattern ?? '')
    : String(block.tool_input?.pattern ?? '')
  const resultLines = result.split('\n').filter(l => l.trim())

  return (
    <div className={styles.pillExpandedPanel}>
      <div className={styles.searchResultHeader}>
        <IconSearch size={12} />
        <span className={styles.searchResultPattern}>{pattern}</span>
        <span style={{ flex: 1 }} />
        <span className={styles.searchResultCount}>
          {files.length > 0 ? `${files.length} files` : `${resultLines.length} lines`}
        </span>
      </div>
      {files.length > 0 ? (
        <div className={styles.searchResultList}>
          {files.map((f, i) => (
            <div key={i} className={styles.searchResultItem} title={f.path}>
              <span className={styles.searchResultItemIcon}>{getToolIcon('Read', 11)}</span>
              <span className={styles.searchResultItemName}>{f.name}</span>
              <span className={styles.searchResultItemPath}>{f.path}</span>
            </div>
          ))}
        </div>
      ) : (
        <pre className={styles.searchResultRaw}>{result}</pre>
      )}
    </div>
  )
}

function EditInlineCard({ block }: { block: TranscriptBlock }) {
  const input = block.tool_input || {}
  const hasEditData = Boolean(input.old_string || input.new_string)

  if (!hasEditData) {
    // Write without diff data — show compact line
    const filePath = String(input.file_path || '')
    const fileName = filePath.split('/').pop() || filePath
    return (
      <div className={styles.bashCardHeader}>
        <span className={styles.bashCardIcon}>{getToolIcon(block.tool_name || 'Edit', 12)}</span>
        <span className={styles.editCardFile} title={filePath}>{fileName}</span>
        <span className={`${styles.bashCardBadge} ${styles.bashCardPass}`}>{'\u2713'}</span>
      </div>
    )
  }

  return <EditDiffView input={input} />
}

// Guess best hljs language for command output
function guessOutputLang(text: string, cmd: string): string | null {
  // JSON output
  if (/^\s*[\[{]/.test(text) && /[\]}]\s*$/.test(text)) return 'json'
  // TypeScript/ESLint errors: file(line,col): error TS...
  if (/\.(ts|tsx|js|jsx)\(\d+,\d+\):\s*error/.test(text)) return 'typescript'
  // Python traceback
  if (/Traceback \(most recent call last\)/.test(text)) return 'python'
  // YAML-like
  if (/^[\w-]+:\s+.+$/m.test(text) && !text.includes('=')) return 'yaml'
  // If command is a known tool, hint the language
  if (/\b(tsc|eslint|tsx?)\b/.test(cmd)) return 'typescript'
  if (/\bpython|pip|pytest\b/.test(cmd)) return 'python'
  if (/\bcargo|rustc\b/.test(cmd)) return 'rust'
  if (/\bgo (build|test|run)\b/.test(cmd)) return 'go'
  return null
}

// Custom log highlighter for terminal output that doesn't match a known language
function highlightLog(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // File paths: /foo/bar.ts or ./foo/bar
    .replace(/((?:\/[\w.@-]+)+(?:\.\w+)?(?:\(\d+[,:]?\d*\))?)/g, '<span class="hljs-string">$1</span>')
    // error / Error / ERROR
    .replace(/\b(error|Error|ERROR|fail|FAIL|failed|FAILED|fatal|FATAL)\b/g, '<span class="hljs-deletion">$1</span>')
    // warning / Warning / WARN
    .replace(/\b(warning|Warning|WARN|warn|deprecated|DEPRECATED)\b/g, '<span class="hljs-comment">$1</span>')
    // success / pass / ok
    .replace(/\b(success|Success|SUCCESS|pass|PASS|passed|ok|OK|done|Done|DONE)\b/g, '<span class="hljs-addition">$1</span>')
    // Numbers (standalone)
    .replace(/\b(\d+(?:\.\d+)?(?:ms|s|m|KB|MB|GB|%)?)\b/g, '<span class="hljs-number">$1</span>')
    // Quoted strings
    .replace(/'([^']{1,80})'/g, '\'<span class="hljs-string">$1</span>\'')
    .replace(/"([^"]{1,80})"/g, '"<span class="hljs-string">$1</span>"')
    // TS error codes
    .replace(/\b(TS\d{4,5})\b/g, '<span class="hljs-keyword">$1</span>')
}

function BashStatusLine({ block }: { block: TranscriptBlock }) {
  const { t } = useTranslation()
  const cmd = String(block.tool_input?.command ?? '')
  const shortCmd = cmd.replace(/^cd [^ ]+ && /, '').slice(0, 150)
  const result = (block.tool_result || '').trim()
  const isError = block.tool_error === true
  const hasError = isError || result.toLowerCase().includes('error') || result.toLowerCase().includes('fail')
  const noOutput = !result || result === '(Bash completed with no output)'

  const cmdHighlighted = useMemo(() => {
    try {
      return hljs.highlight(shortCmd, { language: 'bash' }).value
    } catch {
      return null
    }
  }, [shortCmd])

  const resultHtml = useMemo(() => {
    if (!result || noOutput) return null
    // Try known language first
    const lang = guessOutputLang(result, cmd)
    if (lang) {
      try {
        if (hljs.getLanguage(lang)) {
          return hljs.highlight(result, { language: lang }).value
        }
      } catch { /* fall through */ }
    }
    // Try auto-detect for short output
    if (result.length < 2000) {
      try {
        const auto = hljs.highlightAuto(result)
        if (auto.relevance > 5) return auto.value
      } catch { /* fall through */ }
    }
    // Custom log highlighter
    return highlightLog(result)
  }, [result, noOutput, cmd])

  return (
    <div className={styles.bashCard}>
      <div className={`${styles.bashCardHeader} ${hasError ? styles.bashCardHeaderErr : ''}`}>
        <span className={styles.bashCardIcon}>{getToolIcon('Bash', 12)}</span>
        <span className={styles.bashCardPrompt}>$</span>
        {cmdHighlighted ? (
          <code className={`hljs ${styles.bashCardCmd}`} dangerouslySetInnerHTML={{ __html: cmdHighlighted }} />
        ) : (
          <code className={styles.bashCardCmd}>{shortCmd}</code>
        )}
        <span className={`${styles.bashCardBadge} ${hasError ? styles.bashCardFail : styles.bashCardPass}`}>
          {hasError ? t('admin.sessions.bash_fail') : t('admin.sessions.bash_pass')}
        </span>
      </div>
      {result && !noOutput && (
        <pre className={`hljs ${styles.bashCardOutput} ${hasError ? styles.bashCardOutputErr : ''}`}
             dangerouslySetInnerHTML={{ __html: resultHtml || '' }} />
      )}
    </div>
  )
}

function AssistantTurnCard({ turn }: { turn: AssistantTurn }) {
  const fullText = turn.texts.join('\n').trim()

  return (
    <div className={styles.msgRowLeft}>
      <ClaudeAvatar />
      <div className={styles.bubbleWrap}>
        <div className={styles.assistantBubble}>
          <div className={styles.mdContent}>
            {/* Text segments */}
            {turn.texts.map((t, i) => (
              <RichTextBlock key={`t${i}`} text={t} />
            ))}

            {/* Read-only tools → pill row */}
            {turn.reads.length > 0 && (
              <ReadPillRow blocks={turn.reads} />
            )}

            {/* Edit/Write → inline diff cards */}
            {turn.edits.map((block, i) => (
              <EditInlineCard key={`e${i}`} block={block} />
            ))}

            {/* Bash → status lines */}
            {turn.bashes.map((block, i) => (
              <BashStatusLine key={`b${i}`} block={block} />
            ))}

            {/* Other tools → compact widget */}
            {turn.others.map((block, i) => (
              <ToolWidget key={`o${i}`} block={block} />
            ))}
          </div>
        </div>
        {fullText && <CopyButton text={fullText} className={styles.msgCopyBtn} />}
      </div>
    </div>
  )
}

// ── Status dot ──────────────────────────────────────────────

function StatusDot({ status }: { status: AiSession['status'] }) {
  const cls =
    status === 'active' ? styles.statusDotActive
    : status === 'idle' ? styles.statusDotIdle
    : styles.statusDotStopped
  return <span className={cls} />
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

  // Expand signal
  const [expandSignal, setExpandSignal] = useState(0)

  // Sticky question
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null)

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
    isFirstLoad.current = true

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

  // Auto-refresh transcript: WS-driven + fallback polling
  const selectedSession = useMemo(() => sessions.find(s => s.session_id === selectedId), [sessions, selectedId])

  const refreshTranscript = useCallback((sid: string) => {
    api.getTranscript(sid)
      .then(r => {
        transcriptCache.current.set(sid, { messages: r.messages, file_found: r.file_found })
        setTranscript(r.messages)
        setFileFound(r.file_found)
      })
      .catch(() => {})
  }, [])

  // WS: subscribe to session events for real-time refresh
  useEffect(() => {
    if (!selectedSession || selectedSession.status !== 'active') return
    const sid = selectedSession.session_id
    const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/session/${sid}`
    const channel = `session-detail:${sid}`

    wsManager.connect(channel, wsUrl)
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const unsub = wsManager.subscribe(channel, () => {
      // Debounce: batch rapid WS events into one refresh
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => refreshTranscript(sid), 500)
    })

    // Fallback poll every 10s in case WS misses events
    const pollId = setInterval(() => refreshTranscript(sid), 10000)

    return () => {
      unsub()
      if (debounceTimer) clearTimeout(debounceTimer)
      wsManager.disconnect(channel)
      clearInterval(pollId)
    }
  }, [selectedSession, refreshTranscript])

  // Scroll management: scroll to bottom on first load only
  const bottomRef = useRef<HTMLDivElement>(null)
  const isFirstLoad = useRef(true)
  const [showJumpBtn, setShowJumpBtn] = useState(false)

  // Track if user is near bottom
  const checkNearBottom = useCallback(() => {
    const el = transcriptRef.current
    if (!el) return false
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }, [])

  // Scroll listener to toggle jump button
  useEffect(() => {
    const el = transcriptRef.current
    if (!el) return
    const onScroll = () => setShowJumpBtn(!checkNearBottom())
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [checkNearBottom, transcript])

  // Scroll to bottom only on first load of a session
  useEffect(() => {
    if (!transcript.length) return
    if (isFirstLoad.current) {
      isFirstLoad.current = false
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'auto' })
        setShowJumpBtn(false)
      })
    }
  }, [transcript])

  const jumpToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setShowJumpBtn(false)
  }, [])

  // Sync expand signal when transcript changes
  useEffect(() => {
    setExpandSignal(prev => autoExpand ? Math.abs(prev) + 1 : -(Math.abs(prev) + 1))
    setCurrentQuestion(null)
  }, [transcript])

  // Sync expand signal when autoExpand toggles
  useEffect(() => {
    setExpandSignal(prev => autoExpand ? Math.abs(prev) + 1 : -(Math.abs(prev) + 1))
  }, [autoExpand])

  // Filtered sessions: exclude sessions without summary (no user messages)
  const filtered = useMemo(() => {
    const withSummary = sessions.filter(s => s.summary)
    if (!search.trim()) return withSummary
    const q = search.toLowerCase()
    return withSummary.filter(s =>
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

  // IntersectionObserver for sticky question header
  useEffect(() => {
    const container = transcriptRef.current
    if (!container || questions.length === 0) return

    const timer = setTimeout(() => {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const idx = Number((entry.target as HTMLElement).dataset.msgIndex)
              const q = questions.find(q => q.msgIndex === idx)
              if (q) setCurrentQuestion(q.text.slice(0, 200))
            }
          }
        },
        { root: container, rootMargin: '-40px 0px 0px 0px', threshold: 0.1 }
      )

      const qIndices = new Set(questions.map(q => q.msgIndex))
      const elements = container.querySelectorAll('[data-msg-index]')
      elements.forEach(el => {
        const idx = Number((el as HTMLElement).dataset.msgIndex)
        if (qIndices.has(idx)) observer.observe(el)
      })

      ;(container as unknown as Record<string, unknown>).__convObserver = observer

      return () => {
        observer.disconnect()
      }
    }, 100)

    return () => {
      clearTimeout(timer)
      const obs = (container as unknown as Record<string, unknown>).__convObserver as IntersectionObserver | undefined
      if (obs) { obs.disconnect(); delete (container as unknown as Record<string, unknown>).__convObserver }
    }
  }, [questions])

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
            + {t('admin_extra.new_conversation')}
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
                {search ? t('admin_extra.no_match_results') : t('admin.sessions.no_sessions')}
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
            <p style={{ fontSize: 12 }}>{t('admin_extra.conversation_file_not_found')}</p>
          </div>
        ) : transcript.length === 0 ? (
          <div className={styles.emptyCenter}>
            <span style={{ fontSize: 28 }}>{'\uD83D\uDCAC'}</span>
            <p style={{ fontSize: 12 }}>{t('admin.sessions.no_events')}</p>
          </div>
        ) : (
          <AutoExpandCtx.Provider value={autoExpand}>
          <ExpandSignalCtx.Provider value={expandSignal}>
            <div ref={transcriptRef} className={styles.transcriptScroll}>
              {/* Sticky question header */}
              {currentQuestion && (
                <div className={styles.stickyQuestion}>
                  <span style={{ flexShrink: 0, display: 'flex' }}><IconUser size={12} /></span>
                  <span className={styles.stickyQuestionText}>{currentQuestion}</span>
                </div>
              )}
              <div className={styles.transcriptBody}>
                {groupMessagesIntoTurns(transcript).map((item, i) => (
                  <div key={i} data-msg-index={i}>
                    {item.kind === 'user' ? (
                      <UserCard msg={item.msg} />
                    ) : (
                      <AssistantTurnCard turn={item.turn} />
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              {showJumpBtn && (
                <button className={styles.jumpToBottom} onClick={jumpToBottom}>
                  <IconChevronDown size={14} />
                  <span>{t('admin_extra.latest')}</span>
                </button>
              )}
            </div>
          </ExpandSignalCtx.Provider>
          </AutoExpandCtx.Provider>
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
