// ChatReportPage — 会话操作时间线，8 种可切换样式
import React, { useCallback, useEffect, useMemo, useRef, useState, createContext, useContext } from 'react'
import { api } from '../../lib/api'
import type { AiSession, TranscriptMessage } from '../../lib/api/types'
import { parseTimelineWithQuestions, formatTs, guessHljsLang, type TimelineStep, type UserQuestion } from './timeline-parser'
import { Select } from '../../ui/select'
import { RichTextBlock, CodeBlock, DiffBlock, fileExtIcon, CodeExpandCtx } from '../../components/ChatRenderer'
import {
  IconTerminal, IconWrench, IconMessage, IconFileText, IconPencil, IconFilePlus,
  IconSearch, IconFolder, IconBot, IconCircleHelp, IconGlobe, IconClipboard,
  IconChevronRight, IconX,
} from '../../ui/icon'
import '../../styles/hljs-ayu-dark.css'
import s from './chat-report.module.css'

// ── 样式常量 ──
const STYLES = [
  { key: 'a', label: 'A 竖线时间线' },
  { key: 'b', label: 'B 卡片瀑布' },
  { key: 'd', label: 'D GitHub PR' },
  { key: 'g', label: 'G 气泡聊天' },
  { key: 'h', label: 'H 折叠手风琴' },
] as const
type StyleKey = typeof STYLES[number]['key']

const LS_KEY = 'tc_chat_style'
const getDefaultStyle = (): StyleKey => (localStorage.getItem(LS_KEY) as StyleKey) || 'a'

// ── badge class ──
function badgeCls(cat: TimelineStep['category']): string {
  const map: Record<string, string> = {
    text: s.bText, read: s.bRead, edit: s.bEdit, write: s.bWrite,
    bash: s.bBash, grep: s.bGrep, glob: s.bGlob, agent: s.bAgent,
    ask: s.bAsk, search: s.bSearch, task: s.bTask, other: s.bOther,
  }
  return `${s.badge} ${map[cat] || s.bOther}`
}

const TOOL_LABEL_MAP: Record<string, string> = {
  TaskCreate: '创建任务', TaskUpdate: '更新任务', TaskList: '任务列表',
  TaskGet: '获取任务', TaskStop: '停止任务',
}

const CAT_LABEL_MAP: Record<string, string> = {
  read: 'Read', edit: 'Edit', write: 'Write', bash: 'Bash',
  grep: 'Grep', glob: 'Glob', agent: 'Agent', ask: 'Ask',
  search: 'Search', task: '任务管理', text: '文本', other: '其他',
}

function badgeLabel(step: TimelineStep): string {
  if (step.kind === 'text') return 'text'
  const label = TOOL_LABEL_MAP[step.toolName || ''] || step.toolName || 'Tool'
  return step.mergedCount && step.mergedCount > 1 ? `${label} ×${step.mergedCount}` : label
}

