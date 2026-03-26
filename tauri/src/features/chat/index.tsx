// ChatReportPage — 会话操作时间线，8 种可切换样式
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../../lib/api'
import type { AiSession, TranscriptMessage } from '../../lib/api/types'
import { useChatStore } from '../../lib/store/chat'
import { parseTimelineWithQuestions, formatTs, guessHljsLang, type TimelineStep, type UserQuestion } from './timeline-parser'
import { RichText as ImageAwareRichText } from './ChatTimeline'
import { Select } from '../../ui/select'
import { RichTextBlock, CodeBlock, DiffBlock, fileExtIcon, CodeExpandCtx } from '../../components/ChatRenderer'
import {
  IconTerminal, IconWrench, IconMessage, IconFileText, IconPencil, IconFilePlus,
  IconSearch, IconFolder, IconBot, IconCircleHelp, IconGlobe, IconClipboard,
  IconChevronRight,
} from '../../ui/icon'
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
import { useSessionData } from '../../components/SessionChat/useSessionData'
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
  Read: '读取', Write: '写入', Edit: '编辑', MultiEdit: '多处编辑',
  Bash: '命令', Grep: '内容搜索', Glob: '文件匹配',
  Agent: '子代理', AskUserQuestion: '提问',
  WebSearch: '网络搜索', WebFetch: '获取网页',
  ToolSearch: '工具搜索', Skill: '执行技能',
  TaskCreate: '创建任务', TaskUpdate: '更新任务', TaskList: '任务列表',
  TaskGet: '获取任务', TaskStop: '停止任务',
}

const CAT_LABEL_MAP: Record<string, string> = {
  read: '读取', edit: '编辑', write: '写入', bash: '命令',
  grep: '内容搜索', glob: '文件匹配', agent: '子代理', ask: '提问',
  search: '网络搜索', task: '任务管理', text: '文本', other: '其他',
}

function badgeLabel(step: TimelineStep): string {
  if (step.kind === 'text') return '文本'
  const label = TOOL_LABEL_MAP[step.toolName || ''] || step.toolName || '工具'
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
    result.push(count > 1 ? { ...steps[i], mergedCount: count, mergedSteps: steps.slice(i, j) } : step)
    i = j
  }
  return result
}

