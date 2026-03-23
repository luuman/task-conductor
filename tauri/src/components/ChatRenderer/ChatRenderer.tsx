// ChatRenderer.tsx — Shared transcript message rendering components
// Extracted from AdminSessions.tsx for reuse in FloatingAssistant and other contexts.

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, createContext, useContext, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import hljs from 'highlight.js/lib/core'
import '../../styles/hljs-ayu-dark.css'
import { useHighlight } from '../../lib/useHighlight'
import {
  IconTerminal, IconFileText, IconPencil, IconWrench, IconSearch,
  IconFolderOpen, IconGlobe, IconBot, IconCircleHelp, IconChevronRight,
  IconUser,
} from '../../ui/icon'
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

import mermaid from 'mermaid'

import type { TranscriptMessage, TranscriptBlock } from '../../lib/api/types'
import styles from '../../features/admin/pages/sessions/sessions.module.css'

// ── Mermaid 初始化 ──────────────────────────────────────
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  darkMode: true,
  fontFamily: "'Geist Mono', monospace",
  fontSize: 12,
  flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
  sequence: { useMaxWidth: true },
  themeVariables: {
    primaryColor: '#1a3a5c',
    primaryTextColor: '#e6edf3',
    primaryBorderColor: '#30608a',
    lineColor: '#58a6ff',
    secondaryColor: '#1c2d3f',
    tertiaryColor: '#0d1b2a',
    noteTextColor: '#e6edf3',
    noteBkgColor: '#1a3a5c',
    noteBorderColor: '#30608a',
  },
})

