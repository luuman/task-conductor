// ChatReportPage — 会话操作时间线，8 种可切换样式
import { useCallback, useEffect, useMemo, useState, createContext, useContext } from 'react'
import { api } from '../../lib/api'
import type { AiSession, TranscriptMessage } from '../../lib/api/types'
import { parseTimeline, formatTs, guessHljsLang, type TimelineStep } from './timeline-parser'
import { RichTextBlock, CodeBlock, type CodeBlockVariant } from '../../components/ChatRenderer'
import { IconFileText, IconPencil, IconTerminal, IconBot, IconWrench } from '../../ui/icon'
import '../../styles/hljs-ayu-dark.css'
import s from './chat-report.module.css'

// ── 样式常量 ──
const STYLES = [
  { key: 'a', label: 'A 竖线时间线' },
  { key: 'b', label: 'B 卡片瀑布' },
  { key: 'c', label: 'C 紧凑表格' },
  { key: 'd', label: 'D GitHub PR' },
  { key: 'e', label: 'E 终端日志' },
  { key: 'f', label: 'F 看板泳道' },
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
    ask: s.bAsk, search: s.bSearch, other: s.bOther,
  }
  return `${s.badge} ${map[cat] || s.bOther}`
}

function badgeLabel(step: TimelineStep): string {
  if (step.kind === 'text') return '💬'
  return step.toolName || 'Tool'
}

function dotColor(cat: TimelineStep['category']): string {
  const map: Record<string, string> = {
    text: '#a78bfa', read: '#60a5fa', edit: '#fbbf24', write: '#4ade80',
    bash: '#22d3ee', grep: '#f87171', glob: '#fb923c', agent: '#c084fc',
    ask: '#60a5fa', search: '#22d3ee', other: '#52525b',
  }
  return map[cat] || '#52525b'
}

function catIcon(cat: TimelineStep['category']): string {
  const map: Record<string, string> = {
    text: '💬', read: '📖', edit: '✏️', write: '📝',
    bash: '⌨', grep: '🔍', glob: '📁', agent: '🤖',
    ask: '❓', search: '🌐', other: '⚙',
  }
  return map[cat] || '⚙'
}

// ── 代码块顶栏样式 Context ──
const CB_VARIANT_KEY = 'tc_cb_variant'
const getDefaultCbVariant = (): CodeBlockVariant => (Number(localStorage.getItem(CB_VARIANT_KEY)) || 1) as CodeBlockVariant
const CbVariantCtx = createContext<CodeBlockVariant>(1)

const ICON_SIZE = 12
const ACTION_MAP: Record<string, string> = {
  read: 'Read', edit: 'Edit', write: 'Write', bash: 'Bash', agent: 'Agent',
}
function toolIcon(category: string) {
  if (category === 'read') return <IconFileText size={ICON_SIZE} />
  if (category === 'edit') return <IconPencil size={ICON_SIZE} />
  if (category === 'write') return <IconFileText size={ICON_SIZE} />
  if (category === 'bash') return <IconTerminal size={ICON_SIZE} />
  if (category === 'agent') return <IconBot size={ICON_SIZE} />
  return <IconWrench size={ICON_SIZE} />
}

