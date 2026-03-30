/**
 * ChatTimeline — 共享会话消息渲染组件
 * 同时用于 /chat 页面和 FloatingAssistant
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { TranscriptMessage } from '../../lib/api/types'
import { parseTimelineWithQuestions, guessHljsLang, cleanSystemXml } from './timeline-parser'
import type { TimelineStep } from './timeline-parser'
import { RichTextBlock, CodeBlock, DiffBlock, fileExtIcon, CodeExpandCtx } from '../../components/ChatRenderer'
import {
  IconTerminal, IconWrench, IconMessage, IconFileText, IconPencil, IconFilePlus,
  IconSearch, IconFolder, IconBot, IconCircleHelp, IconGlobe, IconClipboard,
  IconChevronRight,
} from '../../ui/icon'
import s from './chat-report.module.css'
import '../../styles/hljs-ayu-dark.css'
import { useTranslation } from 'react-i18next'

export type { TimelineStep }
export { parseTimelineWithQuestions }

// ════════════════════════════════════
// 文件路径卡片渲染
// ════════════════════════════════════

const FILE_COLORS: Record<string, string> = {
  pdf: '#ef4444', doc: '#2563eb', docx: '#2563eb',
  xls: '#16a34a', xlsx: '#16a34a', csv: '#16a34a',
  ppt: '#ea580c', pptx: '#ea580c',
  txt: '#9ca3af', md: '#8b5cf6', mdx: '#8b5cf6',
  json: '#f59e0b', yaml: '#f59e0b', yml: '#f59e0b',
  js: '#f59e0b', jsx: '#60a5fa', ts: '#60a5fa', tsx: '#60a5fa',
  py: '#3b82f6', rb: '#ef4444', go: '#06b6d4', rs: '#ea580c',
  css: '#06b6d4', scss: '#ec4899', html: '#ea580c',
  svg: '#10b981', xml: '#f59e0b',
  zip: '#8b5cf6', tar: '#8b5cf6', gz: '#8b5cf6',
  mp4: '#ec4899', mov: '#ec4899', mp3: '#ec4899', wav: '#ec4899',
  sh: '#9ca3af',
}
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif', 'tiff'])

function fileColor(ext: string) { return FILE_COLORS[ext.toLowerCase()] ?? '#71717a' }

type MsgPart =
  | { kind: 'text'; content: string }
  | { kind: 'image'; path: string; ext: string }
  | { kind: 'file'; path: string; ext: string }

/** 从消息文本中提取文件路径，拆分为 text/image/file 片段
 *
 * 支持格式：
 *   [Image: source: /path/to/file.png]
 *   [image: /path/to/file.png]
 *   [IMAGE: source: data:image/png;base64,...]
 */
function parseFilePaths(text: string): MsgPart[] {
  // 快速检测：没有 [image: 前缀则直接返回
  if (!text.toLowerCase().includes('[image:')) return [{ kind: 'text', content: text }]

  const parts: MsgPart[] = []
  // 使用 /i 标志做大小写不敏感匹配，支持可选的 source: 前缀
  const re = /\[image\s*:\s*(?:source\s*:\s*)?([^\]]+)\]/gi
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index)
      if (before) parts.push({ kind: 'text', content: before })
    }
    const path = match[1].trim()
    const ext = (path.split('.').pop() ?? '').toLowerCase()
    if (path.startsWith('data:') || IMAGE_EXTS.has(ext)) {
      parts.push({ kind: 'image', path, ext: path.startsWith('data:') ? 'png' : ext })
    } else {
      parts.push({ kind: 'file', path, ext })
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    const rest = text.slice(lastIndex)
    if (rest) parts.push({ kind: 'text', content: rest })
  }
  return parts
}

function FileTypeSvgInline({ ext }: { ext: string }) {
  const color = fileColor(ext)
  const label = (ext || 'FILE').toUpperCase().slice(0, 4)
  return (
    <svg width="28" height="34" viewBox="0 0 28 34" fill="none" style={{ flexShrink: 0 }}>
      <path d="M2 0 H17 L26 9 V32 Q26 34 24 34 H4 Q2 34 2 32 Z" fill={color} fillOpacity="0.15" />
      <path d="M2 0 H17 L26 9 V32 Q26 34 24 34 H4 Q2 34 2 32 Z" stroke={color} strokeWidth="1" strokeOpacity="0.6" />
      <path d="M17 0 L17 9 L26 9" stroke={color} strokeWidth="1" strokeOpacity="0.6" fill="none" />
      <text x="14" y="26" textAnchor="middle" fontSize="6.5" fontWeight="800" fill={color} fontFamily="ui-monospace,monospace">{label}</text>
    </svg>
  )
}

