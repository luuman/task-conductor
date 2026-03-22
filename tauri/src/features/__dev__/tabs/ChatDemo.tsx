/**
 * ChatDemo — 消息类型卡片画布
 * 左列 Raw 卡片 ←连线→ 右列 Styled 卡片，点击展开详情面板
 */
import { useRef, useState, useMemo, useCallback, useEffect, type CSSProperties } from 'react'
import { DEMO_MESSAGES, DEMO_SECTIONS } from './chat-demo-data'
import type { TranscriptMessage, TranscriptBlock } from '../../../lib/api/types'
import type { GroupedTurnItem } from '../../../components/ChatRenderer'
import {
  groupMessagesIntoTurns,
  UserCard,
  AssistantTurnCard,
  ExpandSignalCtx,
  AutoExpandCtx,
} from '../../../components/ChatRenderer'

// ── 颜色系统 ────────────────────────────────────────

const COLORS = [
  { main: '#58a6ff', bg: 'rgba(88,166,255,0.08)', border: 'rgba(88,166,255,0.25)' },
  { main: '#3fb950', bg: 'rgba(63,185,80,0.08)', border: 'rgba(63,185,80,0.25)' },
  { main: '#d29922', bg: 'rgba(210,153,34,0.08)', border: 'rgba(210,153,34,0.25)' },
  { main: '#f85149', bg: 'rgba(248,81,73,0.08)', border: 'rgba(248,81,73,0.25)' },
  { main: '#bc8cff', bg: 'rgba(188,140,255,0.08)', border: 'rgba(188,140,255,0.25)' },
  { main: '#39d2c0', bg: 'rgba(57,210,192,0.08)', border: 'rgba(57,210,192,0.25)' },
  { main: '#ff7b72', bg: 'rgba(255,123,114,0.08)', border: 'rgba(255,123,114,0.25)' },
  { main: '#79c0ff', bg: 'rgba(121,192,255,0.08)', border: 'rgba(121,192,255,0.25)' },
  { main: '#56d364', bg: 'rgba(86,211,100,0.08)', border: 'rgba(86,211,100,0.25)' },
  { main: '#e3b341', bg: 'rgba(227,179,65,0.08)', border: 'rgba(227,179,65,0.25)' },
  { main: '#ffa657', bg: 'rgba(255,166,87,0.08)', border: 'rgba(255,166,87,0.25)' },
  { main: '#a5d6ff', bg: 'rgba(165,214,255,0.08)', border: 'rgba(165,214,255,0.25)' },
]

// ── 构建 Section 数据 ───────────────────────────────

interface SectionData {
  label: string
  msgIndex: number       // DEMO_MESSAGES 中的起始索引
  turnIndex: number      // turns 中的对应索引
  color: typeof COLORS[0]
  // 提取的元信息
  type: string           // 简短类型标识
  icon: string           // emoji
  msgCount: number       // 该 section 包含的消息数
}

function getTypeIcon(label: string): string {
  if (label.includes('用户')) return '👤'
  if (label.includes('Markdown')) return '📝'
  if (label.includes('代码')) return '💻'
  if (label.includes('Mermaid')) return '📊'
  if (label.includes('Task N')) return '📋'
  if (label.includes('System')) return '⚙️'
  if (label.includes('Read') && label.includes('Grep')) return '🔍'
  if (label.includes('Read') && label.includes('ERROR')) return '❌'
  if (label.includes('Edit') && label.includes('diff')) return '✏️'
  if (label.includes('MultiEdit')) return '✏️'
  if (label.includes('Write')) return '📄'
  if (label.includes('Bash') && label.includes('error')) return '🔴'
  if (label.includes('Bash') && label.includes('静默')) return '🔇'
  if (label.includes('Bash') && label.includes('JSON')) return '📦'
  if (label.includes('Bash') && label.includes('Python')) return '🐍'
  if (label.includes('Bash') && label.includes('测试')) return '✅'
  if (label.includes('Bash') && label.includes('git')) return '📜'
  if (label.includes('Bash') && label.includes('build')) return '🏗️'
  if (label.includes('Bash') && label.includes('ERROR')) return '💥'
  if (label.includes('Agent')) return '🤖'
  if (label.includes('AskUser') && label.includes('有')) return '❓'
  if (label.includes('AskUser') && label.includes('无')) return '⏳'
  if (label.includes('WebSearch')) return '🌐'
  if (label.includes('WebFetch')) return '📡'
  if (label.includes('Skill')) return '🎯'
  if (label.includes('TaskCreate')) return '📌'
  if (label.includes('Unknown')) return '❔'
  if (label.includes('Edit') && label.includes('ERROR')) return '🚫'
  return '📎'
}