function MermaidBlock({ code }: { code: string }) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const idBase = useId().replace(/:/g, '_')
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const id = `mermaid_${idBase}`
    mermaid.render(id, code).then(
      ({ svg: rendered }) => { if (!cancelled) setSvg(rendered) },
      (err) => { if (!cancelled) setError(String(err?.message || err)) },
    )
    return () => { cancelled = true }
  }, [code, idBase])

  if (error) {
    return (
      <div className={styles.mermaidError}>
        <span className={styles.mermaidErrorLabel}>{t('admin.sessions.mermaid_error')}</span>
        <pre className={styles.mermaidErrorPre}>{error}</pre>
        <pre className={styles.mermaidErrorSrc}>{code}</pre>
      </div>
    )
  }

  if (!svg) {
    return (
      <div className={styles.mermaidLoading}>
        {t('admin.sessions.mermaid_loading')}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={styles.mermaidWrap}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

// ── Context ─────────────────────────────────────────────────
// signal > 0 = expand all (increments), signal < 0 = collapse all (decrements)
export const ExpandSignalCtx = createContext(0)
export const AutoExpandCtx = createContext(false)

// ── Tool SVG icon mapping ───────────────────────────────────

export function getToolIcon(toolName: string, size = 13): ReactNode {
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

// ── 文件类型图标（从 /file-icons/ 加载 SVG）─────────────────

export function fileExtIcon(filePath: string, size = 14): ReactNode {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'file_type_typescript.svg', tsx: 'file_type_typescript.svg',
    js: 'file_type_js.svg', jsx: 'file_type_js.svg',
    py: 'file_type_python.svg', rs: 'file_type_rust.svg',
    go: 'file_type_go.svg', java: 'file_type_java.svg',
    css: 'file_type_css.svg', scss: 'file_type_scss.svg',
    json: 'file_type_json.svg', yaml: 'file_type_yaml.svg', yml: 'file_type_yaml.svg',
    toml: 'file_type_toml.svg', md: 'file_type_markdown.svg',
    sh: 'file_type_shell.svg', bash: 'file_type_shell.svg',
    html: 'file_type_html@2x.png', xml: 'file_type_html@2x.png',
    kt: 'file_type_kotlin.svg', dart: 'file_type_dart.svg',
    c: 'file_type_c.svg', cpp: 'file_type_cpp.svg', h: 'file_type_c.svg',
  }
  const file = map[ext]
  if (!file) return <IconFileText size={size} color="currentColor" />
  return <img src={`/file-icons/${file}`} alt={ext} style={{ width: size, height: size, display: 'block' }} />
}

// ── Block grouping for smart layout ─────────────────────────

export const READONLY_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch'])
export const WRITE_TOOLS = new Set(['Edit', 'MultiEdit', 'Write'])

export type GroupedUnit =
  | { kind: 'text'; block: TranscriptBlock }
  | { kind: 'tool'; block: TranscriptBlock }
  | { kind: 'read-group'; blocks: TranscriptBlock[] }

export function groupBlocks(blocks: TranscriptBlock[]): GroupedUnit[] {
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

export interface AssistantTurn {
  texts: string[]
  reads: TranscriptBlock[]
  edits: TranscriptBlock[]
  bashes: TranscriptBlock[]
  others: TranscriptBlock[]
  allBlocks: TranscriptBlock[]
}

export type GroupedTurnItem =
  | { kind: 'user'; msg: TranscriptMessage; startIndex: number }
  | { kind: 'turn'; turn: AssistantTurn; startIndex: number }

export function groupMessagesIntoTurns(messages: TranscriptMessage[]): GroupedTurnItem[] {
  const result: GroupedTurnItem[] = []
  let currentTurn: AssistantTurn | null = null
  let currentTurnStart = 0

  const flushTurn = () => {
    if (!currentTurn) return
    if (currentTurn.texts.length || currentTurn.allBlocks.length) {
      result.push({ kind: 'turn', turn: currentTurn, startIndex: currentTurnStart })
    }
    currentTurn = null
  }

  const newTurn = (): AssistantTurn => ({ texts: [], reads: [], edits: [], bashes: [], others: [], allBlocks: [] })

  for (let mi = 0; mi < messages.length; mi++) {
    const msg = messages[mi]
    if (msg.role === 'user') {
      flushTurn()
      result.push({ kind: 'user', msg, startIndex: mi })
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
      if (!currentTurn) { currentTurn = newTurn(); currentTurnStart = mi }
      currentTurn.texts.push(block.text)
    } else if (block.type === 'tool_use') {
      if (!currentTurn) { currentTurn = newTurn(); currentTurnStart = mi }
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

export function getToolDetail(name: string | null | undefined, input: Record<string, unknown> | null | undefined): string {
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

export function parseTextSegments(text: string): ParsedSegment[] {
  const segments: ParsedSegment[] = []
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
    let rest = text.slice(lastIndex).trim()
    rest = rest.replace(/^Read the output file to retrieve the result:\s*\S+\s*/m, '').trim()
    if (rest) segments.push({ kind: 'text', content: rest })
  }
  return segments
}

// ── Status style for task notifications ─────────────────────

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
  const { t } = useTranslation()
  const st = STATUS_STYLE[data.status] || STATUS_STYLE.completed
  return (
    <div className={styles.taskNotification} style={{ borderColor: st.color, background: st.bg }}>
      <div className={styles.taskNotifHeader}>
        <StatusCircle color={st.color} />
        <span className={styles.taskNotifTitle}>{t('admin.sessions.background_task')}</span>
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
  const { t } = useTranslation()
  return (
    <details className={styles.systemReminder}>
      <summary className={styles.systemReminderSummary}>{t('admin.sessions.system_reminder')}</summary>
      <div className={styles.systemReminderBody}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{data.content}</ReactMarkdown>
      </div>
    </details>
  )
}

// ── RichTextBlock ───────────────────────────────────────────

export function RichTextBlock({ text }: { text: string }) {
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

export function CopyButton({ text, className }: { text: string; className?: string }) {
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

// ── CollapsibleCode（代码块折叠） ────────────────────────────

const CODE_COLLAPSE_THRESHOLD = 8 // 超过 8 行可折叠

function CollapsibleCode({ html, raw, lang, lineCount }: {
  html?: string | null
  raw: string
  lang?: string
  lineCount: number
}) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(lineCount > CODE_COLLAPSE_THRESHOLD)
  const canCollapse = lineCount > CODE_COLLAPSE_THRESHOLD

  return (
    <div className={styles.codeWrap}>
      {canCollapse && (
        <div className={styles.codeHeader}>
          {lang && <span className={styles.codeLang}>{lang}</span>}
          <span className={styles.codeLines}>{t('admin.sessions.code_lines', { count: lineCount })}</span>
          <span style={{ flex: 1 }} />
          <CopyButton text={raw} />
          <button className={styles.codeToggle} onClick={() => setCollapsed(v => !v)}>
            {collapsed ? t('admin.sessions.code_expand') : t('admin.sessions.code_collapse')}
          </button>
        </div>
      )}
      {!canCollapse && (
        <div className={styles.codeHeader}>
          {lang && <span className={styles.codeLang}>{lang}</span>}
          <span style={{ flex: 1 }} />
          <CopyButton text={raw} />
        </div>
      )}
      {/* 代码内容 */}
      <div style={collapsed ? { maxHeight: 120, overflow: 'hidden', position: 'relative' } : undefined}>
        {html ? (
          <code className={`hljs ${styles.mdCodeBlock}`}
                dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <code className={styles.mdCodeBlockPlain}>{raw}</code>
        )}
        {collapsed && (
          <div className={styles.codeFade} onClick={() => setCollapsed(false)} />
        )}
      </div>
    </div>
  )
}

// ── Markdown components ─────────────────────────────────────

export const mdComponents: Components = {
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

      // ── Mermaid 图表 ──
      if (lang === 'mermaid') {
        return <MermaidBlock code={raw} />
      }

      let highlighted: string | null = null
      try {
        if (hljs.getLanguage(lang)) {
          highlighted = hljs.highlight(raw, { language: lang }).value
        } else {
          highlighted = hljs.highlightAuto(raw).value
        }
      } catch { /* fallback */ }
      const lineCount = raw.split('\n').length
      if (highlighted) {
        return <CollapsibleCode html={highlighted} raw={raw} lang={lang} lineCount={lineCount} />
      }
      return <CollapsibleCode raw={raw} lang={lang} lineCount={lineCount} />
    }
    // Multi-line without language → plain code block
    const raw = String(children).replace(/\n$/, '')
    if (raw.includes('\n')) {
      const lineCount = raw.split('\n').length
      return <CollapsibleCode raw={raw} lineCount={lineCount} />
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

function EditDiffView({ input, hideHeader }: { input: Record<string, unknown>; hideHeader?: boolean }) {
  const { t } = useTranslation()
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
      {!hideHeader && (
        <div className={styles.diffHeader}>
          {fileExtIcon(filePath, 14)}
          <span className={styles.diffFilePath} title={filePath}>{fileName}</span>
          <span style={{ flex: 1 }} />
          <span className={styles.diffStats}>
            {added > 0 && <span className={styles.diffStatsAdd}>+{added}</span>}
            {removed > 0 && <span className={styles.diffStatsDel}>{'\u2212'}{removed}</span>}
          </span>
        </div>
      )}
      <div className={styles.diffBody}>
        {lines.map((item, idx) => {
          if ('count' in item) {
            return (
              <div key={idx} className={styles.diffFold}>
                <span>{t('admin.sessions.unchanged_lines', { count: item.count })}</span>
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

// ── ReadFileView ────────────────────────────────────────────

function ReadFileView({ filePath, result, hideHeader }: { filePath: string; result: string; hideHeader?: boolean }) {
  const { t } = useTranslation()
  const stripped = stripLineNumbers(result)
  const lineCount = stripped.split('\n').length
  const lang = guessLang(filePath) || undefined
  const fileName = filePath.split('/').pop() || filePath

  const { html: highlighted } = useHighlight(stripped, lang)

  return (
    <div className={styles.readWrap}>
      {!hideHeader && (
        <div className={styles.readHeader}>
          {fileExtIcon(filePath, 14)}
          <span className={styles.readFilePath} title={filePath}>{fileName}</span>
          <span style={{ flex: 1 }} />
          <span className={styles.readLineCount}>{t('admin.sessions.code_lines', { count: lineCount })}</span>
        </div>
      )}
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
  const { t } = useTranslation()
  const question = String(input.question || '')

  return (
    <div className={styles.askWrap}>
      <div className={styles.askHeader}>
        <IconCircleHelp size={13} />
        <span className={styles.askTitle}>{t('admin.sessions.ask_user_question')}</span>
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

// ── OutputBlock (generic result with auto code detection) ───

function OutputBlock({ result, isError }: { result: string; isError: boolean }) {
  // 检测是否是代码内容（多行、有缩进、或包含代码特征）
  const looksLikeCode = useMemo(() => {
    const lines = result.split('\n')
    if (lines.length < 3) return false
    const codePatterns = /^(import |from |def |class |function |const |let |var |export |async |await |return |if |for |while |#include|package )/m
    return codePatterns.test(result)
  }, [result])

  const highlighted = useMemo(() => {
    if (!looksLikeCode) return null
    try {
      const auto = hljs.highlightAuto(result)
      if (auto.relevance > 3) return auto.value
    } catch { /* fall through */ }
    return null
  }, [result, looksLikeCode])

  return (
    <div className={styles.outputWrap} style={isError ? { borderColor: 'rgba(244,63,94,0.3)' } : undefined}>
      <div className={`${styles.outputBody} ${isError ? styles.outputBodyError : ''}`}>
        {highlighted ? (
          <pre className={`hljs ${styles.bashCardOutput}`}
               dangerouslySetInnerHTML={{ __html: highlighted }} />
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {result}
          </ReactMarkdown>
        )}
      </div>
    </div>
  )
}

// ── ToolWidget ──────────────────────────────────────────────

export function ToolWidget({ block }: { block: TranscriptBlock }) {
  const { t } = useTranslation()
  const signal = useContext(ExpandSignalCtx)
  const autoExpand = useContext(AutoExpandCtx)
  const toolName = block.tool_name || 'Tool'
  const isAskUserInit = toolName === 'AskUserQuestion'
  const [open, setOpen] = useState(autoExpand || isAskUserInit)
  const [mounted, setMounted] = useState(autoExpand || isAskUserInit)
  const toggle = useCallback(() => {
    setMounted(true)
    setOpen(v => !v)
  }, [])

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
      ? t('admin.sessions.code_lines', { count: block.tool_result!.split('\n').length })
      : isError
        ? 'error'
        : ''
    : ''

  return (
    <div className={styles.toolWidget}>
      <button
        onClick={canExpand ? toggle : undefined}
        className={`${styles.toolHeader} ${canExpand ? styles.toolHeaderClickable : ''}`}
      >
        <span className={styles.toolIcon}>{hasFilePath ? fileExtIcon(filePath, 14) : getToolIcon(toolName)}</span>
        {hasFilePath ? (
          <span className={styles.toolParam} title={filePath}>
            {fileName}
            {editInfo && <span className={styles.toolEditInfo}>{editInfo}</span>}
          </span>
        ) : detail ? (
          <code className={styles.toolParam}>{detail}</code>
        ) : (
          <span className={styles.toolName}>{t(`admin.sessions.tool_${toolName}`, { defaultValue: toolName })}</span>
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
      {mounted && (
        <div className={styles.toolBody} style={{ display: open ? 'block' : 'none' }}>
          {/* Edit: 直接渲染 diff 体，跳过 EditDiffView 的 header（ToolWidget header 已显示文件名） */}
          {!!hasEditData && <EditDiffView input={block.tool_input!} hideHeader />}
          {/* Bash: 直接输出内容，不再显示 $ command header */}
          {isBash && hasResult && (
            <pre className={`hljs ${styles.bashCardOutput} ${isError ? styles.bashCardOutputErr : ''}`}>
              {block.tool_result}
            </pre>
          )}
          {/* Read: 直接内容体，跳过 ReadFileView header */}
          {isRead && hasResult && <ReadFileView filePath={String(block.tool_input?.file_path ?? '')} result={block.tool_result!} hideHeader />}
          {isAgent && hasResult && <AgentResultView result={block.tool_result!} description={String(block.tool_input?.description ?? '')} />}
          {isAskUser && <AskUserQuestionView input={block.tool_input || {}} result={block.tool_result} />}
          {!isEdit && !isBash && !isRead && !isAgent && !isAskUser && hasResult && <OutputBlock result={block.tool_result!} isError={isError} />}
        </div>
      )}
    </div>
  )
}

// ── ReadGroupStrip (collapsed read-only tools) ──────────────

export function ReadGroupStrip({ blocks }: { blocks: TranscriptBlock[] }) {
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

export function ClaudeAvatar() {
  return (
    <div className={styles.avatarBot}><IconBot size={14} /></div>
  )
}

export function UserAvatar() {
  return (
    <div className={styles.avatarUser}><IconUser size={14} /></div>
  )
}

// ── Parse search results into file entries ──────────────────
function parseSearchResultFiles(result: string): { path: string; name: string }[] {
  if (!result) return []
  const lines = result.split('\n').filter(l => l.trim())
  const files: { path: string; name: string }[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    const match = line.match(/^(.+?\.\w+)(?::\d|$)/)
    const fp = match ? match[1].trim() : line.trim()
    if (!fp || seen.has(fp)) continue
    if (fp.includes('/') || fp.includes('.')) {
      seen.add(fp)
      files.push({ path: fp, name: fp.split('/').pop() || fp })
    }
  }
  return files
}

// ── ReadPillRow ─────────────────────────────────────────────

export function ReadPillRow({ blocks }: { blocks: TranscriptBlock[] }) {
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
              const lines = hasContent ? b.tool_result!.split('\n').length : 0
              return (
                <span
                  key={key}
                  className={`${styles.pill} ${isActive ? styles.pillActive : ''} ${hasContent ? styles.pillClickable : ''}`}
                  title={fp}
                  onClick={hasContent ? () => toggle(key) : undefined}
                >
                  <span className={styles.pillIcon}>{fileExtIcon(fp, 12)}</span>
                  <span className={styles.pillText}>{name}</span>
                  {lines > 0 && <span className={styles.pillBadge}>{lines}</span>}
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
  const { t } = useTranslation()
  const result = block.tool_result || ''
  const files = useMemo(() => parseSearchResultFiles(result), [result])

  if (toolType === 'r') {
    const filePath = String(block.tool_input?.file_path ?? '')
    return (
      <div className={styles.pillExpandedPanel}>
        <ReadFileView filePath={filePath} result={result} />
      </div>
    )
  }

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
          {files.length > 0 ? t('admin.sessions.files_count', { count: files.length }) : t('admin.sessions.lines_count', { count: resultLines.length })}
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

// ── EditInlineCard ──────────────────────────────────────────

export function EditInlineCard({ block }: { block: TranscriptBlock }) {
  const input = block.tool_input || {}
  const hasEditData = Boolean(input.old_string || input.new_string)
  const filePath = String(input.file_path || '')
  const fileName = filePath.split('/').pop() || filePath
  const [expanded, setExpanded] = useState(false)
  const [mounted, setMounted] = useState(false)

  // No diff data — just show file name + ✓
  if (!hasEditData) {
    return (
      <div className={styles.toolWidget}>
        <div className={styles.toolHeader}>
          <span className={styles.toolIcon}>{fileExtIcon(filePath, 14)}</span>
          <span className={styles.toolParam} title={filePath}>{fileName}</span>
          <span style={{ flex: 1 }} />
          <span className={`${styles.bashCardBadge} ${styles.bashCardPass}`}>{'\u2713'}</span>
        </div>
      </div>
    )
  }

  const handleToggle = () => {
    if (!mounted) setMounted(true)
    setExpanded(v => !v)
  }

  return (
    <div className={styles.toolWidget}>
      <button className={`${styles.toolHeader} ${styles.toolHeaderClickable}`} onClick={handleToggle}>
        <span className={styles.toolIcon}>{fileExtIcon(filePath, 14)}</span>
        <span className={styles.toolParam} title={filePath}>{fileName}</span>
        <span className={`${styles.bashCardBadge} ${styles.bashCardPass}`}>{'\u2713'}</span>
        <span className={styles.toolChevron} style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', marginLeft: 'auto' }}>
          ▶
        </span>
      </button>
      {mounted && (
        <div className={styles.toolBody} style={{ display: expanded ? 'block' : 'none' }}>
          <EditDiffView input={input} />
        </div>
      )}
    </div>
  )
}

// ── Guess best hljs language for command output ─────────────

function guessOutputLang(text: string, cmd: string): string | null {
  if (/^\s*[\[{]/.test(text) && /[\]}]\s*$/.test(text)) return 'json'
  if (/\.(ts|tsx|js|jsx)\(\d+,\d+\):\s*error/.test(text)) return 'typescript'
  if (/Traceback \(most recent call last\)/.test(text)) return 'python'
  if (/\b(def|class|import|from)\b.*:/.test(text)) return 'python'
  if (/\b(self|None|True|False)\b/.test(text) && /->/.test(text)) return 'python'
  if (/\b(tsc|eslint|tsx?)\b/.test(cmd)) return 'typescript'
  if (/\bpython|pip|pytest\b/.test(cmd)) return 'python'
  if (/\bcargo|rustc\b/.test(cmd)) return 'rust'
  if (/\bgo (build|test|run)\b/.test(cmd)) return 'go'
  if (/^\s*[\[{]/.test(text)) return 'json'
  return null
}

// Custom log highlighter for terminal output
function highlightLog(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/((?:\/[\w.@-]+)+(?:\.\w+)?(?:\(\d+[,:]?\d*\))?)/g, '<span class="hljs-string">$1</span>')
    .replace(/\b(error|Error|ERROR|fail|FAIL|failed|FAILED|fatal|FATAL)\b/g, '<span class="hljs-deletion">$1</span>')
    .replace(/\b(warning|Warning|WARN|warn|deprecated|DEPRECATED)\b/g, '<span class="hljs-comment">$1</span>')
    .replace(/\b(success|Success|SUCCESS|pass|PASS|passed|ok|OK|done|Done|DONE)\b/g, '<span class="hljs-addition">$1</span>')
    .replace(/\b(\d+(?:\.\d+)?(?:ms|s|m|KB|MB|GB|%)?)\b/g, '<span class="hljs-number">$1</span>')
    .replace(/'([^']{1,80})'/g, '\'<span class="hljs-string">$1</span>\'')
    .replace(/"([^"]{1,80})"/g, '"<span class="hljs-string">$1</span>"')
    .replace(/\b(TS\d{4,5})\b/g, '<span class="hljs-keyword">$1</span>')
}

// ── BashStatusLine ──────────────────────────────────────────

export function BashStatusLine({ block }: { block: TranscriptBlock }) {
  const { t } = useTranslation()
  const cmd = String(block.tool_input?.command ?? '')
  const shortCmd = cmd.replace(/^cd [^ ]+ && /, '').slice(0, 150)
  // 确保 result 是纯文本（去掉可能混入的 HTML 标签）
  const rawResult = (block.tool_result || '').trim()
  const result = rawResult.replace(/<[^>]*>/g, '')
  const isError = block.tool_error === true
  const hasError = isError || result.toLowerCase().includes('error') || result.toLowerCase().includes('fail')
  const noOutput = !result || result === '(Bash completed with no output)'

  const { html: cmdHtml } = useHighlight(shortCmd, 'bash')

  // Detect language from file extension or command
  const resultLang = useMemo(() => guessOutputLang(result, cmd), [result, cmd])
  const { html: resultHighlighted } = useHighlight(result || '', resultLang || undefined)
  // Apply terminal-style fallback coloring when no language was detected and worker returned plain escaped text
  const resultHtml = useMemo(() => {
    if (!result || noOutput) return null
    if (resultHighlighted) return resultHighlighted
    // fallback: terminal-style coloring on escaped text
    return highlightLog(result)
  }, [result, noOutput, resultHighlighted])

  const lineCount = result ? result.split('\n').length : 0

  return (
    <div className={styles.bashCard}>
      <div className={`${styles.bashCardHeader} ${hasError ? styles.bashCardHeaderErr : ''}`}>
        <span className={styles.bashCardIcon}>{getToolIcon('Bash', 12)}</span>
        <span className={styles.bashCardPrompt}>$</span>
        {cmdHtml ? (
          <code className={`hljs ${styles.bashCardCmd}`} dangerouslySetInnerHTML={{ __html: cmdHtml }} />
        ) : (
          <code className={styles.bashCardCmd}>{shortCmd}</code>
        )}
        {!noOutput && lineCount > 0 && (
          <span className={styles.bashCardLines}>{t('admin.sessions.bash_lines', { count: lineCount })}</span>
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

// ── UserCard ────────────────────────────────────────────────

export function UserCard({ msg }: { msg: TranscriptMessage }) {
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

// ── AssistantTurnCard ───────────────────────────────────────

export function AssistantTurnCard({ turn }: { turn: AssistantTurn }) {
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

export const MemoUserCard = memo(UserCard)
export const MemoAssistantTurnCard = memo(AssistantTurnCard)

// ── ChatMessageList ─────────────────────────────────────────

export interface ChatMessageListProps {
  messages: TranscriptMessage[]
  className?: string
}

export function ChatMessageList({ messages, className }: ChatMessageListProps) {
  const turns = useMemo(() => groupMessagesIntoTurns(messages), [messages])
  return (
    <div className={className}>
      {turns.map((item, i) =>
        item.kind === 'user' ? <UserCard key={i} msg={item.msg} /> : <AssistantTurnCard key={i} turn={item.turn} />
      )}
    </div>
  )
}
