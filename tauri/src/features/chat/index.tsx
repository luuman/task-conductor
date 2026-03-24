// ChatReportPage — 会话操作时间线，8 种可切换样式
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import type { AiSession, TranscriptMessage } from '../../lib/api/types'
import { parseTimeline, formatTs, guessLang, guessHljsLang, guessBashOutputLang, type TimelineStep } from './timeline-parser'
import { useHighlight } from '../../lib/useHighlight'
import { RichTextBlock } from '../../components/ChatRenderer'
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

// ── badge label ──
function badgeLabel(step: TimelineStep): string {
  if (step.kind === 'text') return '💬'
  return step.toolName || 'Tool'
}

// ── dot color (for timeline) ──
function dotColor(cat: TimelineStep['category']): string {
  const map: Record<string, string> = {
    text: '#a78bfa', read: '#60a5fa', edit: '#fbbf24', write: '#4ade80',
    bash: '#22d3ee', grep: '#f87171', glob: '#fb923c', agent: '#c084fc',
    ask: '#60a5fa', search: '#22d3ee', other: '#52525b',
  }
  return map[cat] || '#52525b'
}

// ── icon for card style ──
function catIcon(cat: TimelineStep['category']): string {
  const map: Record<string, string> = {
    text: '💬', read: '📖', edit: '✏️', write: '📝',
    bash: '⌨', grep: '🔍', glob: '📁', agent: '🤖',
    ask: '❓', search: '🌐', other: '⚙',
  }
  return map[cat] || '⚙'
}

// ── Highlighted code pre ──
function HlPre({ code, lang, className }: { code: string; lang?: string; className?: string }) {
  const { html } = useHighlight(code, lang)
  if (html) {
    return <pre className={`hljs ${s.codeBody} ${className || ''}`} dangerouslySetInnerHTML={{ __html: html }} />
  }
  return <pre className={`${s.codeBody} ${className || ''}`}>{code}</pre>
}

// ── Code/Result block component ──
function ResultBlock({ step }: { step: TimelineStep }) {
  if (!step.toolResult && !step.oldString) return null

  // Edit diff — 不做语法高亮，保持 diff 颜色
  if (step.category === 'edit' && (step.oldString || step.newString)) {
    return (
      <div className={s.codeBlock}>
        <div className={s.codeHeader}><span className={s.codeLang}>Diff</span></div>
        <pre className={s.codeBody}>
          {step.oldString && <span className={s.diffDel}>{step.oldString.split('\n').map(l => `−${l}`).join('\n')}</span>}
          {step.oldString && step.newString && '\n'}
          {step.newString && <span className={s.diffAdd}>{step.newString.split('\n').map(l => `+${l}`).join('\n')}</span>}
        </pre>
      </div>
    )
  }

  // Write content preview — 按文件类型高亮
  if (step.category === 'write' && step.toolInput?.content) {
    const fp = String(step.toolInput.file_path || '')
    const displayLang = guessLang(fp)
    const hljsLang = guessHljsLang(fp)
    const raw = String(step.toolInput.content)
    const preview = raw.slice(0, 800) + (raw.length > 800 ? '\n...' : '')
    return (
      <div className={s.codeBlock}>
        {displayLang && <div className={s.codeHeader}><span className={s.codeLang}>{displayLang}</span></div>}
        <HlPre code={preview} lang={hljsLang} />
      </div>
    )
  }

  // Read file content — 去行号后按文件类型高亮
  if (step.category === 'read' && step.toolResult) {
    const fp = String(step.toolInput?.file_path || '')
    const displayLang = guessLang(fp)
    const hljsLang = guessHljsLang(fp)
    // 去掉 Read 工具输出的行号前缀 "   123→"
    const stripped = step.toolResult.replace(/^ *\d+[→\t]/gm, '')
    return (
      <div className={s.codeBlock}>
        <div className={s.codeHeader}>
          {displayLang && <span className={s.codeLang}>{displayLang}</span>}
          <span>{step.toolResult.split('\n').length} lines</span>
        </div>
        <HlPre code={stripped} lang={hljsLang} />
      </div>
    )
  }

  // Bash output — 尝试猜测输出语言
  if (step.category === 'bash' && step.toolResult) {
    const cmd = String(step.toolInput?.command || '')
    const bashLang = guessBashOutputLang(cmd, step.toolResult)
    const isErr = step.toolError
    return (
      <div className={s.codeBlock} style={isErr ? { borderColor: 'rgba(248,113,113,0.3)' } : undefined}>
        <HlPre code={step.toolResult} lang={bashLang} className={isErr ? s.errText : ''} />
      </div>
    )
  }

  // Grep/Glob result
  if ((step.category === 'grep' || step.category === 'glob') && step.toolResult) {
    return (
      <div className={s.codeBlock}>
        <pre className={s.codeBody}>{step.toolResult}</pre>
      </div>
    )
  }

  // Generic result
  if (step.toolResult) {
    const isErr = step.toolError
    return (
      <div className={s.codeBlock} style={isErr ? { borderColor: 'rgba(248,113,113,0.3)' } : undefined}>
        <pre className={`${s.codeBody} ${isErr ? s.errText : ''}`}>{step.toolResult}</pre>
      </div>
    )
  }

  return null
}