function FolderSvgInline() {
  return (
    <svg width="38" height="32" viewBox="0 0 38 32" fill="none" style={{ flexShrink: 0 }}>
      <path d="M2 12 L2 8 Q2 6 4 6 L13 6 Q16 6 17 9 L18 12 Z" fill="#5ba4f5" />
      <rect x="2" y="11" width="34" height="19" rx="3" fill="#4b96e8" />
      <rect x="2" y="11" width="34" height="7" fill="#5ba4f5" />
      <rect x="2" y="16" width="34" height="2" fill="#4b96e8" />
    </svg>
  )
}

/** 消息中内嵌图片卡片 — data: URL 直接使用，本地路径通过 Tauri convertFileSrc 加载 */
function MsgImgCard({ path }: { path: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const name = path.startsWith('data:') ? '图片' : (path.split('/').pop() || path)
  useEffect(() => {
    if (path.startsWith('data:')) { setSrc(path); return }
    import('@tauri-apps/api/core').then(({ convertFileSrc }) => setSrc(convertFileSrc(path))).catch(() => setSrc(path))
  }, [path])
  return (
    <div className={s.msgImgCard}>
      {src
        ? <img src={src} alt={name} className={s.msgImgCardImg} />
        : <div className={s.msgImgCardPlaceholder}><IconFileText size={20} /></div>
      }
      <div className={s.msgCardBar}>
        <span className={s.msgCardName}>{name}</span>
        <span className={s.msgCardMeta}>图片</span>
      </div>
    </div>
  )
}

function MsgFileCard({ path, ext }: { path: string; ext: string }) {
  const name = path.split('/').pop() || path
  const color = fileColor(ext)
  return (
    <div className={s.msgFileCard}>
      {ext ? <FileTypeSvgInline ext={ext} /> : <FolderSvgInline />}
      <div className={s.msgCardMeta2}>
        <span className={s.msgCardName}>{name}</span>
        <span className={s.msgCardInfo} style={{ color }}>{ext.toUpperCase() || '文件'}</span>
      </div>
    </div>
  )
}

/** 后台任务完成通知横幅 — 独立于用户气泡显示 */
const NOTIF_STATUS: Record<string, { color: string; bg: string; icon: string }> = {
  completed: { color: '#3fb950', bg: 'rgba(63,185,80,0.06)', icon: '✓' },
  killed:    { color: '#d29922', bg: 'rgba(210,153,34,0.06)', icon: '⏹' },
  failed:    { color: '#f85149', bg: 'rgba(248,81,73,0.06)',  icon: '✕' },
  running:   { color: '#58a6ff', bg: 'rgba(88,166,255,0.06)', icon: '↻' },
}

function TaskNotifBanner({ status, summary, taskId }: { status: string; summary: string; taskId: string }) {
  const st = NOTIF_STATUS[status] ?? NOTIF_STATUS.completed
  return (
    <div className={s.taskNotifBanner} style={{ borderColor: st.color, background: st.bg }}>
      <span className={s.taskNotifIcon} style={{ color: st.color }}>{st.icon}</span>
      <span className={s.taskNotifSummary}>{summary}</span>
      <code className={s.taskNotifId}>{taskId}</code>
    </div>
  )
}

/** 本地命令执行横幅（/model, /help 等） */
function LocalCommandBanner({ command, stdout }: { command: string; stdout: string }) {
  // 清理 ANSI 转义序列
  const cleanStdout = stdout.replace(/\x1b\[[0-9;]*m/g, '').trim()
  return (
    <div className={s.localCmdBanner}>
      <code className={s.localCmdName}>{command}</code>
      {cleanStdout && <span className={s.localCmdStdout}>{cleanStdout}</span>}
    </div>
  )
}

/** 用户消息正文：文字 + 内嵌文件/图片卡片 */
function UserMsgBody({ text }: { text: string }) {
  const clean = stripDomContext(text)
  const parts = useMemo(() => parseFilePaths(clean), [clean])
  const hasFileParts = parts.some(p => p.kind !== 'text')

  if (!hasFileParts) {
    return <div className={s.richText}>{clean}</div>
  }

  const textOnly = parts.filter(p => p.kind === 'text').map(p => p.content).join('')
  const fileParts = parts.filter((p): p is Exclude<MsgPart, { kind: 'text' }> => p.kind !== 'text')

  return (
    <>
      {textOnly.trim() && <div className={s.richText}>{textOnly}</div>}
      <div className={s.msgFileRow}>
        {fileParts.map((p, i) =>
          p.kind === 'image'
            ? <MsgImgCard key={i} path={p.path} />
            : <MsgFileCard key={i} path={p.path} ext={p.ext} />
        )}
      </div>
    </>
  )
}

const COLLAPSE_THRESHOLD = 150

/** 用户消息行：带复制按钮 + 超长折叠，与 chat 页面样式一致 */
export function UserMsgRow({ rawText, children }: { rawText: string; children: React.ReactNode }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const needsCollapse = stripDomContext(rawText).length > COLLAPSE_THRESHOLD

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(rawText).catch(() => {
      const el = document.createElement('textarea')
      el.value = rawText
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    })
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [rawText])

  return (
    <div className={s.userMsgRow}>
      <button
        className={`${s.userCopyBtn} ${copied ? s.userCopyBtnDone : ''}`}
        onClick={handleCopy}
        title={t('chat_sidebar.copy_message')}
        tabIndex={-1}
      >
        {copied
          ? '\u2713'
          : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        }
      </button>
      <div className={s.queryPill}>
        <div className={needsCollapse && !expanded ? `${s.queryPillBody} ${s.queryPillBodyCollapsed}` : s.queryPillBody}>
          {children}
        </div>
        {needsCollapse && (
          <button className={s.queryPillExpandBtn} onClick={() => setExpanded(v => !v)}>
            {expanded ? t('chat_sidebar.collapse') : t('chat_sidebar.expand_all')}
          </button>
        )}
      </div>
    </div>
  )
}

// ── 样式常量（key 不变，label 通过 i18n 获取） ──
export const STYLE_KEYS = ['a', 'b', 'd', 'g', 'h'] as const
export type StyleKey = typeof STYLE_KEYS[number]

export function useStyleOptions() {
  const { t } = useTranslation()
  return useMemo(() => [
    { key: 'a' as StyleKey, label: t('chat_sidebar.style_a') },
    { key: 'b' as StyleKey, label: t('chat_sidebar.style_b') },
    { key: 'd' as StyleKey, label: t('chat_sidebar.style_d') },
    { key: 'g' as StyleKey, label: t('chat_sidebar.style_g') },
    { key: 'h' as StyleKey, label: t('chat_sidebar.style_h') },
  ], [t])
}

/** @deprecated 使用 buildToolLabelMap(t) 替代 */
export const STYLES = [
  { key: 'a', label: 'A 竖线时间线' },
  { key: 'b', label: 'B 卡片瀑布' },
  { key: 'd', label: 'D GitHub PR' },
  { key: 'g', label: 'G 气泡聊天' },
  { key: 'h', label: 'H 折叠手风琴' },
] as const

// ── Tool 标签映射构建函数 ──
export function buildToolLabelMap(t: (key: string) => string): Record<string, string> {
  return {
    Read: t('chat_sidebar.tool_read'), Write: t('chat_sidebar.tool_write'),
    Edit: t('chat_sidebar.tool_edit'), MultiEdit: t('chat_sidebar.tool_multi_edit'),
    Bash: t('chat_sidebar.tool_bash'), Grep: t('chat_sidebar.tool_grep'),
    Glob: t('chat_sidebar.tool_glob'), Agent: t('chat_sidebar.tool_agent'),
    AskUserQuestion: t('chat_sidebar.tool_ask'),
    WebSearch: t('chat_sidebar.tool_web_search'), WebFetch: t('chat_sidebar.tool_web_fetch'),
    ToolSearch: t('chat_sidebar.tool_search'), Skill: t('chat_sidebar.tool_skill'),
    TaskCreate: t('chat_sidebar.tool_task_create'), TaskUpdate: t('chat_sidebar.tool_task_update'),
    TaskList: t('chat_sidebar.tool_task_list'), TaskGet: t('chat_sidebar.tool_task_get'),
    TaskStop: t('chat_sidebar.tool_task_stop'),
  }
}

export function buildCatLabelMap(t: (key: string) => string): Record<string, string> {
  return {
    read: t('chat_sidebar.cat_read'), edit: t('chat_sidebar.cat_edit'),
    write: t('chat_sidebar.cat_write'), bash: t('chat_sidebar.cat_bash'),
    grep: t('chat_sidebar.cat_grep'), glob: t('chat_sidebar.cat_glob'),
    agent: t('chat_sidebar.cat_agent'), ask: t('chat_sidebar.cat_ask'),
    search: t('chat_sidebar.cat_search'), task: t('chat_sidebar.cat_task'),
    text: t('chat_sidebar.cat_text'), other: t('chat_sidebar.cat_other'),
  }
}

/** @deprecated 保留作向后兼容，新代码请用 buildToolLabelMap(t) */
export const TOOL_LABEL_MAP: Record<string, string> = {
  Read: '读取', Write: '写入', Edit: '编辑', MultiEdit: '多处编辑',
  Bash: '命令', Grep: '内容搜索', Glob: '文件匹配',
  Agent: '子代理', AskUserQuestion: '提问',
  WebSearch: '网络搜索', WebFetch: '获取网页',
  ToolSearch: '工具搜索', Skill: '执行技能',
  TaskCreate: '创建任务', TaskUpdate: '更新任务', TaskList: '任务列表',
  TaskGet: '获取任务', TaskStop: '停止任务',
}

/** @deprecated 保留作向后兼容 */
export const CAT_LABEL_MAP: Record<string, string> = {
  read: '读取', edit: '编辑', write: '写入', bash: '命令',
  grep: '内容搜索', glob: '文件匹配', agent: '子代理', ask: '提问',
  search: '网络搜索', task: '任务管理', text: '文本', other: '其他',
}

// ── badge class ──
export function badgeCls(cat: TimelineStep['category']): string {
  const map: Record<string, string> = {
    text: s.bText, read: s.bRead, edit: s.bEdit, write: s.bWrite,
    bash: s.bBash, grep: s.bGrep, glob: s.bGlob, agent: s.bAgent,
    ask: s.bAsk, search: s.bSearch, task: s.bTask, other: s.bOther,
  }
  return `${s.badge} ${map[cat] || s.bOther}`
}

export function badgeLabel(step: TimelineStep, toolMap: Record<string, string>, t: (key: string) => string): string {
  if (step.kind === 'text') return t('chat_sidebar.badge_text')
  const label = toolMap[step.toolName || ''] || step.toolName || t('chat_sidebar.badge_tool')
  return step.mergedCount && step.mergedCount > 1 ? `${label} ×${step.mergedCount}` : label
}

export function dotColor(cat: TimelineStep['category']): string {
  const style = getComputedStyle(document.documentElement)
  const varMap: Record<string, string> = {
    text:   '--tc-tool-text',
    read:   '--tc-tool-read',
    edit:   '--tc-tool-edit',
    write:  '--tc-tool-write',
    bash:   '--tc-tool-bash',
    grep:   '--tc-tool-grep',
    glob:   '--tc-tool-glob',
    agent:  '--tc-tool-agent',
    ask:    '--tc-tool-read',
    search: '--tc-tool-bash',
    task:   '--tc-tool-task',
    other:  '--tc-tool-other',
  }
  const varName = varMap[cat]
  if (varName) {
    const value = style.getPropertyValue(varName).trim()
    if (value) return value
  }
  return style.getPropertyValue('--tc-tool-other').trim() || '#71717a'
}

export function catIcon(cat: TimelineStep['category'], size = 12): React.ReactNode {
  const p = { size }
  const map: Record<string, React.ReactNode> = {
    text: <IconMessage {...p} />,
    read: <IconFileText {...p} />,
    edit: <IconPencil {...p} />,
    write: <IconFilePlus {...p} />,
    bash: <IconTerminal {...p} />,
    grep: <IconSearch {...p} />,
    glob: <IconFolder {...p} />,
    agent: <IconBot {...p} />,
    ask: <IconCircleHelp {...p} />,
    search: <IconGlobe {...p} />,
    task: <IconClipboard {...p} />,
    other: <IconWrench {...p} />,
  }
  return map[cat] ?? <IconWrench {...p} />
}

export function groupConsecutiveSameType(steps: TimelineStep[]): TimelineStep[] {
  const result: TimelineStep[] = []
  let i = 0
  while (i < steps.length) {
    const step = steps[i]
    if (step.kind !== 'tool') { result.push(step); i++; continue }
    let j = i + 1
    while (j < steps.length && steps[j].kind === 'tool' && steps[j].toolName === step.toolName) j++
    const count = j - i
    result.push(count > 1 ? { ...steps[i], mergedCount: count, mergedSteps: steps.slice(i, j) } : step)
    i = j
  }
  return result
}

// ── Result block ──
export function ResultBlock({ step }: { step: TimelineStep }) {
  if (step.mergedSteps && step.mergedSteps.length > 1) {
    return <>{step.mergedSteps.map(s => <SingleResultBlock key={s.id} step={s} />)}</>
  }
  return <SingleResultBlock step={step} />
}

function SingleResultBlock({ step }: { step: TimelineStep }) {
  const { t } = useTranslation()
  const toolMap = useMemo(() => buildToolLabelMap(t), [t])
  const catMap = useMemo(() => buildCatLabelMap(t), [t])
  const variant = 2 as const
  if (!step.toolResult && !step.oldString && step.category !== 'agent') return null

  const filePath = String(step.toolInput?.file_path || '')
  const fileName = filePath.split('/').pop() || ''
  const icon = filePath ? fileExtIcon(filePath, 13) : catIcon(step.category, 13)
  const action = toolMap[step.toolName || ''] || catMap[step.category] || step.toolName || t('chat_sidebar.badge_tool')
  const color = dotColor(step.category)

  if (step.category === 'edit') {
    const oldStr = String(step.toolInput?.old_string ?? step.oldString ?? '')
    const newStr = String(step.toolInput?.new_string ?? '')
    if (!oldStr && !newStr) return null
    return <DiffBlock oldStr={oldStr} newStr={newStr} filePath={filePath} icon={icon} action={action} pillColor={color} variant={variant} />
  }
  if (step.category === 'write' && step.toolInput?.content) {
    const lang = guessHljsLang(filePath) || undefined
    const raw = String(step.toolInput.content)
    const isMd = fileName?.toLowerCase().endsWith('.md')
    if (isMd) {
      return (
        <CodeBlock icon={icon} action={action} fileName={fileName} variant={variant} pillColor={color}>
          <RichTextBlock text={raw} />
        </CodeBlock>
      )
    }
    return <CodeBlock code={raw} lang={lang} icon={icon} action={action} fileName={fileName} variant={variant} pillColor={color} />
  }
  if (step.category === 'read' && step.toolResult) {
    const lang = guessHljsLang(filePath) || undefined
    const stripped = step.toolResult.replace(/^ *\d+[→\t]/gm, '')
    return <CodeBlock code={stripped} lang={lang} icon={icon} action={action} fileName={fileName} variant={variant} pillColor={color} />
  }
  if (step.category === 'agent') {
    const desc = String(step.toolInput?.description || step.toolDetail || '').slice(0, 80)
    const prompt = String(step.toolInput?.prompt || step.toolInput?.task || '')
    if (step.toolResult) {
      return (
        <CodeBlock code={step.toolResult} icon={icon} action={action} fileName={desc} variant={variant} pillColor={color}>
          <RichTextBlock text={step.toolResult} />
        </CodeBlock>
      )
    }
    if (prompt) {
      return (
        <CodeBlock icon={icon} action={action} fileName={desc} variant={variant} pillColor={color}>
          <RichTextBlock text={prompt} />
        </CodeBlock>
      )
    }
    return null
  }
  if (step.category === 'bash' && step.toolResult) {
    const cmd = String(step.toolInput?.command || '').slice(0, 80)
    return <CodeBlock code={step.toolResult} lang="bash" icon={icon} action={action} fileName={cmd} variant={variant} pillColor={color} />
  }
  if (step.toolResult) {
    const displayName = toolMap[step.toolName || ''] || step.toolName || ''
    return <CodeBlock code={step.toolResult} icon={icon} action={action} fileName={displayName} variant={variant} pillColor={color} />
  }
  return null
}

// ── Rich text ──
export function RichText({ text }: { text: string }) {
  const parts = useMemo(() => parseFilePaths(text), [text])
  const hasFileParts = parts.some(p => p.kind !== 'text')
  if (!hasFileParts) {
    return <div className={s.richText}><RichTextBlock text={text} /></div>
  }
  return (
    <div className={s.richText}>
      {parts.map((p, i) => {
        if (p.kind === 'text') return p.content ? <RichTextBlock key={i} text={p.content} /> : null
        if (p.kind === 'image') return <MsgImgCard key={i} path={p.path} />
        return <MsgFileCard key={i} path={p.path} ext={p.ext} />
      })}
    </div>
  )
}

// ════════════════════════════════════
// 样式渲染器
// ════════════════════════════════════

export function StyleA({ steps }: { steps: TimelineStep[] }) {
  const { t } = useTranslation()
  const toolMap = useMemo(() => buildToolLabelMap(t), [t])
  return (
    <div className={s.aTl}>
      {steps.map((step) => (
        <React.Fragment key={step.id}>
          <div className={s.aStep}>
            <span className={s.aDot} style={{ background: dotColor(step.category) }} />
            {step.kind === 'text' ? (
              <div className={s.aText}><RichText text={step.text!} /></div>
            ) : (
              <>
                {!step.toolResult && !step.oldString && (
                  <span className={badgeCls(step.category)} style={{ flexShrink: 0, alignSelf: 'flex-start' }}>{badgeLabel(step, toolMap, t)}</span>
                )}
                <ResultBlock step={step} />
              </>
            )}
          </div>
        </React.Fragment>
      ))}
    </div>
  )
}

export function StyleB({ steps }: { steps: TimelineStep[] }) {
  const { t } = useTranslation()
  const toolMap = useMemo(() => buildToolLabelMap(t), [t])
  return (
    <>
      {steps.map((step) => (
        <React.Fragment key={step.id}>
          {step.kind === 'text' ? (
            <div className={s.bTextCard}><div className={s.bBody}><RichText text={step.text!} /></div></div>
          ) : (
            <div>
              {!step.toolResult && !step.oldString && (
                <span className={badgeCls(step.category)}>{badgeLabel(step, toolMap, t)}</span>
              )}
              {(step.toolResult || step.oldString) && <ResultBlock step={step} />}
            </div>
          )}
        </React.Fragment>
      ))}
    </>
  )
}

export function StyleD({ steps }: { steps: TimelineStep[] }) {
  const { t } = useTranslation()
  const toolMap = useMemo(() => buildToolLabelMap(t), [t])
  return (
    <>
      {steps.map((step, i) => {
        const n = step.mergedCount && step.mergedCount > 1 ? ` ×${step.mergedCount}` : ''
        const catDesc = step.kind === 'text' ? t('chat_sidebar.cat_desc_text')
          : step.category === 'read' ? t('chat_sidebar.cat_desc_read', { n })
          : step.category === 'edit' ? t('chat_sidebar.cat_desc_edit', { n })
          : step.category === 'write' ? t('chat_sidebar.cat_desc_write', { n })
          : step.category === 'bash' ? t('chat_sidebar.cat_desc_bash', { n })
          : step.category === 'agent' ? t('chat_sidebar.cat_desc_agent', { n })
          : step.category === 'task' ? t('chat_sidebar.cat_desc_task', { action: toolMap[step.toolName || ''] || t('chat_sidebar.task_op'), n })
          : t('chat_sidebar.cat_desc_other', { n })
        return (
          <React.Fragment key={step.id}>
            {i > 0 && <div className={s.dConnector} />}
            <div className={`${s.dEvent} ${step.kind === 'text' ? s.dTextEvent : ''}`}>
              <div className={s.dHead}>
                <div className={`${s.dAvatar} ${step.kind === 'text' ? s.dAvatarClaude : s.dAvatarTool}`}>
                  {step.kind === 'text' ? 'C' : catIcon(step.category)}
                </div>
                <div className={s.dDesc}><strong>Claude</strong> {catDesc}</div>
              </div>
              {step.kind === 'text'
                ? <div className={s.dBody}><RichText text={step.text!} /></div>
                : (step.toolResult || step.oldString) ? <div className={s.dBody}><ResultBlock step={step} /></div> : null}
            </div>
          </React.Fragment>
        )
      })}
    </>
  )
}

export function StyleG({ steps }: { steps: TimelineStep[] }) {
  const { t } = useTranslation()
  const toolMap = useMemo(() => buildToolLabelMap(t), [t])
  return (
    <>
      {steps.map((step) => (
        <React.Fragment key={step.id}>
          <div className={s.gMsg}>
            <div className={`${s.gAvatar} ${step.kind === 'text' ? s.gAvatarClaude : s.gAvatarTool}`} style={{ position: 'relative' }}>
              {step.kind === 'text' ? 'C' : catIcon(step.category)}
              {step.kind === 'tool' && step.mergedCount && step.mergedCount > 1 && (
                <span style={{ position: 'absolute', top: -5, right: -5, fontSize: 8, fontWeight: 700, background: 'var(--tc-accent)', color: 'var(--tc-accent-fg)', borderRadius: 4, padding: '0 3px', lineHeight: '13px', pointerEvents: 'none' }}>
                  ×{step.mergedCount}
                </span>
              )}
            </div>
            {step.kind === 'text' ? (
              <div className={s.gBubbleText}><RichText text={step.text!} /></div>
            ) : (
              <div className={s.gBubbleTool}>
                {!step.toolResult && !step.oldString && (
                  <span className={badgeCls(step.category)}>{badgeLabel(step, toolMap, t)}</span>
                )}
                <ResultBlock step={step} />
              </div>
            )}
          </div>
        </React.Fragment>
      ))}
    </>
  )
}

export function StyleH({ steps }: { steps: TimelineStep[] }) {
  const { t } = useTranslation()
  const toolMap = useMemo(() => buildToolLabelMap(t), [t])
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    const set = new Set<string>()
    steps.forEach(st => { if (st.kind === 'text') set.add(st.id) })
    return set
  })
  const toggle = useCallback((id: string) => {
    setOpenIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }, [])

  return (
    <>
      {steps.map((step) => {
        const isOpen = openIds.has(step.id)
        return (
          <React.Fragment key={step.id}>
            {step.kind === 'text' ? (
              <div className={s.chatAiBlock}><RichText text={step.text!} /></div>
            ) : (
              <div className={s.hAcc}>
                <div className={s.hHead} onClick={() => toggle(step.id)}>
                  <span className={s.hChevron} style={{ transform: isOpen ? 'rotate(90deg)' : undefined, display: 'flex' }}><IconChevronRight size={12} /></span>
                  <span className={badgeCls(step.category)}>{badgeLabel(step, toolMap, t)}</span>
                </div>
                {isOpen && (step.category === 'agent' || step.toolResult || step.oldString || step.mergedSteps?.some(ms => ms.toolResult || ms.oldString)) && (
                  <div className={s.hBody}><ResultBlock step={step} /></div>
                )}
              </div>
            )}
          </React.Fragment>
        )
      })}
    </>
  )
}

