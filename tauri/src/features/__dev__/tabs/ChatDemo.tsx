/**
 * ChatDemo — 消息体 13 种类型样式预览
 * 三栏：左侧导航 | 中间原始渲染（对照） | 右侧当前样式
 */
import { useRef, useState, useMemo, useCallback } from 'react'
import { DEMO_MESSAGES, DEMO_SECTIONS } from './chat-demo-data'
import type { TranscriptMessage, TranscriptBlock } from '../../../lib/api/types'
import {
  groupMessagesIntoTurns,
  UserCard,
  AssistantTurnCard,
  ExpandSignalCtx,
  AutoExpandCtx,
} from '../../../components/ChatRenderer'

// ── 原始渲染：无样式纯文本展示 ─────────────────────────

function RawBlock({ block }: { block: TranscriptBlock }) {
  if (block.type === 'text') {
    return (
      <div style={{
        padding: '8px 12px',
        fontSize: 12,
        lineHeight: 1.6,
        color: 'var(--tc-foreground)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {block.text}
      </div>
    )
  }
  // tool_use
  return (
    <div style={{
      margin: '4px 0',
      border: '1px solid var(--tc-border)',
      borderRadius: 4,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '4px 10px',
        fontSize: 11,
        fontFamily: "'Geist Mono', monospace",
        background: 'var(--tc-panel-bg)',
        borderBottom: '1px solid var(--tc-border)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ fontWeight: 600, color: 'var(--tc-foreground)' }}>
          {block.tool_name || 'Tool'}
        </span>
        {block.tool_error && (
          <span style={{ fontSize: 9, color: '#f85149', background: 'rgba(248,81,73,0.1)', padding: '1px 6px', borderRadius: 3 }}>
            ERROR
          </span>
        )}
      </div>
      {block.tool_input && (
        <pre style={{
          margin: 0,
          padding: '6px 10px',
          fontSize: 10,
          fontFamily: "'Geist Mono', monospace",
          color: 'var(--tc-foreground-secondary)',
          background: 'var(--tc-content-bg)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          borderBottom: block.tool_result ? '1px solid var(--tc-border)' : undefined,
          maxHeight: 120,
          overflowY: 'auto',
        }}>
          {JSON.stringify(block.tool_input, null, 2)}
        </pre>
      )}
      {block.tool_result && (
        <pre style={{
          margin: 0,
          padding: '6px 10px',
          fontSize: 10,
          fontFamily: "'Geist Mono', monospace",
          color: block.tool_error ? '#fda4af' : 'var(--tc-foreground-secondary)',
          background: 'var(--tc-content-bg)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: 160,
          overflowY: 'auto',
        }}>
          {block.tool_result}
        </pre>
      )}
    </div>
  )
}

function RawMessage({ msg }: { msg: TranscriptMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      padding: '6px 12px',
    }}>
      <div style={{
        maxWidth: '90%',
        borderRadius: 6,
        border: '1px solid var(--tc-border)',
        background: isUser ? 'var(--tc-sidebar-item-hover)' : 'var(--tc-content-bg)',
        overflow: 'hidden',
      }}>
        {/* role 标签 */}
        <div style={{
          padding: '3px 10px',
          fontSize: 9,
          fontWeight: 700,
          fontFamily: "'Geist Mono', monospace",
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: isUser ? '#eab308' : '#58a6ff',
          background: isUser ? 'rgba(234,179,8,0.06)' : 'rgba(88,166,255,0.06)',
          borderBottom: '1px solid var(--tc-border)',
        }}>
          {msg.role}
        </div>
        {msg.blocks.map((block, i) => (
          <RawBlock key={i} block={block} />
        ))}
      </div>
    </div>
  )
}

function RawMessageList({ messages, itemRefs }: {
  messages: TranscriptMessage[]
  itemRefs: React.RefObject<(HTMLDivElement | null)[]>
}) {
  return (
    <>
      {messages.map((msg, i) => (
        <div key={i} ref={el => { itemRefs.current![i] = el }}>
          <RawMessage msg={msg} />
        </div>
      ))}
    </>
  )
}

// ── 主组件 ──────────────────────────────────────────

export function ChatDemo() {
  const rawRefs = useRef<(HTMLDivElement | null)[]>([])
  const styledRefs = useRef<(HTMLDivElement | null)[]>([])
  const [activeSection, setActiveSection] = useState(0)
  const [expandSignal, setExpandSignal] = useState(0)
  const [autoExpand] = useState(true)
  const [syncScroll, setSyncScroll] = useState(true)
  const rawScrollRef = useRef<HTMLDivElement>(null)
  const styledScrollRef = useRef<HTMLDivElement>(null)
  const isScrolling = useRef(false)

  const turns = useMemo(() => groupMessagesIntoTurns(DEMO_MESSAGES), [])

  // 同步滚动
  const handleScroll = useCallback((source: 'raw' | 'styled') => {
    if (!syncScroll || isScrolling.current) return
    isScrolling.current = true
    const from = source === 'raw' ? rawScrollRef.current : styledScrollRef.current
    const to = source === 'raw' ? styledScrollRef.current : rawScrollRef.current
    if (from && to) {
      const ratio = from.scrollTop / (from.scrollHeight - from.clientHeight || 1)
      to.scrollTop = ratio * (to.scrollHeight - to.clientHeight || 1)
    }
    requestAnimationFrame(() => { isScrolling.current = false })
  }, [syncScroll])

  const scrollTo = useCallback((msgIndex: number, sectionIdx: number) => {
    // raw 列直接按消息 index 跳
    rawRefs.current[msgIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // styled 列按 turn index 跳
    const turnIdx = turns.findIndex(t => t.startIndex >= msgIndex)
    const target = turnIdx >= 0 ? turnIdx : turns.length - 1
    styledRefs.current[target]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setActiveSection(sectionIdx)
  }, [turns])

  return (
    <ExpandSignalCtx.Provider value={expandSignal}>
      <AutoExpandCtx.Provider value={autoExpand}>
        <div style={{ display: 'flex', height: 'calc(100vh - 160px)', gap: 0 }}>

          {/* ── 左侧：类型导航 ── */}
          <div style={{
            width: 180,
            flexShrink: 0,
            borderRight: '1px solid var(--tc-border)',
            overflowY: 'auto',
            padding: '8px 0',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{
              padding: '4px 12px 8px',
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--tc-foreground-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              消息类型 ({DEMO_SECTIONS.length})
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {DEMO_SECTIONS.map((sec, i) => (
                <button
                  key={i}
                  onClick={() => scrollTo(sec.index, i)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '5px 12px',
                    border: 'none',
                    background: activeSection === i ? 'rgba(0, 122, 204, 0.1)' : 'transparent',
                    color: activeSection === i ? 'var(--tc-border-active)' : 'var(--tc-foreground-secondary)',
                    fontSize: 11,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    borderLeft: activeSection === i ? '2px solid var(--tc-border-active)' : '2px solid transparent',
                  }}
                  onMouseEnter={e => {
                    if (activeSection !== i) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                  }}
                  onMouseLeave={e => {
                    if (activeSection !== i) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {sec.label}
                </button>
              ))}
            </div>

            {/* 控制按钮 */}
            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--tc-border)' }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 10, color: 'var(--tc-foreground-secondary)',
                cursor: 'pointer', marginBottom: 8,
              }}>
                <input
                  type="checkbox"
                  checked={syncScroll}
                  onChange={e => setSyncScroll(e.target.checked)}
                  style={{ accentColor: 'var(--tc-border-active)' }}
                />
                同步滚动
              </label>
              <button
                onClick={() => setExpandSignal(s => s + 1)}
                style={{
                  width: '100%', padding: '4px 8px', marginBottom: 4,
                  fontSize: 10, border: '1px solid var(--tc-border)',
                  borderRadius: 4, background: 'var(--tc-panel-bg)',
                  color: 'var(--tc-foreground-secondary)', cursor: 'pointer',
                }}
              >
                全部展开
              </button>
              <button
                onClick={() => setExpandSignal(s => s - 1)}
                style={{
                  width: '100%', padding: '4px 8px',
                  fontSize: 10, border: '1px solid var(--tc-border)',
                  borderRadius: 4, background: 'var(--tc-panel-bg)',
                  color: 'var(--tc-foreground-secondary)', cursor: 'pointer',
                }}
              >
                全部收起
              </button>
            </div>
          </div>

          {/* ── 中列：原始渲染（未优化） ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--tc-border)', minWidth: 0 }}>
            <div style={{
              padding: '6px 12px',
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: '#8b949e',
              background: 'var(--tc-panel-bg)',
              borderBottom: '1px solid var(--tc-border)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: '#8b949e', opacity: 0.5, flexShrink: 0,
              }} />
              RAW — 未优化
            </div>
            <div
              ref={rawScrollRef}
              onScroll={() => handleScroll('raw')}
              style={{
                flex: 1,
                overflowY: 'auto',
                background: 'var(--tc-content-bg)',
                padding: '8px 0',
              }}
            >
              <RawMessageList messages={DEMO_MESSAGES} itemRefs={rawRefs} />
            </div>
          </div>

          {/* ── 右列：当前样式（已优化） ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{
              padding: '6px 12px',
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: '#58a6ff',
              background: 'var(--tc-panel-bg)',
              borderBottom: '1px solid var(--tc-border)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: '#58a6ff', flexShrink: 0,
              }} />
              STYLED — 当前样式
            </div>
            <div
              ref={styledScrollRef}
              onScroll={() => handleScroll('styled')}
              style={{
                flex: 1,
                overflowY: 'auto',
                background: 'var(--tc-content-bg)',
                padding: '8px 0',
              }}
            >
              {turns.map((item, i) => (
                <div key={i} ref={el => { styledRefs.current[i] = el }}>
                  {item.kind === 'user'
                    ? <UserCard msg={item.msg} />
                    : <AssistantTurnCard turn={item.turn} />
                  }
                </div>
              ))}
            </div>
          </div>

        </div>
      </AutoExpandCtx.Provider>
    </ExpandSignalCtx.Provider>
  )
}