// ── Code/Result block ──
function ResultBlock({ step }: { step: TimelineStep }) {
  if (step.mergedSteps && step.mergedSteps.length > 1) {
    return (
      <>
        {step.mergedSteps.map(s => <SingleResultBlock key={s.id} step={s} />)}
      </>
    )
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



// ════════════════════════════════════════════════
// 样式渲染器
// ════════════════════════════════════════════════

function StyleA({ steps }: { steps: TimelineStep[] }) {
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

function StyleB({ steps }: { steps: TimelineStep[] }) {
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


function StyleD({ steps }: { steps: TimelineStep[] }) {
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


function StyleG({ steps }: { steps: TimelineStep[] }) {
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
                {isOpen && (step.toolResult || step.oldString || step.mergedSteps?.some(s => s.toolResult || s.oldString)) && (
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

const RENDERERS: Record<StyleKey, React.FC<{ steps: TimelineStep[] }>> = {
  a: StyleA, b: StyleB, d: StyleD, g: StyleG, h: StyleH,
}

// ── Right sidebar ──
function MetaSidebar({ session, steps, questions, activeQ, codeExpanded, onToggleCode, onScrollToQuestion }: {
  session: AiSession | null; steps: TimelineStep[]; questions: UserQuestion[]; activeQ: number
  codeExpanded: boolean; onToggleCode: () => void; onScrollToQuestion?: (qi: number) => void
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
      
      {/* 问题导航 */}
      {questions.length > 0 && (
        <>
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
                  href="#"
                  onClick={e => {
                    e.preventDefault()
                    onScrollToQuestion?.(i)
                  }}
                >
                  <span className={s.qNavNum}>Q{i + 1}</span>
                  <span className={s.qNavText}>{stripDomContext(q.text)}</span>
                </a>
              ))}
            </div>
          </div>
        </>
      )}

    

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

        <hr className={s.sbDivider} />

      {/* 会话元数据 */}
      <div className={s.sbSection}>
        <div className={s.sbTitle}>会话元数据</div>
        <div className={s.sbRow}><span className={s.sbKey}>会话 ID</span><span className={s.sbVal}>{session.session_id.slice(0, 8)}</span></div>
        <div className={s.sbRow}><span className={s.sbKey}>状态</span><span className={s.sbVal} style={{ color: session.status === 'active' ? '#4ade80' : session.status === 'stopped' ? '#f87171' : undefined }}>● {session.status || '未知'}</span></div>
        <div className={s.sbRow}><span className={s.sbKey}>模型</span><span className={s.sbVal}>claude-opus-4-6</span></div>
        <div className={s.sbRow}><span className={s.sbKey}>开始</span><span className={s.sbVal}>{formatTs(session.started_at)}</span></div>
        <div className={s.sbRow}><span className={s.sbKey}>结束</span><span className={s.sbVal}>{formatTs(session.last_seen_at || '')}</span></div>
        {duration && <div className={s.sbRow}><span className={s.sbKey}>耗时</span><span className={s.sbVal}>{duration}</span></div>}
        {session.cwd && <div className={s.sbRow}><span className={s.sbKey}>工作目录</span><span className={s.sbVal} style={{ fontSize: 9 }}>{session.cwd.split('/').pop()}</span></div>}
        {session.cwd && <div className={s.sbRow}><span className={s.sbKey}>Git 分支</span><span className={s.sbVal}>master</span></div>}
      </div>

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
    </div>
  )
}

// ════════════════════════════════════════════════
// 用户消息行（含 hover 复制按钮）
// ════════════════════════════════════════════════
function UserMsgRow({ rawText, children }: { rawText: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false)

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
        title="复制消息"
        tabIndex={-1}
      >
        {copied
          ? '\u2713'
          : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        }
      </button>
      <div className={s.queryPill}>{children}</div>
    </div>
  )
}

// ════════════════════════════════════════════════
// 选词浮动工具栏
// ════════════════════════════════════════════════
function SelectionToolbar({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [selText, setSelText] = useState('')
  const [copied, setCopied] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleMouseUp() {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) { setPos(null); return }
      const text = sel.toString().trim()
      if (!text) { setPos(null); return }
      const container = containerRef.current
      if (!container) { setPos(null); return }
      const range = sel.getRangeAt(0)
      if (!container.contains(range.commonAncestorContainer)) { setPos(null); return }
      const rect = range.getBoundingClientRect()
      setSelText(text)
      setCopied(false)
      setPos({ x: rect.left + rect.width / 2, y: rect.top })
    }

    function handleMouseDown(e: MouseEvent) {
      if (toolbarRef.current?.contains(e.target as Node)) return
      setPos(null)
      setCopied(false)
    }

    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [containerRef])

  if (!pos) return null

  const handleCopy = () => {
    navigator.clipboard.writeText(selText).catch(() => {
      const el = document.createElement('textarea')
      el.value = selText
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    })
    setCopied(true)
    setTimeout(() => { setPos(null); setCopied(false) }, 1200)
  }

  return createPortal(
    <div
      ref={toolbarRef}
      className={s.selToolbar}
      style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, calc(-100% - 10px))' }}
      onMouseDown={e => e.preventDefault()}
    >
      <button className={`${s.selBtn} ${copied ? s.selBtnCopied : ''}`} onClick={handleCopy} tabIndex={-1}>
        {copied ? '✓ 已复制' : '复制'}
      </button>
    </div>,
    document.body
  )
}

// ════════════════════════════════════════════════
// Main page
// ════════════════════════════════════════════════
function stripDomContext(text: string): string {
  const i1 = text.indexOf('\n\n【元素 #')
  const i2 = text.indexOf('--- 问题元素')
  const candidates = [i1, i2].filter(i => i !== -1)
  if (candidates.length === 0) return text
  return text.slice(0, Math.min(...candidates)).trim()
}

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

import { PromptInput } from './PromptInput'

// Virtuoso 虚拟列表项类型
type VItem =
  | { kind: 'user'; key: string; qi: number; question: UserQuestion }
  | { kind: 'steps'; key: string; steps: TimelineStep[] }

export default function ChatReportPage() {
  const [style, setStyle] = useState<StyleKey>(getDefaultStyle)
  const [activeQ, setActiveQ] = useState(0)
  const [codeExpanded, setCodeExpanded] = useState(false)
  const mainAreaRef = useRef<HTMLDivElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const virtuosoRef = useRef<VirtuosoHandle>(null)

  // AI 对话状态（与 FloatingAssistant 共享同一 store）
  const { messages: chatMessages, currentReply, isGenerating } = useChatStore()

  const makeAiMsg = (role: 'user' | 'assistant', text: string): TranscriptMessage => ({
    role, ts: new Date().toISOString(), blocks: [{ type: 'text', text }],
  })

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

  // 使用 useSessionData 统一管理分页加载 + WS 实时更新
  const {
    sessions, selectedId, selectSession,
    transcript, transcriptLoading: loading,
    loadMore, hasMore,
  } = useSessionData({ filterByCwd: projectCwd })

  // 自动选中第一个会话
  useEffect(() => {
    if (sessions.length > 0 && !selectedId) {
      selectSession(sessions[0].session_id)
    }
  }, [sessions, selectedId, selectSession])

  const { steps, questions } = useMemo(() => parseTimelineWithQuestions(transcript), [transcript])
  const selectedSession = sessions.find(ss => ss.session_id === selectedId) ?? null

  // 构建虚拟列表项：每个用户问题和每组工具步骤各为一项
  const vitems = useMemo<VItem[]>(() => {
    if (steps.length === 0) return []
    if (questions.length === 0) {
      return groupConsecutiveSameType(steps).map((step, i) => ({
        kind: 'steps' as const, key: `s-${i}`, steps: [step],
      }))
    }
    const result: VItem[] = []
    questions.forEach((q, qi) => {
      result.push({ kind: 'user', key: `q-${qi}`, qi, question: q })
      const nextQ = questions[qi + 1]
      const startIdx = q.stepIndex
      const endIdx = nextQ ? nextQ.stepIndex : steps.length
      groupConsecutiveSameType(steps.slice(startIdx, endIdx)).forEach((step, si) => {
        result.push({ kind: 'steps', key: `q${qi}-s${si}`, steps: [step] })
      })
    })
    return result
  }, [steps, questions])

  // 问题在虚拟列表中的索引映射
  const questionVirtuosoIndices = useMemo(() =>
    vitems.reduce<number[]>((acc, item, i) => {
      if (item.kind === 'user') acc.push(i)
      return acc
    }, []),
    [vitems],
  )

  // 滚动时自动高亮当前可见的问题
  const handleRangeChanged = useCallback(({ startIndex }: { startIndex: number; endIndex: number }) => {
    for (let i = questionVirtuosoIndices.length - 1; i >= 0; i--) {
      if (questionVirtuosoIndices[i] <= startIndex) {
        setActiveQ(i)
        break
      }
    }
  }, [questionVirtuosoIndices])

  // 问题导航跳转
  const scrollToQuestion = useCallback((qi: number) => {
    const vIdx = questionVirtuosoIndices[qi]
    if (vIdx != null) {
      virtuosoRef.current?.scrollToIndex({ index: vIdx, align: 'start', behavior: 'smooth' })
    }
  }, [questionVirtuosoIndices])

  // 新对话消息到达时滚动到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, currentReply])

  const chatDisplayMessages = currentReply
    ? [...chatMessages, makeAiMsg('assistant', currentReply)]
    : chatMessages

  const Renderer = RENDERERS[style]

  // Virtuoso Footer: AI 对话区
  const VirtuosoFooter = useCallback(() => {
    if (chatDisplayMessages.length === 0) return null
    return (
      <div className={s.chatSection}>
        <div className={s.chatSectionDivider}>
          <span>以下为 AI 对话</span>
        </div>
        {chatDisplayMessages.map((msg, i) => {
          const raw = msg.blocks.filter(b => b.type === 'text').map(b => b.text ?? '').join('\n').trim()
          const text = msg.role === 'user' ? stripDomContext(raw) : raw
          if (!text) return null
          return (
            <div key={i} className={msg.role === 'user' ? s.turnSection : undefined}>
              {msg.role === 'user' ? (
                <UserMsgRow rawText={raw}>
                  <ImageAwareRichText text={stripDomContext(raw)} />
                </UserMsgRow>
              ) : (
                <div className={s.chatAiBlock}>
                  <div className={s.richText}><RichTextBlock text={text} /></div>
                </div>
              )}
            </div>
          )
        })}
        {isGenerating && !currentReply && (
          <div className={s.pThinking}>
            <span className={s.pThinkingDot} />
            <span>思考中...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
    )
  }, [chatDisplayMessages, isGenerating, currentReply])

  return (
    <div className={s.page}>
      <div className={s.topBar}>
        <span className={s.topLabel}>会话</span>
        <Select
          options={sessions.map(ss => ({
            value: ss.session_id,
            label: stripDomContext(ss.summary || ss.session_id.slice(0, 8)),
            desc: `${ss.status || ''}|${ss.event_count}|${relativeTime(ss.last_seen_at || ss.started_at)}|${ss.cwd?.split('/').pop() || ''}`,
          }))}
          value={selectedId || ''}
          onChange={v => selectSession(v)}
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

      <SelectionToolbar containerRef={mainAreaRef} />
      <div className={s.body}>
        <div className={s.mainCol}>
          <div className={s.mainArea} ref={mainAreaRef} style={{ overflow: 'hidden', padding: 0 }}>
            <CodeExpandCtx.Provider value={codeExpanded}>
              {loading ? (
                <div className={s.empty}><span>加载中...</span></div>
              ) : vitems.length === 0 ? (
                <div className={s.empty}><span className={s.emptyIcon}>💬</span><span>选择一个会话查看操作时间线</span></div>
              ) : (
                <Virtuoso
                  ref={virtuosoRef}
                  data={vitems}
                  style={{ height: '100%', width: '100%' }}
                  increaseViewportBy={600}
                  rangeChanged={handleRangeChanged}
                  startReached={hasMore ? loadMore : undefined}
                  computeItemKey={(_, item) => item.key}
                  components={{ Footer: VirtuosoFooter }}
                  itemContent={(_, item) => {
                    if (item.kind === 'user') {
                      return (
                        <div className={s.turnSection} style={{ padding: '0 20px' }}>
                          <UserMsgRow rawText={item.question.text}>
                            <div className={s.richText}>{stripDomContext(item.question.text)}</div>
                          </UserMsgRow>
                        </div>
                      )
                    }
                    return (
                      <div style={{ padding: '0 20px' }}>
                        <Renderer steps={item.steps} />
                      </div>
                    )
                  }}
                />
              )}
            </CodeExpandCtx.Provider>
          </div>

          {/* 底部操作栏 — 在可滚动区域之外，不遮盖内容 */}
          {vitems.length > 0 && (
            <div className={s.bottomBar}>
              <PromptInput />
            </div>
          )}
        </div>
        <MetaSidebar session={selectedSession} steps={steps} questions={questions} activeQ={activeQ} codeExpanded={codeExpanded} onToggleCode={() => setCodeExpanded(v => !v)} onScrollToQuestion={scrollToQuestion} />
      </div>
    </div>
  )
}