export const RENDERERS: Record<StyleKey, React.FC<{ steps: TimelineStep[] }>> = {
  a: StyleA, b: StyleB, d: StyleD, g: StyleG, h: StyleH,
}

// ════════════════════════════════════
// 统一入口组件
// ════════════════════════════════════
const LS_KEY = 'tc_chat_style'
const getDefaultStyle = (): StyleKey => (localStorage.getItem(LS_KEY) as StyleKey) || 'a'

/** 移除用户消息中附加的 DOM 上下文和系统 XML 标签 */
function stripDomContext(text: string): string {
  const cleaned = cleanSystemXml(text)
  const i1 = cleaned.indexOf('\n\n【元素 #')
  const i2 = cleaned.indexOf('--- 问题元素')
  const candidates = [i1, i2].filter(i => i !== -1)
  if (candidates.length === 0) return cleaned
  return cleaned.slice(0, Math.min(...candidates)).trim()
}

/** 将 messages 分段：user 气泡 / assistant steps / notification / local-command 交替出现 */
type Segment =
  | { type: 'user'; text: string; ts: string | null }
  | { type: 'assistant'; steps: TimelineStep[] }
  | { type: 'notification'; status: string; summary: string; taskId: string; ts: string | null }
  | { type: 'local-command'; command: string; stdout: string; ts: string | null }

