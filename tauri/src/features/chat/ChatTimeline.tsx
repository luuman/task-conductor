/**
 * ChatTimeline — 共享会话消息渲染组件
 * 同时用于 /chat 页面和 FloatingAssistant
 */
import React, { useCallback, useState } from 'react'
import type { TranscriptMessage } from '../../lib/api/types'
import { parseTimelineWithQuestions, guessHljsLang } from './timeline-parser'
import type { TimelineStep } from './timeline-parser'
import { RichTextBlock, CodeBlock, DiffBlock, fileExtIcon, CodeExpandCtx } from '../../components/ChatRenderer'
import {
  IconTerminal, IconWrench, IconMessage, IconFileText, IconPencil, IconFilePlus,
  IconSearch, IconFolder, IconBot, IconCircleHelp, IconGlobe, IconClipboard,
  IconChevronRight,
} from '../../ui/icon'
import s from './chat-report.module.css'
import '../../styles/hljs-ayu-dark.css'

export type { TimelineStep }
export { parseTimelineWithQuestions }

// ── 样式常量 ──
export const STYLES = [
  { key: 'a', label: 'A 竖线时间线' },
  { key: 'b', label: 'B 卡片瀑布' },
  { key: 'd', label: 'D GitHub PR' },
  { key: 'g', label: 'G 气泡聊天' },
  { key: 'h', label: 'H 折叠手风琴' },
] as const
export type StyleKey = typeof STYLES[number]['key']

// ── Tool 标签映射 ──
export const TOOL_LABEL_MAP: Record<string, string> = {
  Read: '读取', Write: '写入', Edit: '编辑', MultiEdit: '多处编辑',
  Bash: '命令', Grep: '内容搜索', Glob: '文件匹配',
  Agent: '子代理', AskUserQuestion: '提问',
  WebSearch: '网络搜索', WebFetch: '获取网页',
  ToolSearch: '工具搜索', Skill: '执行技能',
  TaskCreate: '创建任务', TaskUpdate: '更新任务', TaskList: '任务列表',
  TaskGet: '获取任务', TaskStop: '停止任务',
}

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

export function badgeLabel(step: TimelineStep): string {
  if (step.kind === 'text') return '文本'
  const label = TOOL_LABEL_MAP[step.toolName || ''] || step.toolName || '工具'
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
  const variant = 2 as const
  if (!step.toolResult && !step.oldString) return null

  const filePath = String(step.toolInput?.file_path || '')
  const fileName = filePath.split('/').pop() || ''
  const icon = filePath ? fileExtIcon(filePath, 13) : catIcon(step.category, 13)
  const action = TOOL_LABEL_MAP[step.toolName || ''] || CAT_LABEL_MAP[step.category] || step.toolName || '工具'
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
    const preview = raw.slice(0, 800) + (raw.length > 800 ? '\n...' : '')
    return <CodeBlock code={preview} lang={lang} icon={icon} action={action} fileName={fileName} variant={variant} pillColor={color} />
  }
  if (step.category === 'read' && step.toolResult) {
    const lang = guessHljsLang(filePath) || undefined
    const stripped = step.toolResult.replace(/^ *\d+[→\t]/gm, '')
    return <CodeBlock code={stripped} lang={lang} icon={icon} action={action} fileName={fileName} variant={variant} pillColor={color} />
  }
  if (step.category === 'agent' && step.toolResult) {
    const desc = String(step.toolInput?.description || step.toolDetail || '').slice(0, 80)
    return (
      <CodeBlock icon={icon} action={action} fileName={desc} variant={variant} pillColor={color}>
        <RichTextBlock text={step.toolResult} />
      </CodeBlock>
    )
  }
  if (step.category === 'bash' && step.toolResult) {
    const cmd = String(step.toolInput?.command || '').slice(0, 80)
    return <CodeBlock code={step.toolResult} lang="bash" icon={icon} action={action} fileName={cmd} variant={variant} pillColor={color} />
  }
  if (step.toolResult) {
    const displayName = TOOL_LABEL_MAP[step.toolName || ''] || step.toolName || ''
    return <CodeBlock code={step.toolResult} icon={icon} action={action} fileName={displayName} variant={variant} pillColor={color} />
  }
  return null
}

// ── Rich text ──
export function RichText({ text }: { text: string }) {
  return <div className={s.richText}><RichTextBlock text={text} /></div>
}

// ════════════════════════════════════
// 样式渲染器
// ════════════════════════════════════

export function StyleA({ steps }: { steps: TimelineStep[] }) {
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
                  <span className={badgeCls(step.category)} style={{ flexShrink: 0, alignSelf: 'flex-start' }}>{badgeLabel(step)}</span>
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
  return (
    <>
      {steps.map((step) => (
        <React.Fragment key={step.id}>
          {step.kind === 'text' ? (
            <div className={s.bTextCard}><div className={s.bBody}><RichText text={step.text!} /></div></div>
          ) : (
            <div>
              {!step.toolResult && !step.oldString && (
                <span className={badgeCls(step.category)}>{badgeLabel(step)}</span>
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
  return (
    <>
      {steps.map((step, i) => {
        const n = step.mergedCount && step.mergedCount > 1 ? ` ×${step.mergedCount}` : ''
        const catDesc = step.kind === 'text' ? '说：'
          : step.category === 'read' ? `读取了文件${n}` : step.category === 'edit' ? `编辑了文件${n}` : step.category === 'write' ? `新建了文件${n}` : step.category === 'bash' ? `执行了命令${n}` : step.category === 'agent' ? `启动了子代理${n}` : step.category === 'task' ? `执行了${TOOL_LABEL_MAP[step.toolName || ''] || '任务操作'}${n}` : `调用了工具${n}`
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
                  <span className={badgeCls(step.category)}>{badgeLabel(step)}</span>
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
              <RichText text={step.text!} />
            ) : (
              <div className={s.hAcc}>
                <div className={s.hHead} onClick={() => toggle(step.id)}>
                  <span className={s.hChevron} style={{ transform: isOpen ? 'rotate(90deg)' : undefined, display: 'flex' }}><IconChevronRight size={12} /></span>
                  <span className={badgeCls(step.category)}>{badgeLabel(step)}</span>
                </div>
                {isOpen && (step.toolResult || step.oldString || step.mergedSteps?.some(ms => ms.toolResult || ms.oldString)) && (
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

/** 将 messages 分段：user 气泡 / assistant steps 块交替出现 */
type Segment =
  | { type: 'user'; text: string; ts: string | null }
  | { type: 'assistant'; steps: TimelineStep[] }

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
      const text = msg.blocks.find(b => b.type === 'text')?.text?.trim()
      if (text) segs.push({ type: 'user', text, ts: msg.ts ?? null })
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
            <div className={s.queryPill}>
              <div className={s.richText}>{seg.text}</div>
            </div>
          </div>
        ) : (
          <Renderer key={i} steps={seg.steps} />
        )
      )}
      {streamingStep && (
        <div className={s.chatAiBlock}>
          <div className={s.richText}>{streamingStep.text}</div>
        </div>
      )}
    </CodeExpandCtx.Provider>
  )
}