// ── Rich text — 复用 ChatRenderer 的 Markdown 渲染 ──
function RichText({ text }: { text: string }) {
  return <div className={s.richText}><RichTextBlock text={text} /></div>
}

// ════════════════════════════════════════════════
// 8 种样式渲染器
// ════════════════════════════════════════════════

// A: 竖线时间线
function StyleA({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className={s.aTl}>
      {steps.map((step, i) => (
        <StepWrap key={step.id} step={step} index={i}>
          <div className={s.aStep}>
            <span className={s.aDot} style={{ background: dotColor(step.category) }} />
            {step.kind === 'text' ? (
              <div className={`${s.aText} ${s.richText}`}><RichText text={step.text!} /></div>
            ) : (
              <>
                <div className={s.aToolRow}>
                  <span className={badgeCls(step.category)}>{step.toolName}</span>
                  <span style={{ fontFamily: 'var(--tc-font-mono)', fontSize: 11 }}>
                    {step.toolDetail && <><span className={s.fileName}>{step.toolDetail.split(' ')[0]}</span> {step.toolDetail.includes(' ') ? step.toolDetail.slice(step.toolDetail.indexOf(' ')) : ''}</>}
                  </span>
                  {step.toolError && <span className={s.errTag}>ERROR</span>}
                  <span style={{ marginLeft: 'auto' }} className={s.ts}>{formatTs(step.ts)}</span>
                </div>
                <div style={{ marginLeft: 4 }}><ResultBlock step={step} /></div>
              </>
            )}
          </div>
        </StepWrap>
      ))}
    </div>
  )
}

// B: 卡片瀑布
function StyleB({ steps }: { steps: TimelineStep[] }) {
  return (
    <>
      {steps.map((step, i) => (
        <StepWrap key={step.id} step={step} index={i}>
          {step.kind === 'text' ? (
            <div className={`${s.bCard} ${s.bTextCard}`}>
              <div className={s.bBody}><RichText text={step.text!} /></div>
            </div>
          ) : (
            <div className={s.bCard}>
              <div className={s.bHead}>
                <div className={s.bIcon} style={{ background: `${dotColor(step.category)}15`, color: dotColor(step.category) }}>{catIcon(step.category)}</div>
                <div className={s.bTitle}>{step.toolName} · {step.toolDetail?.split(' ')[0]}</div>
                {step.toolError && <span className={s.errTag}>ERROR</span>}
                <div className={s.bMeta}>{formatTs(step.ts)}</div>
              </div>
              {(step.toolResult || step.oldString) && <div className={s.bBody}><ResultBlock step={step} /></div>}
            </div>
          )}
        </StepWrap>
      ))}
    </>
  )
}

// C: 紧凑表格
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

// D: GitHub PR
function StyleD({ steps }: { steps: TimelineStep[] }) {
  return (
    <>
      {steps.map((step, i) => (
        <div key={step.id}>
          {i > 0 && <div className={s.dConnector} />}
          <div className={`${s.dEvent} ${step.kind === 'text' ? s.dTextEvent : ''}`}>
            <div className={s.dHead}>
              <div className={`${s.dAvatar} ${step.kind === 'text' ? s.dAvatarClaude : s.dAvatarTool}`}>
                {step.kind === 'text' ? 'C' : catIcon(step.category)}
              </div>
              <div className={s.dDesc}>
                <strong>Claude</strong>{' '}
                {step.kind === 'text' ? '说：' : (
                  <>{step.category === 'read' ? '读取了' : step.category === 'edit' ? '编辑了' : step.category === 'write' ? '新建了' : step.category === 'bash' ? '执行了' : step.category === 'agent' ? '启动子代理' : '调用了'} <code>{step.toolDetail?.split(' ')[0]}</code></>
                )}
                {step.toolError && <span className={s.errTag}> ERROR</span>}
              </div>
              <span className={s.ts}>{formatTs(step.ts)}</span>
            </div>
            {step.kind === 'text' ? (
              <div className={s.dBody}><RichText text={step.text!} /></div>
            ) : (step.toolResult || step.oldString) ? (
              <div className={s.dBody}><ResultBlock step={step} /></div>
            ) : null}
          </div>
        </div>
      ))}
    </>
  )
}