/** 从用户消息中提取 task-notification，返回 { notifications, remainingText } */
function extractTaskNotifications(text: string) {
  const notifications: { status: string; summary: string; taskId: string }[] = []
  const re = /<task-notification>([\s\S]*?)<\/task-notification>/g
  const cleaned = text.replace(re, (_, xml: string) => {
    const extractTag = (t: string) => new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(xml)?.[1]?.trim() ?? ''
    notifications.push({
      status: extractTag('status'),
      summary: extractTag('summary'),
      taskId: extractTag('task-id'),
    })
    return ''
  })
  // 清理 "Read the output file..." 这类自动追加的提示文本
  const remaining = cleaned
    .replace(/Read the output file to retrieve the result:\s*\S+/g, '')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<[^>]+>/g, '')
    .trim()
  return { notifications, remainingText: remaining }
}

/** 从用户消息中提取本地命令信息，返回 { command, stdout, remainingText } */
function extractLocalCommand(text: string) {
  const hasCaveat = /<local-command-caveat>/.test(text)
  if (!hasCaveat) return null
  const cmdMatch = /<command-name>([\s\S]*?)<\/command-name>/.exec(text)
  const stdoutMatch = /<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/.exec(text)
  const command = cmdMatch?.[1]?.trim() ?? ''
  const stdout = stdoutMatch?.[1]?.trim() ?? ''
  // 清除所有系统 XML 块
  const remaining = text
    .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '')
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, '')
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
    .replace(/<command-args>[\s\S]*?<\/command-args>/g, '')
    .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, '')
    .replace(/<[^>]+>/g, '')
    .trim()
  return { command, stdout, remainingText: remaining }
}