// ── Code/Result block ──
function ResultBlock({ step }: { step: TimelineStep }) {
  const variant = useContext(CbVariantCtx)
  if (!step.toolResult && !step.oldString) return null

  const filePath = String(step.toolInput?.file_path || '')
  const fileName = filePath.split('/').pop() || ''
  const icon = toolIcon(step.category)
  const action = ACTION_MAP[step.category] || step.toolName || 'Tool'

  // Edit — diff
  if (step.category === 'edit') {
    const oldStr = String(step.toolInput?.old_string ?? step.oldString ?? '')
    const newStr = String(step.toolInput?.new_string ?? '')
    if (!oldStr && !newStr) return null
    const oldLines = oldStr.split('\n').map(l => `- ${l}`)
    const newLines = newStr.split('\n').map(l => `+ ${l}`)
    return <CodeBlock code={[...oldLines, ...newLines].join('\n')} lang="diff" icon={icon} action={action} fileName={fileName} variant={variant} />
  }

  // Write
  if (step.category === 'write' && step.toolInput?.content) {
    const lang = guessHljsLang(filePath) || undefined
    const raw = String(step.toolInput.content)
    const preview = raw.slice(0, 800) + (raw.length > 800 ? '\n...' : '')
    return <CodeBlock code={preview} lang={lang} icon={icon} action={action} fileName={fileName} variant={variant} />
  }

  // Read
  if (step.category === 'read' && step.toolResult) {
    const lang = guessHljsLang(filePath) || undefined
    const stripped = step.toolResult.replace(/^ *\d+[→\t]/gm, '')
    return <CodeBlock code={stripped} lang={lang} icon={icon} action={action} fileName={fileName} variant={variant} />
  }

  // Agent
  if (step.category === 'agent' && step.toolResult) {
    return <div className={s.richText}><RichTextBlock text={step.toolResult} /></div>
  }

  // Bash
  if (step.category === 'bash' && step.toolResult) {
    const cmd = String(step.toolInput?.command || '').slice(0, 80)
    return <CodeBlock code={step.toolResult} lang="bash" icon={icon} action={action} fileName={cmd} variant={variant} />
  }

  // Generic
  if (step.toolResult) {
    return <CodeBlock code={step.toolResult} icon={icon} action={action} fileName={step.toolName || ''} variant={variant} />
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
        outline: isActive ? '1px solid #7c5cfc' : undefined,
        outlineOffset: 2, borderRadius: 6,
      }}
    >
      <span style={{
        position: 'absolute', left: -4, top: -4, fontSize: 9, fontWeight: 700,
        background: isActive ? '#7c5cfc' : 'var(--tc-sidebar-bg, #131316)',
        color: isActive ? '#fff' : 'var(--tc-foreground-secondary, #a1a1aa)',
        border: '1px solid var(--tc-border, #27272a)',
        borderRadius: 8, padding: '0 4px', zIndex: 2,
        fontFamily: 'var(--tc-font-mono, monospace)',
      }}>{index + 1}</span>
      {children}
    </div>
  )
}

// ════════════════════════════════════════════════
// 8 种样式渲染器
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
            <div className={`${s.bCard} ${s.bTextCard}`}><div className={s.bBody}><RichText text={step.text!} /></div></div>
          ) : (
            <div className={s.bCard}>
              {(step.toolResult || step.oldString) && <div className={s.bBody}><ResultBlock step={step} /></div>}
            </div>
          )}
        </StepWrap>
      ))}
    </>
  )
}