// 工具类型圆点颜色——通过读取 CSS 变量获取，与 global.css 中 --tc-tool-* 保持一致
function dotColor(cat: TimelineStep['category']): string {
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

function catIcon(cat: TimelineStep['category'], size = 12): React.ReactNode {
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

const ACTION_MAP: Record<string, string> = {
  read: 'Read', edit: 'Edit', write: 'Write', bash: 'Bash', agent: 'Agent',
  task: 'Task',
}

/** 将相邻同 toolName 的 tool 步骤合并为 1，用 mergedCount 标记数量 */
function groupConsecutiveSameType(steps: TimelineStep[]): TimelineStep[] {
  const result: TimelineStep[] = []
  let i = 0
  while (i < steps.length) {
    const step = steps[i]
    if (step.kind !== 'tool') { result.push(step); i++; continue }
    let j = i + 1
    while (j < steps.length && steps[j].kind === 'tool' && steps[j].toolName === step.toolName) j++
    const count = j - i
    result.push(count > 1 ? { ...steps[j - 1], mergedCount: count } : step)
    i = j
  }
  return result
}

// ── Code/Result block ──
function ResultBlock({ step }: { step: TimelineStep }) {
  const variant = 2 as const
  if (!step.toolResult && !step.oldString) return null

  const filePath = String(step.toolInput?.file_path || '')
  const fileName = filePath.split('/').pop() || ''
  const icon = filePath ? fileExtIcon(filePath, 13) : catIcon(step.category, 13)
  const action = ACTION_MAP[step.category] || step.toolName || 'Tool'
  const color = dotColor(step.category)

  // Edit — LCS diff
  if (step.category === 'edit') {
    const oldStr = String(step.toolInput?.old_string ?? step.oldString ?? '')
    const newStr = String(step.toolInput?.new_string ?? '')
    if (!oldStr && !newStr) return null
    return <DiffBlock oldStr={oldStr} newStr={newStr} filePath={filePath} icon={icon} action={action} pillColor={color} variant={variant} />
  }

  // Write
  if (step.category === 'write' && step.toolInput?.content) {
    const lang = guessHljsLang(filePath) || undefined
    const raw = String(step.toolInput.content)
    const preview = raw.slice(0, 800) + (raw.length > 800 ? '\n...' : '')
    return <CodeBlock code={preview} lang={lang} icon={icon} action={action} fileName={fileName} variant={variant} pillColor={color} />
  }

  // Read
  if (step.category === 'read' && step.toolResult) {
    const lang = guessHljsLang(filePath) || undefined
    const stripped = step.toolResult.replace(/^ *\d+[→\t]/gm, '')
    return <CodeBlock code={stripped} lang={lang} icon={icon} action={action} fileName={fileName} variant={variant} pillColor={color} />
  }

  // Agent — 统一 CodeBlock 外框 + RichTextBlock 内容
  if (step.category === 'agent' && step.toolResult) {
    const desc = String(step.toolInput?.description || step.toolDetail || '').slice(0, 80)
    return (
      <CodeBlock icon={icon} action={action} fileName={desc} variant={variant} pillColor={color}>
        <RichTextBlock text={step.toolResult} />
      </CodeBlock>
    )
  }

  // Bash
  if (step.category === 'bash' && step.toolResult) {
    const cmd = String(step.toolInput?.command || '').slice(0, 80)
    return <CodeBlock code={step.toolResult} lang="bash" icon={icon} action={action} fileName={cmd} variant={variant} pillColor={color} />
  }

  // Generic
  if (step.toolResult) {
    const displayName = TOOL_LABEL_MAP[step.toolName || ''] || step.toolName || ''
    return <CodeBlock code={step.toolResult} icon={icon} action={action} fileName={displayName} variant={variant} pillColor={color} />
  }

  return null
}

// ── Rich text — 复用 ChatRenderer 的 Markdown 渲染 ──
function RichText({ text }: { text: string }) {
  return <div className={s.richText}><RichTextBlock text={text} /></div>
}

// ── 检查上下文 ──
const InspectCtx = createContext<{ selected: string | null; onSelect: (step: TimelineStep, index: number) => void }>({ selected: null, onSelect: () => {} })

function StepWrap({ step, index, children }: { step: TimelineStep; index: number; children: React.ReactNode }) {
  const { selected, onSelect } = useContext(InspectCtx)
  const isActive = selected === step.id
  return (
    <div
      data-step={index + 1}
      onClick={(e) => { e.stopPropagation(); onSelect(step, index) }}
      style={{
        position: 'relative', cursor: 'pointer',
        outline: isActive ? '1px solid var(--tc-accent)' : undefined,
        outlineOffset: 2, borderRadius: 6,
      }}
    >
      <span style={{
        position: 'absolute', left: -4, top: -4, fontSize: 9, fontWeight: 700,
        background: isActive ? 'var(--tc-accent)' : 'var(--tc-sidebar-bg)',
        color: isActive ? 'var(--tc-accent-fg)' : 'var(--tc-foreground-secondary)',
        border: '1px solid var(--tc-border)',
        borderRadius: 8, padding: '0 4px', zIndex: 2,
        fontFamily: 'var(--tc-font-mono)',
      }}>{index + 1}</span>
      {children}
    </div>
  )
}


// ════════════════════════════════════════════════
// 样式渲染器
// ════════════════════════════════════════════════

function StyleA({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className={s.aTl}>
      {steps.map((step, i) => (
        <StepWrap key={step.id} step={step} index={i}>
          <div className={s.aStep}>
            <span className={s.aDot} style={{ background: dotColor(step.category) }} />
            {step.kind === 'text' ? (
              <div className={s.aText}><RichText text={step.text!} /></div>
            ) : (
              <ResultBlock step={step} />
            )}
          </div>
        </StepWrap>
      ))}
    </div>
  )
}

function StyleB({ steps }: { steps: TimelineStep[] }) {
  return (
    <>
      {steps.map((step, i) => (
        <StepWrap key={step.id} step={step} index={i}>
          {step.kind === 'text' ? (
            <div className={s.bTextCard}><div className={s.bBody}><RichText text={step.text!} /></div></div>
          ) : (step.toolResult || step.oldString) ? (
            <ResultBlock step={step} />
          ) : null}
        </StepWrap>
      ))}
    </>
  )
}


function StyleD({ steps }: { steps: TimelineStep[] }) {
  return (
    <>
      {steps.map((step, i) => {
        const n = step.mergedCount && step.mergedCount > 1 ? ` ×${step.mergedCount}` : ''
        const catDesc = step.kind === 'text' ? '说：'
          : step.category === 'read' ? `读取了文件${n}` : step.category === 'edit' ? `编辑了文件${n}` : step.category === 'write' ? `新建了文件${n}` : step.category === 'bash' ? `执行了命令${n}` : step.category === 'agent' ? `启动了子代理${n}` : step.category === 'task' ? `执行了${TOOL_LABEL_MAP[step.toolName || ''] || '任务操作'}${n}` : `调用了工具${n}`
        return (
          <StepWrap key={step.id} step={step} index={i}>
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
          </StepWrap>
        )
      })}
    </>
  )
}


function StyleG({ steps }: { steps: TimelineStep[] }) {
  return (
    <>
      {steps.map((step, i) => (
        <StepWrap key={step.id} step={step} index={i}>
          <div className={s.gMsg}>
            <div className={`${s.gAvatar} ${step.kind === 'text' ? s.gAvatarClaude : s.gAvatarTool}`}>
              {step.kind === 'text' ? 'C' : catIcon(step.category)}
            </div>
            {step.kind === 'text' ? (
              <div className={s.gBubbleText}><RichText text={step.text!} /></div>
            ) : (
              <div className={s.gBubbleTool}><ResultBlock step={step} /></div>
            )}
          </div>
        </StepWrap>
      ))}
    </>
  )
}

function StyleH({ steps }: { steps: TimelineStep[] }) {
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
      {steps.map((step, i) => {
        const isOpen = openIds.has(step.id)
        return (
          <StepWrap key={step.id} step={step} index={i}>
            <div className={s.hAcc}>
              <div className={s.hHead} onClick={() => toggle(step.id)}>
                <span className={s.hChevron} style={{ transform: isOpen ? 'rotate(90deg)' : undefined, display: 'flex' }}><IconChevronRight size={12} /></span>
                <span className={badgeCls(step.category)}>{badgeLabel(step)}</span>
                {step.kind === 'text' && <span className={s.hTitle}>{step.text?.slice(0, 60)}</span>}
              </div>
              {isOpen && step.kind === 'text' && (
                <div className={s.hBody}><RichText text={step.text!} /></div>
              )}
              {isOpen && step.kind === 'tool' && (step.toolResult || step.oldString) && (
                <div className={s.hBody}><ResultBlock step={step} /></div>
              )}
            </div>
          </StepWrap>
        )
      })}
    </>
  )
}

const RENDERERS: Record<StyleKey, React.FC<{ steps: TimelineStep[] }>> = {
  a: StyleA, b: StyleB, d: StyleD, g: StyleG, h: StyleH,
}

// ── Right sidebar ──
function MetaSidebar({ session, steps, questions, activeQ, codeExpanded, onToggleCode }: {
  session: AiSession | null; steps: TimelineStep[]; questions: UserQuestion[]; activeQ: number
  codeExpanded: boolean; onToggleCode: () => void
}) {
  const qNavRef = useRef<HTMLDivElement>(null)

  // 联动：activeQ 变化时自动滚动导航列表
  useEffect(() => {
    const container = qNavRef.current
    if (!container) return
    const activeEl = container.children[activeQ] as HTMLElement | undefined
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [activeQ])

  const toolSteps = useMemo(() => steps.filter(st => st.kind === 'tool'), [steps])
  const cats = useMemo(() => {
    const m: Record<string, number> = {}
    toolSteps.forEach(st => { m[st.category] = (m[st.category] || 0) + 1 })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [toolSteps])

  const duration = useMemo(() => {
    if (!session?.started_at || !session?.last_seen_at) return ''
    const start = new Date(session.started_at).getTime()
    const end = new Date(session.last_seen_at).getTime()
    const diff = Math.round((end - start) / 1000)
    if (diff < 60) return `${diff}s`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`
  }, [session?.started_at, session?.last_seen_at])

  const fileStats = useMemo(() => {
    const readFiles = new Set<string>()
    const editFiles = new Set<string>()
    const newFiles = new Set<string>()
    for (const st of toolSteps) {
      const fp = String(st.toolInput?.file_path || '')
      if (!fp) continue
      if (st.category === 'read') readFiles.add(fp)
      else if (st.category === 'edit') editFiles.add(fp)
      else if (st.category === 'write') newFiles.add(fp)
    }
    return { read: readFiles.size, edit: editFiles.size, write: newFiles.size }
  }, [toolSteps])

  if (!session) return null

  return (
    <div className={s.sidebar}>
      {/* 会话元数据 */}
      <div className={s.sbSection}>
        <div className={s.sbTitle}>会话元数据</div>
        <div className={s.sbRow}><span className={s.sbKey}>会话 ID</span><span className={s.sbVal}>{session.session_id.slice(0, 8)}</span></div>
        <div className={s.sbRow}><span className={s.sbKey}>状态</span><span className={s.sbVal} style={{ color: session.status === 'active' ? '#4ade80' : session.status === 'stopped' ? '#f87171' : undefined }}>● {session.status || 'unknown'}</span></div>
        <div className={s.sbRow}><span className={s.sbKey}>模型</span><span className={s.sbVal}>claude-opus-4-6</span></div>
        <div className={s.sbRow}><span className={s.sbKey}>开始</span><span className={s.sbVal}>{formatTs(session.started_at)}</span></div>
        <div className={s.sbRow}><span className={s.sbKey}>结束</span><span className={s.sbVal}>{formatTs(session.last_seen_at || '')}</span></div>
        {duration && <div className={s.sbRow}><span className={s.sbKey}>耗时</span><span className={s.sbVal}>{duration}</span></div>}
        {session.cwd && <div className={s.sbRow}><span className={s.sbKey}>工作目录</span><span className={s.sbVal} style={{ fontSize: 9 }}>{session.cwd.split('/').pop()}</span></div>}
        {session.cwd && <div className={s.sbRow}><span className={s.sbKey}>Git 分支</span><span className={s.sbVal}>master</span></div>}
      </div>

      {/* 问题导航 */}
      {questions.length > 0 && (
        <>
          <hr className={s.sbDivider} />
          <div className={s.sbSection}>
            <div className={s.sbTitle} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>问题导航 ({questions.length})</span>
              <span style={{ flex: 1 }} />
              <span className={s.expandToggleWrap}>
                <button
                  className={s.expandToggle}
                  style={{ background: codeExpanded ? 'var(--tc-border-active)' : 'var(--tc-panel-bg)' }}
                  onClick={onToggleCode}
                >
                  <span className={s.expandDot} style={{ left: codeExpanded ? 'calc(100% - 12px)' : '2px' }} />
                </button>
              </span>
            </div>
            <div className={s.qNav} ref={qNavRef}>
              {questions.map((q, i) => (
                <a
                  key={q.id}
                  className={`${s.qNavItem} ${i === activeQ ? s.qNavActive : ''}`}
                  href={`#question-${i}`}
                  onClick={e => {
                    e.preventDefault()
                    document.getElementById(`question-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                >
                  <span className={s.qNavNum}>Q{i + 1}</span>
                  <span className={s.qNavText}>{q.text}</span>
                </a>
              ))}
            </div>
          </div>
        </>
      )}

      <hr className={s.sbDivider} />

      {/* 操作统计 */}
      <div className={s.sbSection}>
        <div className={s.sbTitle}>操作统计</div>
        <div className={s.sbRow}><span className={s.sbKey}>工具调用</span><span className={s.sbVal}>{toolSteps.length}</span></div>
        <div className={s.sbRow}><span className={s.sbKey}>文本输出</span><span className={s.sbVal}>{steps.length - toolSteps.length} 段</span></div>
        {cats.map(([cat, count]) => (
          <div key={cat} className={s.sbRow}>
            <span className={s.sbKey}>{CAT_LABEL_MAP[cat] || cat}</span>
            <span className={s.sbVal} style={{ color: dotColor(cat as TimelineStep['category']) }}>{count}</span>
          </div>
        ))}
      </div>

      <hr className={s.sbDivider} />

      {/* 涉及文件 */}
      <div className={s.sbSection}>
        <div className={s.sbTitle}>涉及文件</div>
        <div className={s.sbRow}><span className={s.sbKey} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><IconFileText size={11} /> 读取</span><span className={s.sbVal}>{fileStats.read} 文件</span></div>
        <div className={s.sbRow}><span className={s.sbKey} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><IconPencil size={11} /> 修改</span><span className={s.sbVal}>{fileStats.edit} 文件</span></div>
        <div className={s.sbRow}><span className={s.sbKey} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><IconFilePlus size={11} /> 新建</span><span className={s.sbVal}>{fileStats.write} 文件</span></div>
      </div>

      <hr className={s.sbDivider} />

      {/* 推荐任务 */}
      <div className={s.sbSection}>
        <div className={s.sbTitle}>推荐任务</div>
        <div className={s.sbTasks}>
          <div className={s.sbTask}>优化 UserCard 气泡样式</div>
          <div className={s.sbTask}>改进 BashStatusLine 高亮</div>
          <div className={s.sbTask}>添加 Read pill 动画</div>
          <div className={s.sbTask}>实现 Mermaid 缩放</div>
        </div>
      </div>

      <hr className={s.sbDivider} />

      {/* 推荐问题 */}
      <div className={s.sbSection}>
        <div className={s.sbTitle}>推荐问题</div>
        <ul className={s.sbQuestions}>
          <li className={s.sbQuestion}>哪种类型最需要优先改进？</li>
          <li className={s.sbQuestion}>Edit diff 需要 side-by-side？</li>
          <li className={s.sbQuestion}>Bash 支持 ANSI 颜色码？</li>
          <li className={s.sbQuestion}>AskUser 选项需要键盘导航？</li>
        </ul>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════
// Main page
// ════════════════════════════════════════════════
// ── 时间格式化（相对时间） ──
function relativeTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z')
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
  if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)}天前`
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// ── 会话行渲染（Notion 表格风格：圆点 | 标题 | 事件数 | 时间） ──
function SessionItem(option: { value: string; label: string; desc?: string }) {
  const parts = (option.desc || '').split('|')
  const status = parts[0] || ''
  const events = parts[1] || ''
  const time = parts[2] || ''
  const dotBg = status === 'active' ? '#56d364' : status === 'idle' ? '#e3b341' : '#8b949e'

  return (
    <>
      <span style={{ width: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotBg }} />
      </span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, fontWeight: 500 }}>{option.label}</span>
      <span style={{ width: 30, flexShrink: 0, textAlign: 'right', fontSize: 10, fontFamily: "'Geist Mono', monospace", color: 'var(--tc-foreground-secondary)' }}>{events}</span>
      <span style={{ width: 50, flexShrink: 0, textAlign: 'right', fontSize: 9, color: 'var(--tc-foreground-secondary)' }}>{time}</span>
    </>
  )
}

export default function ChatReportPage() {
  const [sessions, setSessions] = useState<AiSession[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [style, setStyle] = useState<StyleKey>(getDefaultStyle)
  const [inspected, setInspected] = useState<{ step: TimelineStep; index: number } | null>(null)
  const [activeQ, setActiveQ] = useState(0)
  const [codeExpanded, setCodeExpanded] = useState(false)
  const mainAreaRef = useRef<HTMLDivElement>(null)

  // 获取当前项目 cwd
  const [projectCwd, setProjectCwd] = useState<string | undefined>()
  useEffect(() => {
    const pid = localStorage.getItem('tc_active_project')
    if (!pid) return
    api.getProjects().then(list => {
      const proj = list.find(p => String(p.id) === pid)
      if (proj?.repo_url) setProjectCwd(proj.repo_url)
    }).catch(() => {})
  }, [])

  // 获取会话列表并按项目过滤
  useEffect(() => {
    api.getSessions().then(list => {
      const filtered = projectCwd ? list.filter(ss => ss.cwd === projectCwd) : list
      setSessions(filtered)
      if (filtered.length > 0 && !selectedId) setSelectedId(filtered[0].session_id)
    }).catch(() => {})
  }, [projectCwd]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    setInspected(null)
    api.getTranscript(selectedId, { limit: 200, offset: 0 }).then(res => {
      setTranscript(res.messages)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [selectedId])

  const { steps, questions } = useMemo(() => parseTimelineWithQuestions(transcript), [transcript])
  const selectedSession = sessions.find(ss => ss.session_id === selectedId) ?? null

  const handleInspect = useCallback((step: TimelineStep, index: number) => {
    setInspected(prev => prev?.step.id === step.id ? null : { step, index })
  }, [])

  const inspectCtx = useMemo(() => ({
    selected: inspected?.step.id ?? null,
    onSelect: handleInspect,
  }), [inspected, handleInspect])

  // IntersectionObserver：滚动时自动高亮当前可见的问题
  useEffect(() => {
    if (questions.length === 0 || !mainAreaRef.current) return
    const root = mainAreaRef.current
    const els = questions.map((_, i) => document.getElementById(`question-${i}`)).filter(Boolean) as HTMLElement[]
    if (els.length === 0) return
    const ob = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) {
          const idx = els.indexOf(e.target as HTMLElement)
          if (idx >= 0) setActiveQ(idx)
        }
      }
    }, { root, rootMargin: '-10% 0px -70% 0px', threshold: 0 })
    els.forEach(el => ob.observe(el))
    return () => ob.disconnect()
  }, [questions])

  const Renderer = RENDERERS[style]

  return (
    <div className={s.page}>
      <div className={s.topBar}>
        <span className={s.topLabel}>会话</span>
        <Select
          options={sessions.map(ss => ({
            value: ss.session_id,
            label: ss.summary || ss.session_id.slice(0, 8),
            desc: `${ss.status || ''}|${ss.event_count}|${relativeTime(ss.last_seen_at || ss.started_at)}|${ss.cwd?.split('/').pop() || ''}`,
          }))}
          value={selectedId || ''}
          onChange={setSelectedId}
          placeholder="选择会话"
          searchable
          searchPlaceholder="搜索会话..."
          wide
          renderItem={SessionItem}
          style={{ flex: 1, minWidth: 0 }}
        />
        <span className={s.topLabel} style={{ marginLeft: 'auto' }}>样式</span>
        <Select
          options={STYLES.map(st => ({ value: st.key, label: st.label }))}
          value={style}
          onChange={v => { setStyle(v as StyleKey); localStorage.setItem(LS_KEY, v) }}
          style={{ minWidth: 140 }}
        />
      </div>

      <div className={s.body}>
        <div className={s.mainArea} ref={mainAreaRef}>
          <CodeExpandCtx.Provider value={codeExpanded}>
          <InspectCtx.Provider value={inspectCtx}>
            {loading ? (
              <div className={s.empty}><span>加载中...</span></div>
            ) : steps.length === 0 ? (
              <div className={s.empty}><span className={s.emptyIcon}>💬</span><span>选择一个会话查看操作时间线</span></div>
            ) : questions.length === 0 ? (
              <Renderer steps={groupConsecutiveSameType(steps)} />
            ) : (
              questions.map((q, qi) => {
                const nextQ = questions[qi + 1]
                const startIdx = q.stepIndex
                const endIdx = nextQ ? nextQ.stepIndex : steps.length
                const sectionSteps = groupConsecutiveSameType(steps.slice(startIdx, endIdx))
                return (
                  <div key={q.id} id={`question-${qi}`} className={s.turnSection}>
                    <div className={s.queryPill}>
<div className={s.richText}><RichTextBlock text={q.text} /></div>
                    </div>
                    {sectionSteps.length > 0 && <Renderer steps={sectionSteps} />}
                  </div>
                )
              })
            )}
          </InspectCtx.Provider>
          </CodeExpandCtx.Provider>

          {/* 底部操作栏 */}
          {steps.length > 0 && (
            <div className={s.bottomBar}>
              <div className={s.bottomActions}>
                <button className={s.actionBtn}>♡ 收藏</button>
                <button className={s.actionBtn}>↗ 分享</button>
                <button className={s.actionBtn}>↻ 重写</button>
                <button className={s.actionBtn} onClick={() => {
                  const allText = steps.filter(st => st.kind === 'text').map(st => st.text).join('\n\n')
                  navigator.clipboard.writeText(allText)
                }}><IconClipboard size={12} /> 复制</button>
                <span className={s.actionDots}>⋯</span>
              </div>
              <div className={s.followUpWrap}>
                <span className={s.followUpIcon}>@</span>
                <input className={s.followUpInput} placeholder="输入追问..." />
                <button className={s.sendBtn}>↑</button>
              </div>
            </div>
          )}

          {inspected && (
            <div className={s.inspectPanel}>
              <div className={s.inspectHeader}>
                <span className={s.inspectNum}>#{inspected.index + 1}</span>
                <span className={badgeCls(inspected.step.category)}>{badgeLabel(inspected.step)}</span>
                <span className={s.inspectTitle}>
                  {inspected.step.kind === 'text' ? inspected.step.text?.slice(0, 50) + '...' : inspected.step.toolDetail}
                </span>
                <button className={s.inspectCopy} onClick={() => {
                  const info = `步骤 #${inspected.index + 1} [${inspected.step.category}] ${inspected.step.kind === 'text' ? '文本' : inspected.step.toolName}: ${inspected.step.kind === 'text' ? inspected.step.text?.slice(0, 80) : inspected.step.toolDetail}`
                  navigator.clipboard.writeText(info)
                }}><IconClipboard size={12} /> 复制信息</button>
                <button className={s.inspectClose} onClick={() => setInspected(null)}><IconX size={12} /></button>
              </div>
              <div className={s.inspectBody}>
                <span>类型: <b>{CAT_LABEL_MAP[inspected.step.category] || inspected.step.category}</b></span>
                {inspected.step.toolName && <span> · 工具: <b>{TOOL_LABEL_MAP[inspected.step.toolName] || inspected.step.toolName}</b></span>}
                {inspected.step.ts && <span> · 时间: <b>{formatTs(inspected.step.ts)}</b></span>}
                {inspected.step.toolError && <span style={{ color: '#f87171' }}> · ERROR</span>}
                {inspected.step.toolInput?.file_path != null && <span> · 文件: <b>{String(inspected.step.toolInput.file_path).split('/').pop()}</b></span>}
                <span style={{ marginLeft: 8, color: 'var(--tc-foreground-secondary)', fontSize: 10 }}>点击复制后告诉 Claude: "步骤 #{inspected.index + 1} 有问题"</span>
              </div>
            </div>
          )}
        </div>
        <MetaSidebar session={selectedSession} steps={steps} questions={questions} activeQ={activeQ} codeExpanded={codeExpanded} onToggleCode={() => setCodeExpanded(v => !v)} />
      </div>
    </div>
  )
}