function splitSegments(messages: TranscriptMessage[]): Segment[] {
  const segs: Segment[] = []
  let buf: TimelineStep[] = []
  let stepId = 0

  const flushBuf = () => {
    if (buf.length) { segs.push({ type: 'assistant', steps: groupConsecutiveSameType(buf) }); buf = [] }
  }

  for (const msg of messages) {
    if (msg.role === 'user') {
      flushBuf()
      const rawText = msg.blocks.find(b => b.type === 'text')?.text?.trim()
      if (!rawText) continue
      const text = stripDomContext(rawText)

      // 检测 local-command-caveat（本地命令，如 /model、/help）
      const localCmd = extractLocalCommand(text)
      if (localCmd) {
        if (localCmd.command || localCmd.stdout) {
          segs.push({ type: 'local-command', command: localCmd.command, stdout: localCmd.stdout, ts: msg.ts ?? null })
        }
        if (localCmd.remainingText) segs.push({ type: 'user', text: localCmd.remainingText, ts: msg.ts ?? null })
      }
      // 检测 task-notification XML
      else if (/<task-notification>/.test(text)) {
        const { notifications, remainingText } = extractTaskNotifications(text)
        for (const n of notifications) {
          segs.push({ type: 'notification', status: n.status, summary: n.summary, taskId: n.taskId, ts: msg.ts ?? null })
        }
        if (remainingText) segs.push({ type: 'user', text: remainingText, ts: msg.ts ?? null })
      } else {
        if (text) segs.push({ type: 'user', text, ts: msg.ts ?? null })
      }
    } else {
      // 复用 parseTimelineWithQuestions 的 block→step 逻辑
      const { steps } = parseTimelineWithQuestions([msg])
      steps.forEach(st => buf.push({ ...st, id: `seg-${stepId++}` }))
    }
  }
  flushBuf()
  return segs
}