// E: 终端日志
function StyleE({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className={s.eLog}>
      {steps.map(step => (
        <div key={step.id} className={s.eLine}>
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

// F: 看板泳道
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
        : step.category === 'bash' ? 'bash'
        : 'other'
      groups[key].items.push(step)
    }
    return Object.values(groups).filter(g => g.items.length > 0)
  }, [steps])

  return (
    <div className={s.fBoard}>
      {lanes.map(lane => (
        <div key={lane.label} className={s.fLane}>
          <div className={s.fLaneHead} style={{ color: lane.color }}>
            {lane.label}
            <span className={s.fLaneCount}>{lane.items.length}</span>
          </div>
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

// G: 气泡聊天
function StyleG({ steps }: { steps: TimelineStep[] }) {
  return (
    <>
      {steps.map(step => (
        <div key={step.id} className={s.gMsg}>
          <div className={`${s.gAvatar} ${step.kind === 'text' ? s.gAvatarClaude : s.gAvatarTool}`}>
            {step.kind === 'text' ? 'C' : catIcon(step.category)}
          </div>
          {step.kind === 'text' ? (
            <div className={s.gBubbleText}><RichText text={step.text!} /></div>
          ) : (
            <div className={s.gBubbleTool}>
              <div className={s.gToolHead}>
                <span className={badgeCls(step.category)}>{step.toolName}</span>
                <span style={{ fontSize: 11 }}>{step.toolDetail?.split(' ')[0]}</span>
                {step.toolError && <span className={s.errTag}>ERROR</span>}
                <span className={s.ts} style={{ marginLeft: 'auto' }}>{formatTs(step.ts)}</span>
              </div>
              <ResultBlock step={step} />
            </div>
          )}
        </div>
      ))}
    </>
  )
}

// H: 折叠手风琴
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
            <span className={s.hTitle}>{step.kind === 'text' ? step.text?.slice(0, 60) : step.toolDetail}</span>
            {step.toolError && <span className={s.errTag}>ERROR</span>}
            <span className={s.ts}>{formatTs(step.ts)}</span>
          </div>
          {openIds.has(step.id) && (
            <div className={s.hBody}>
              {step.kind === 'text' ? <RichText text={step.text!} /> : <ResultBlock step={step} />}
              {step.kind === 'tool' && !step.toolResult && !step.oldString && (
                <span style={{ color: 'var(--tc-foreground-secondary)', fontSize: 11 }}>{step.toolDetail}</span>
              )}
            </div>
          )}
        </div>
      ))}
    </>
  )
}

// ── 步骤检查上下文 ──
import { createContext, useContext } from 'react'
const InspectCtx = createContext<{ selected: string | null; onSelect: (step: TimelineStep, index: number) => void }>({ selected: null, onSelect: () => {} })

/** 可点击步骤包装器 — 给每步加序号 + 点击高亮 */
function StepWrap({ step, index, children }: { step: TimelineStep; index: number; children: React.ReactNode }) {
  const { selected, onSelect } = useContext(InspectCtx)
  const isActive = selected === step.id
  return (
    <div
      data-step={index + 1}
      onClick={(e) => { e.stopPropagation(); onSelect(step, index) }}
      style={{
        position: 'relative',
        cursor: 'pointer',
        outline: isActive ? '1px solid #7c5cfc' : undefined,
        outlineOffset: 2,
        borderRadius: 6,
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

// ── 样式渲染分发（包裹 StepWrap） ──
function WrappedRenderer({ steps, StyleComp }: { steps: TimelineStep[]; StyleComp: React.FC<{ steps: TimelineStep[] }> }) {
  return <StyleComp steps={steps} />
}
const RENDERERS: Record<StyleKey, React.FC<{ steps: TimelineStep[] }>> = {
  a: StyleA, b: StyleB, c: StyleC, d: StyleD,
  e: StyleE, f: StyleF, g: StyleG, h: StyleH,
}

// ── Right sidebar: metadata ──
function MetaSidebar({ session, steps }: { session: AiSession | null; steps: TimelineStep[] }) {
  if (!session) return null
  const toolSteps = steps.filter(st => st.kind === 'tool')
  const cats = useMemo(() => {
    const m: Record<string, number> = {}
    toolSteps.forEach(st => { m[st.category] = (m[st.category] || 0) + 1 })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [toolSteps])

  return (
    <div className={s.sidebar}>
      <div className={s.sbSection}>
        <div className={s.sbTitle}>会话元数据</div>
        <div className={s.sbRow}><span className={s.sbKey}>会话 ID</span><span className={s.sbVal}>{session.session_id.slice(0, 8)}</span></div>
        <div className={s.sbRow}><span className={s.sbKey}>状态</span><span className={s.sbVal} style={{ color: session.status === 'active' ? '#4ade80' : undefined }}>● {session.status || 'unknown'}</span></div>
        <div className={s.sbRow}><span className={s.sbKey}>开始</span><span className={s.sbVal}>{formatTs(session.started_at)}</span></div>
        <div className={s.sbRow}><span className={s.sbKey}>最后活跃</span><span className={s.sbVal}>{formatTs(session.last_seen_at || '')}</span></div>
        {session.cwd && <div className={s.sbRow}><span className={s.sbKey}>目录</span><span className={s.sbVal} style={{ fontSize: 9 }}>{session.cwd.split('/').pop()}</span></div>}
      </div>
      <hr className={s.sbDivider} />
      <div className={s.sbSection}>
        <div className={s.sbTitle}>操作统计</div>
        <div className={s.sbRow}><span className={s.sbKey}>总步骤</span><span className={s.sbVal}>{steps.length}</span></div>
        <div className={s.sbRow}><span className={s.sbKey}>工具调用</span><span className={s.sbVal}>{toolSteps.length}</span></div>
        <div className={s.sbRow}><span className={s.sbKey}>文本输出</span><span className={s.sbVal}>{steps.length - toolSteps.length}</span></div>
        {cats.map(([cat, count]) => (
          <div key={cat} className={s.sbRow}>
            <span className={s.sbKey}>{cat}</span>
            <span className={s.sbVal} style={{ color: dotColor(cat as TimelineStep['category']) }}>{count}</span>
          </div>
        ))}
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
  const [inspected, setInspected] = useState<{ step: TimelineStep; index: number } | null>(null)

  // 获取会话列表
  useEffect(() => {
    api.getSessions().then(list => {
      setSessions(list)
      if (list.length > 0 && !selectedId) setSelectedId(list[0].session_id)
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 获取选中会话的 transcript
  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    api.getTranscript(selectedId, { limit: 200, offset: 0 }).then(res => {
      setTranscript(res.messages)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [selectedId])

  // 解析时间线
  const steps = useMemo(() => parseTimeline(transcript), [transcript])
  const selectedSession = sessions.find(ss => ss.session_id === selectedId) ?? null

  // 用户提问文本（第一条 user message）
  const userQuestion = useMemo(() => {
    const userMsg = transcript.find(m => m.role === 'user')
    if (!userMsg) return ''
    const textBlock = userMsg.blocks.find(b => b.type === 'text')
    return textBlock?.text?.slice(0, 150) || ''
  }, [transcript])

  // 切换样式
  const handleStyleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value as StyleKey
    setStyle(v)
    localStorage.setItem(LS_KEY, v)
  }, [])

  const Renderer = RENDERERS[style]

  const handleInspect = useCallback((step: TimelineStep, index: number) => {
    setInspected(prev => prev?.step.id === step.id ? null : { step, index })
  }, [])

  const inspectCtx = useMemo(() => ({
    selected: inspected?.step.id ?? null,
    onSelect: handleInspect,
  }), [inspected, handleInspect])

  return (
    <div className={s.page}>
      {/* 顶栏 */}
      <div className={s.topBar}>
        <span className={s.topLabel}>会话</span>
        <select
          className={s.sessionSelect}
          value={selectedId || ''}
          onChange={e => setSelectedId(e.target.value)}
        >
          {sessions.map(ss => (
            <option key={ss.session_id} value={ss.session_id}>
              {ss.summary || ss.session_id.slice(0, 8)} — {ss.cwd?.split('/').pop() || ''} ({ss.event_count})
            </option>
          ))}
        </select>

        <span className={s.topLabel} style={{ marginLeft: 'auto' }}>样式</span>
        <select className={s.styleSelect} value={style} onChange={handleStyleChange}>
          {STYLES.map(st => (
            <option key={st.key} value={st.key}>{st.label}</option>
          ))}
        </select>
      </div>

      {/* 主体 */}
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

          {/* 检查面板 */}
          {inspected && (
            <div className={s.inspectPanel}>
              <div className={s.inspectHeader}>
                <span className={s.inspectNum}>#{inspected.index + 1}</span>
                <span className={badgeCls(inspected.step.category)}>{badgeLabel(inspected.step)}</span>
                <span className={s.inspectTitle}>
                  {inspected.step.kind === 'text'
                    ? inspected.step.text?.slice(0, 50) + '...'
                    : inspected.step.toolDetail}
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
                {inspected.step.toolInput?.file_path && <span> · 文件: <b>{String(inspected.step.toolInput.file_path).split('/').pop()}</b></span>}
                <span style={{ marginLeft: 8, color: 'var(--tc-foreground-secondary)', fontSize: 10 }}>点击复制后告诉 Claude: "步骤 #{inspected.index + 1} 有问题"</span>
              </div>
            </div>
          )}
        </div>

        {/* 右侧元数据 */}
        <MetaSidebar session={selectedSession} steps={steps} />
      </div>
    </div>
  )
}