function buildSections(
  turns: GroupedTurnItem[],
): SectionData[] {
  return DEMO_SECTIONS.map((sec, i) => {
    const turnIdx = turns.findIndex(t => t.startIndex >= sec.index)
    const nextSec = DEMO_SECTIONS[i + 1]
    const endIdx = nextSec ? nextSec.index : DEMO_MESSAGES.length
    return {
      label: sec.label,
      msgIndex: sec.index,
      turnIndex: turnIdx >= 0 ? turnIdx : turns.length - 1,
      color: COLORS[i % COLORS.length],
      type: sec.label.replace(/^\d+\w*\.\s*/, ''),
      icon: getTypeIcon(sec.label),
      msgCount: endIdx - sec.index,
    }
  })
}

// ── 原始渲染（迷你版） ─────────────────────────────

function RawBlock({ block }: { block: TranscriptBlock }) {
  if (block.type === 'text') {
    return (
      <div style={{
        padding: '8px 12px', fontSize: 12, lineHeight: 1.6,
        color: 'var(--tc-foreground)', whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {block.text}
      </div>
    )
  }
  return (
    <div style={{
      margin: '4px 0', border: '1px solid var(--tc-border)',
      borderRadius: 4, overflow: 'hidden',
    }}>
      <div style={{
        padding: '4px 10px', fontSize: 11,
        fontFamily: "'Geist Mono', monospace",
        background: 'var(--tc-panel-bg)',
        borderBottom: '1px solid var(--tc-border)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontWeight: 600, color: 'var(--tc-foreground)' }}>
          {block.tool_name || 'Tool'}
        </span>
        {block.tool_error && (
          <span style={{ fontSize: 9, color: '#f85149', background: 'rgba(248,81,73,0.1)', padding: '1px 6px', borderRadius: 3 }}>ERROR</span>
        )}
      </div>
      {block.tool_input && (
        <pre style={{
          margin: 0, padding: '6px 10px', fontSize: 10,
          fontFamily: "'Geist Mono', monospace",
          color: 'var(--tc-foreground-secondary)', background: 'var(--tc-content-bg)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          borderBottom: block.tool_result ? '1px solid var(--tc-border)' : undefined,
          maxHeight: 120, overflowY: 'auto',
        }}>
          {JSON.stringify(block.tool_input, null, 2)}
        </pre>
      )}
      {block.tool_result && (
        <pre style={{
          margin: 0, padding: '6px 10px', fontSize: 10,
          fontFamily: "'Geist Mono', monospace",
          color: block.tool_error ? '#fda4af' : 'var(--tc-foreground-secondary)',
          background: 'var(--tc-content-bg)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          maxHeight: 160, overflowY: 'auto',
        }}>
          {block.tool_result}
        </pre>
      )}
    </div>
  )
}

function RawMessages({ msgs }: { msgs: TranscriptMessage[] }) {
  return (
    <>
      {msgs.map((msg, i) => {
        const isUser = msg.role === 'user'
        return (
          <div key={i} style={{ padding: '4px 8px' }}>
            <div style={{
              borderRadius: 6, border: '1px solid var(--tc-border)',
              background: isUser ? 'var(--tc-sidebar-item-hover)' : 'var(--tc-content-bg)',
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '3px 10px', fontSize: 9, fontWeight: 700,
                fontFamily: "'Geist Mono', monospace",
                textTransform: 'uppercase', letterSpacing: '0.5px',
                color: isUser ? '#eab308' : '#58a6ff',
                background: isUser ? 'rgba(234,179,8,0.06)' : 'rgba(88,166,255,0.06)',
                borderBottom: '1px solid var(--tc-border)',
              }}>
                {msg.role}
              </div>
              {msg.blocks.map((block, bi) => (
                <RawBlock key={bi} block={block} />
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}

// ── SVG 连线（卡片间） ─────────────────────────────

interface LineInfo {
  fromY: number
  toY: number
  color: string
}

function CardLines({ lines, containerH }: { lines: LineInfo[]; containerH: number }) {
  if (!lines.length || containerH <= 0) return null
  const W = 80
  return (
    <svg width={W} height={containerH} style={{ display: 'block', flexShrink: 0 }}>
      {lines.map((l, i) => {
        const cp = W * 0.4
        const d = `M 0,${l.fromY} C ${cp},${l.fromY} ${W - cp},${l.toY} ${W},${l.toY}`
        return (
          <g key={i}>
            <path d={d} fill="none" stroke={l.color} strokeWidth={1.5} strokeOpacity={0.5} />
            <circle cx={2} cy={l.fromY} r={3} fill={l.color} opacity={0.7} />
            <circle cx={W - 2} cy={l.toY} r={3} fill={l.color} opacity={0.7} />
          </g>
        )
      })}
    </svg>
  )
}

// ── 类型卡片 ────────────────────────────────────────

const cardBase: CSSProperties = {
  padding: '10px 14px',
  borderRadius: 8,
  cursor: 'pointer',
  transition: 'all 0.2s',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  userSelect: 'none',
}

function TypeCard({
  section,
  active,
  onClick,
}: {
  section: SectionData
  active: boolean
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        ...cardBase,
        background: active ? section.color.bg : 'rgba(255,255,255,0.02)',
        border: `1.5px solid ${active ? section.color.main : 'var(--tc-border)'}`,
        boxShadow: active ? `0 0 12px ${section.color.border}` : 'none',
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.borderColor = section.color.border
          e.currentTarget.style.background = section.color.bg
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.borderColor = 'var(--tc-border)'
          e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
        }
      }}
    >
      <span style={{ fontSize: 18, flexShrink: 0 }}>{section.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 600,
          color: active ? section.color.main : 'var(--tc-foreground)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {section.type}
        </div>
        <div style={{
          fontSize: 9, color: 'var(--tc-foreground-secondary)',
          fontFamily: "'Geist Mono', monospace",
          marginTop: 2,
        }}>
          {section.msgCount} msg
        </div>
      </div>
      <span style={{
        fontSize: 10, color: section.color.main, opacity: 0.6,
        fontFamily: "'Geist Mono', monospace",
      }}>
        #{DEMO_SECTIONS.findIndex(s => s.label === section.label) + 1}
      </span>
    </div>
  )
}

// ── 详情面板 ────────────────────────────────────────

function DetailPanel({
  section,
  messages,
  turns,
  onClose,
}: {
  section: SectionData
  messages: TranscriptMessage[]
  turns: GroupedTurnItem[]
  onClose: () => void
}) {
  const [expandSignal] = useState(1)

  // 提取该 section 涉及的 raw 消息
  const secIdx = DEMO_SECTIONS.findIndex(s => s.label === section.label)
  const nextSec = DEMO_SECTIONS[secIdx + 1]
  const startMsg = section.msgIndex
  const endMsg = nextSec ? nextSec.index : messages.length
  const rawMsgs = messages.slice(startMsg, endMsg)

  // 提取该 section 涉及的 turns
  const turnStart = section.turnIndex
  const turnEnd = nextSec
    ? (turns.findIndex(t => t.startIndex >= nextSec.index))
    : turns.length
  const sectionTurns = turns.slice(turnStart, turnEnd > turnStart ? turnEnd : turnStart + 1)

  return (
    <ExpandSignalCtx.Provider value={expandSignal}>
      <AutoExpandCtx.Provider value={true}>
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          borderLeft: '1px solid var(--tc-border)',
          minWidth: 0, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 16px',
            display: 'flex', alignItems: 'center', gap: 10,
            borderBottom: `2px solid ${section.color.main}`,
            background: section.color.bg,
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 20 }}>{section.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: section.color.main }}>
                {section.label}
              </div>
              <div style={{ fontSize: 10, color: 'var(--tc-foreground-secondary)', marginTop: 1 }}>
                {rawMsgs.length} raw messages → {sectionTurns.length} styled turns
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: 6,
                border: '1px solid var(--tc-border)',
                background: 'var(--tc-panel-bg)',
                color: 'var(--tc-foreground-secondary)',
                cursor: 'pointer', fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>

          {/* 对比区 */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Raw */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{
                padding: '5px 12px', fontSize: 9, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.5px',
                color: '#8b949e', background: 'var(--tc-panel-bg)',
                borderBottom: '1px solid var(--tc-border)',
                flexShrink: 0,
              }}>
                RAW
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                <RawMessages msgs={rawMsgs} />
              </div>
            </div>

            {/* Divider */}
            <div style={{
              width: 1, background: 'var(--tc-border)', flexShrink: 0,
            }} />

            {/* Styled */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{
                padding: '5px 12px', fontSize: 9, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.5px',
                color: '#58a6ff', background: 'var(--tc-panel-bg)',
                borderBottom: '1px solid var(--tc-border)',
                flexShrink: 0,
              }}>
                STYLED
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                {sectionTurns.map((item, i) => (
                  <div key={i}>
                    {item.kind === 'user'
                      ? <UserCard msg={item.msg} />
                      : <AssistantTurnCard turn={item.turn} />
                    }
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </AutoExpandCtx.Provider>
    </ExpandSignalCtx.Provider>
  )
}

// ── 主组件 ──────────────────────────────────────────

export function ChatDemo() {
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const leftRefs = useRef<(HTMLDivElement | null)[]>([])
  const rightRefs = useRef<(HTMLDivElement | null)[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const [lines, setLines] = useState<LineInfo[]>([])
  const [containerH, setContainerH] = useState(0)

  const turns = useMemo(() => groupMessagesIntoTurns(DEMO_MESSAGES), [])
  const sections = useMemo(() => buildSections(turns), [turns])

  // 计算连线
  const updateLines = useCallback(() => {
    const cEl = containerRef.current
    if (!cEl) return
    const cRect = cEl.getBoundingClientRect()
    setContainerH(cRect.height)

    const newLines: LineInfo[] = []
    for (let i = 0; i < sections.length; i++) {
      const lEl = leftRefs.current[i]
      const rEl = rightRefs.current[i]
      if (!lEl || !rEl) continue
      const lRect = lEl.getBoundingClientRect()
      const rRect = rEl.getBoundingClientRect()
      newLines.push({
        fromY: (lRect.top + lRect.bottom) / 2 - cRect.top,
        toY: (rRect.top + rRect.bottom) / 2 - cRect.top,
        color: sections[i].color.main,
      })
    }
    setLines(newLines)
  }, [sections])

  useEffect(() => {
    const timer = setTimeout(updateLines, 100)
    const obs = new ResizeObserver(updateLines)
    if (containerRef.current) obs.observe(containerRef.current)
    return () => { clearTimeout(timer); obs.disconnect() }
  }, [updateLines])

  // 滚动同步
  const leftScrollRef = useRef<HTMLDivElement>(null)
  const rightScrollRef = useRef<HTMLDivElement>(null)
  const scrollLock = useRef(false)

  const syncScroll = useCallback((source: 'left' | 'right') => {
    if (scrollLock.current) return
    scrollLock.current = true
    const from = source === 'left' ? leftScrollRef.current : rightScrollRef.current
    const to = source === 'left' ? rightScrollRef.current : leftScrollRef.current
    if (from && to) {
      const ratio = from.scrollTop / (from.scrollHeight - from.clientHeight || 1)
      to.scrollTop = ratio * (to.scrollHeight - to.clientHeight || 1)
    }
    updateLines()
    requestAnimationFrame(() => { scrollLock.current = false })
  }, [updateLines])

  const handleClick = useCallback((idx: number) => {
    setActiveIdx(prev => prev === idx ? null : idx)
  }, [])

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 160px)', gap: 0 }}>

      {/* ── 卡片画布区 ── */}
      <div
        ref={containerRef}
        style={{
          width: activeIdx !== null ? 380 : '100%',
          flexShrink: 0,
          display: 'flex',
          overflow: 'hidden',
          transition: 'width 0.3s ease',
          borderRight: activeIdx !== null ? 'none' : undefined,
        }}
      >
        {/* 左列 Raw 卡片 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{
            padding: '8px 14px', fontSize: 10, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.5px',
            color: '#8b949e', background: 'var(--tc-panel-bg)',
            borderBottom: '1px solid var(--tc-border)',
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#8b949e', opacity: 0.5 }} />
            RAW 类型
          </div>
          <div
            ref={leftScrollRef}
            onScroll={() => syncScroll('left')}
            style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}
          >
            {sections.map((sec, i) => (
              <div key={i} ref={el => { leftRefs.current[i] = el }}>
                <TypeCard section={sec} active={activeIdx === i} onClick={() => handleClick(i)} />
              </div>
            ))}
          </div>
        </div>

        {/* SVG 连线 */}
        <div style={{
          width: 80, flexShrink: 0,
          background: 'rgba(0,0,0,0.1)',
          borderLeft: '1px solid var(--tc-border)',
          borderRight: '1px solid var(--tc-border)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            height: 33,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderBottom: '1px solid var(--tc-border)',
            background: 'var(--tc-panel-bg)',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" strokeWidth="2" strokeLinecap="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
          <CardLines lines={lines} containerH={containerH} />
        </div>

        {/* 右列 Styled 卡片 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{
            padding: '8px 14px', fontSize: 10, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.5px',
            color: '#58a6ff', background: 'var(--tc-panel-bg)',
            borderBottom: '1px solid var(--tc-border)',
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#58a6ff' }} />
            STYLED 类型
          </div>
          <div
            ref={rightScrollRef}
            onScroll={() => syncScroll('right')}
            style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}
          >
            {sections.map((sec, i) => (
              <div key={i} ref={el => { rightRefs.current[i] = el }}>
                <TypeCard section={sec} active={activeIdx === i} onClick={() => handleClick(i)} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 详情面板 ── */}
      {activeIdx !== null && (
        <DetailPanel
          section={sections[activeIdx]}
          messages={DEMO_MESSAGES}
          turns={turns}
          onClose={() => setActiveIdx(null)}
        />
      )}
    </div>
  )
}