interface ChatTimelineProps {
  messages: TranscriptMessage[]
  /** 流式输出中的当前回复文本 */
  currentReply?: string
  /** 固定样式，不传则从 localStorage 读取 */
  style?: StyleKey
}

export function ChatTimeline({ messages, currentReply, style }: ChatTimelineProps) {
  const activeStyle = style ?? getDefaultStyle()
  const Renderer = RENDERERS[activeStyle] ?? StyleA

  const segments = splitSegments(messages)

  // 流式输出追加为末尾 assistant 块
  const streamingStep: TimelineStep | null = currentReply
    ? { id: '__streaming__', kind: 'text', ts: null, text: currentReply, category: 'text' }
    : null

  return (
    <CodeExpandCtx.Provider value={false}>
      {segments.map((seg, i) =>
        seg.type === 'user' ? (
          <div key={i} className={s.turnSection}>
            <UserMsgRow rawText={seg.text}>
              <UserMsgBody text={seg.text} />
            </UserMsgRow>
          </div>
        ) :seg.type === 'notification' ? (
          <TaskNotifBanner key={i} status={seg.status} summary={seg.summary} taskId={seg.taskId} />
        ) : seg.type === 'local-command' ? (
          <LocalCommandBanner key={i} command={seg.command} stdout={seg.stdout} />
        ) : (
          <Renderer key={i} steps={seg.steps} />
        )
      )}
      {streamingStep && (
        <div className={s.chatAiBlock}>
          <RichText text={streamingStep.text!} />
        </div>
      )}
    </CodeExpandCtx.Provider>
  )
}