function StyleC({ steps }: { steps: TimelineStep[] }) {
  const { onSelect } = useContext(InspectCtx)
  return (
    <table className={s.cTable}>
      <thead><tr><th>#</th><th>类型</th><th>操作详情</th><th>时间</th></tr></thead>
      <tbody>
        {steps.map((step, i) => (
          <tr key={step.id} className={step.kind === 'text' ? s.cTextRow : undefined} onClick={() => onSelect(step, i)} style={{ cursor: 'pointer' }}>
            <td className={s.cNum}>{i + 1}</td>
            <td className={s.cType}><span className={badgeCls(step.category)}>{badgeLabel(step)}</span></td>
            <td className={s.cDetail}>
              {step.kind === 'text' ? (
                <div style={{ maxHeight: 80, overflow: 'hidden' }}><RichText text={step.text!} /></div>
              ) : (
                <>
                  <code style={{ color: '#a78bfa' }}>{step.toolDetail}</code>
                  {step.toolError && <span className={s.errTag}> ERROR</span>}
                  {step.toolResult && <div className={s.cExpanded}>{step.toolResult}</div>}
                </>
              )}
            </td>
            <td className={s.cTime}>{formatTs(step.ts)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function StyleD({ steps }: { steps: TimelineStep[] }) {
  return (
    <>
      {steps.map((step, i) => (
        <StepWrap key={step.id} step={step} index={i}>
          {i > 0 && <div className={s.dConnector} />}
          <div className={`${s.dEvent} ${step.kind === 'text' ? s.dTextEvent : ''}`}>
            <div className={s.dHead}>
              <div className={`${s.dAvatar} ${step.kind === 'text' ? s.dAvatarClaude : s.dAvatarTool}`}>
                {step.kind === 'text' ? 'C' : catIcon(step.category)}
              </div>
              <div className={s.dDesc}>
                <strong>Claude</strong>{' '}
                {step.kind === 'text' ? '说：' : (
                  <>{step.category === 'read' ? '读取了文件' : step.category === 'edit' ? '编辑了文件' : step.category === 'write' ? '新建了文件' : step.category === 'bash' ? '执行了命令' : step.category === 'agent' ? '启动了子代理' : '调用了工具'}</>
                )}
              </div>
            </div>
            {step.kind === 'text' ? (
              <div className={s.dBody}><RichText text={step.text!} /></div>
            ) : (step.toolResult || step.oldString) ? (
              <div className={s.dBody}><ResultBlock step={step} /></div>
            ) : null}
          </div>
        </StepWrap>
      ))}
    </>
  )
}

function StyleE({ steps }: { steps: TimelineStep[] }) {
  const { onSelect } = useContext(InspectCtx)
  return (
    <div className={s.eLog}>
      {steps.map((step, i) => (
        <div key={step.id} className={s.eLine} onClick={() => onSelect(step, i)} style={{ cursor: 'pointer' }}>
          <span className={s.eTs}>{formatTs(step.ts)}</span>
          <span className={s.eType}><span className={badgeCls(step.category)}>{badgeLabel(step)}</span></span>
          <span className={s.eCt}>
            {step.kind === 'text' ? step.text?.slice(0, 200) : (
              <>
                <span className={s.hlFile}>{step.toolDetail?.split(' ')[0]}</span>
                {step.toolDetail?.includes(' ') && <span> {step.toolDetail.slice(step.toolDetail.indexOf(' '))}</span>}
                {step.toolError && <span className={s.hlErr}> ERROR</span>}
                {step.toolResult && !step.toolError && step.toolResult.length < 60 && <span> → <span className={s.hlOk}>{step.toolResult}</span></span>}
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

function StyleF({ steps }: { steps: TimelineStep[] }) {
  const lanes = useMemo(() => {
    const groups: Record<string, { label: string; color: string; items: TimelineStep[] }> = {
      text: { label: '💬 思考', color: '#a78bfa', items: [] },
      read: { label: '📖 读取', color: '#60a5fa', items: [] },
      write: { label: '✏️ 写入', color: '#4ade80', items: [] },
      bash: { label: '⌨ 命令', color: '#22d3ee', items: [] },
      other: { label: '🔧 其他', color: '#52525b', items: [] },
    }
    for (const step of steps) {
      const key = step.category === 'edit' || step.category === 'write' ? 'write'
        : step.category === 'text' ? 'text'
        : step.category === 'read' || step.category === 'grep' || step.category === 'glob' ? 'read'
        : step.category === 'bash' ? 'bash' : 'other'
      groups[key].items.push(step)
    }
    return Object.values(groups).filter(g => g.items.length > 0)
  }, [steps])
  return (
    <div className={s.fBoard}>
      {lanes.map(lane => (
        <div key={lane.label} className={s.fLane}>
          <div className={s.fLaneHead} style={{ color: lane.color }}>{lane.label}<span className={s.fLaneCount}>{lane.items.length}</span></div>
          <div className={s.fLaneBody}>
            {lane.items.map(step => (
              <div key={step.id} className={s.fItem}>
                <div className={s.fItemTitle}>{step.kind === 'text' ? step.text?.slice(0, 40) : step.toolDetail?.split(' ')[0]}</div>
                <div className={s.fItemDesc}>{step.kind === 'text' ? '' : step.toolName} {formatTs(step.ts)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
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
              <div className={s.gBubbleTool}>
                <ResultBlock step={step} />
              </div>
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
      {steps.map(step => (
        <div key={step.id} className={s.hAcc}>
          <div className={s.hHead} onClick={() => toggle(step.id)}>
            <span className={s.hChevron} style={{ transform: openIds.has(step.id) ? 'rotate(90deg)' : undefined }}>▶</span>
            <span className={badgeCls(step.category)}>{badgeLabel(step)}</span>
            {step.kind === 'text' && <span className={s.hTitle}>{step.text?.slice(0, 60)}</span>}
          </div>
          {openIds.has(step.id) && (
            <div className={s.hBody}>
              {step.kind === 'text' ? <RichText text={step.text!} /> : <ResultBlock step={step} />}
            </div>
          )}
        </div>
      ))}
    </>
  )
}

const RENDERERS: Record<StyleKey, React.FC<{ steps: TimelineStep[] }>> = {
  a: StyleA, b: StyleB, c: StyleC, d: StyleD,
  e: StyleE, f: StyleF, g: StyleG, h: StyleH,
}

// ── Right sidebar ──
function MetaSidebar({ session, steps }: { session: AiSession | null; steps: TimelineStep[] }) {
  if (!session) return null
  const toolSteps = steps.filter(st => st.kind === 'tool')
  const cats = useMemo(() => {
    const m: Record<string, number> = {}
    toolSteps.forEach(st => { m[st.category] = (m[st.category] || 0) + 1 })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [toolSteps])

  // 计算耗时
  const duration = useMemo(() => {
    if (!session.started_at || !session.last_seen_at) return ''
    const start = new Date(session.started_at).getTime()
    const end = new Date(session.last_seen_at).getTime()
    const diff = Math.round((end - start) / 1000)
    if (diff < 60) return `${diff}s`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`
  }, [session.started_at, session.last_seen_at])

  // 涉及文件统计
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

  // 操作类型中文标签
  const catLabel: Record<string, string> = {
    read: 'Read', edit: 'Edit', write: 'Write', bash: 'Bash',
    grep: 'Grep', glob: 'Glob', agent: 'Agent', ask: 'Ask',
    search: 'Search', other: '其他',
  }

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

      <hr className={s.sbDivider} />

      {/* 操作统计 */}
      <div className={s.sbSection}>
        <div className={s.sbTitle}>操作统计</div>
        <div className={s.sbRow}><span className={s.sbKey}>工具调用</span><span className={s.sbVal}>{toolSteps.length}</span></div>
        <div className={s.sbRow}><span className={s.sbKey}>文本输出</span><span className={s.sbVal}>{steps.length - toolSteps.length} 段</span></div>
        {cats.map(([cat, count]) => (
          <div key={cat} className={s.sbRow}>
            <span className={s.sbKey}>{catLabel[cat] || cat}</span>
            <span className={s.sbVal} style={{ color: dotColor(cat as TimelineStep['category']) }}>{count}</span>
          </div>
        ))}
      </div>

      <hr className={s.sbDivider} />

      {/* 涉及文件 */}
      <div className={s.sbSection}>
        <div className={s.sbTitle}>涉及文件</div>
        <div className={s.sbRow}><span className={s.sbKey}>📄 读取</span><span className={s.sbVal}>{fileStats.read} 文件</span></div>
        <div className={s.sbRow}><span className={s.sbKey}>✏️ 修改</span><span className={s.sbVal}>{fileStats.edit} 文件</span></div>
        <div className={s.sbRow}><span className={s.sbKey}>📝 新建</span><span className={s.sbVal}>{fileStats.write} 文件</span></div>
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
export default function ChatReportPage() {
  const [sessions, setSessions] = useState<AiSession[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [style, setStyle] = useState<StyleKey>(getDefaultStyle)
  const [cbVariant, setCbVariant] = useState<CodeBlockVariant>(getDefaultCbVariant)
  const [inspected, setInspected] = useState<{ step: TimelineStep; index: number } | null>(null)

  useEffect(() => {
    api.getSessions().then(list => {
      setSessions(list)
      if (list.length > 0 && !selectedId) setSelectedId(list[0].session_id)
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    setInspected(null)
    api.getTranscript(selectedId, { limit: 200, offset: 0 }).then(res => {
      setTranscript(res.messages)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [selectedId])

  const steps = useMemo(() => parseTimeline(transcript), [transcript])
  const selectedSession = sessions.find(ss => ss.session_id === selectedId) ?? null

  const userQuestion = useMemo(() => {
    const userMsg = transcript.find(m => m.role === 'user')
    if (!userMsg) return ''
    const textBlock = userMsg.blocks.find(b => b.type === 'text')
    return textBlock?.text?.slice(0, 150) || ''
  }, [transcript])

  const handleStyleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value as StyleKey
    setStyle(v)
    localStorage.setItem(LS_KEY, v)
  }, [])

  const handleCbVariantChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = Number(e.target.value) as CodeBlockVariant
    setCbVariant(v)
    localStorage.setItem(CB_VARIANT_KEY, String(v))
  }, [])

  const handleInspect = useCallback((step: TimelineStep, index: number) => {
    setInspected(prev => prev?.step.id === step.id ? null : { step, index })
  }, [])

  const inspectCtx = useMemo(() => ({
    selected: inspected?.step.id ?? null,
    onSelect: handleInspect,
  }), [inspected, handleInspect])

  const Renderer = RENDERERS[style]

  return (
    <div className={s.page}>
      <div className={s.topBar}>
        <span className={s.topLabel}>会话</span>
        <select className={s.sessionSelect} value={selectedId || ''} onChange={e => setSelectedId(e.target.value)}>
          {sessions.map(ss => (
            <option key={ss.session_id} value={ss.session_id}>
              {ss.summary || ss.session_id.slice(0, 8)} — {ss.cwd?.split('/').pop() || ''} ({ss.event_count})
            </option>
          ))}
        </select>
        <span className={s.topLabel} style={{ marginLeft: 'auto' }}>样式</span>
        <select className={s.styleSelect} value={style} onChange={handleStyleChange}>
          {STYLES.map(st => (<option key={st.key} value={st.key}>{st.label}</option>))}
        </select>
      </div>

      <div className={s.body}>
        <div className={s.mainArea}>
          <InspectCtx.Provider value={inspectCtx}>
            {loading ? (
              <div className={s.empty}><span>加载中...</span></div>
            ) : steps.length === 0 ? (
              <div className={s.empty}><span className={s.emptyIcon}>💬</span><span>选择一个会话查看操作时间线</span></div>
            ) : (
              <>
                {userQuestion && <div className={s.queryPill}>{userQuestion}</div>}
                <Renderer steps={steps} />
              </>
            )}
          </InspectCtx.Provider>

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
                }}>📋 复制</button>
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
                }}>📋 复制信息</button>
                <button className={s.inspectClose} onClick={() => setInspected(null)}>✕</button>
              </div>
              <div className={s.inspectBody}>
                <span>类型: <b>{inspected.step.category}</b></span>
                {inspected.step.toolName && <span> · 工具: <b>{inspected.step.toolName}</b></span>}
                {inspected.step.ts && <span> · 时间: <b>{formatTs(inspected.step.ts)}</b></span>}
                {inspected.step.toolError && <span style={{ color: '#f87171' }}> · ERROR</span>}
                {inspected.step.toolInput?.file_path != null && <span> · 文件: <b>{String(inspected.step.toolInput.file_path).split('/').pop()}</b></span>}
                <span style={{ marginLeft: 8, color: 'var(--tc-foreground-secondary)', fontSize: 10 }}>点击复制后告诉 Claude: "步骤 #{inspected.index + 1} 有问题"</span>
              </div>
            </div>
          )}
        </div>
        <MetaSidebar session={selectedSession} steps={steps} />
      </div>
    </div>
  )
}
