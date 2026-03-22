/**
 * ChatDemo — 消息体类型样式预览（画布连线版）
 * 三栏：左侧导航 | 中间画布（Raw + 连线 + Styled）| 自动对齐
 *
 * 每条 raw 消息通过贝塞尔曲线连到对应的 styled turn，
 * 多条 raw → 同一 turn 时线条汇聚，直观展示分组效果。
 */
import { useRef, useState, useMemo, useCallback, useEffect } from 'react'
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

// ── 原始渲染 ────────────────────────────────────────

function RawBlock({ block }: { block: TranscriptBlock }) {
  if (block.type === 'text') {
    return (
      <div style={{
        padding: '8px 12px', fontSize: 12, lineHeight: 1.6,
        color: 'var(--tc-foreground)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
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
          <span style={{ fontSize: 9, color: '#f85149', background: 'rgba(248,81,73,0.1)', padding: '1px 6px', borderRadius: 3 }}>
            ERROR
          </span>
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

function RawMessage({ msg }: { msg: TranscriptMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{
      display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start',
      padding: '6px 12px',
    }}>
      <div style={{
        maxWidth: '90%', borderRadius: 6,
        border: '1px solid var(--tc-border)',
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
        {msg.blocks.map((block, i) => (
          <RawBlock key={i} block={block} />
        ))}
      </div>
    </div>
  )
}

// ── 连线颜色 ────────────────────────────────────────

const LINE_COLORS = [
  '#58a6ff', '#3fb950', '#d29922', '#f85149',
  '#bc8cff', '#39d2c0', '#ff7b72', '#79c0ff',
  '#56d364', '#e3b341', '#ffa657', '#a5d6ff',
]

function getLineColor(turnIdx: number): string {
  return LINE_COLORS[turnIdx % LINE_COLORS.length]
}

// ── 构建 raw→turn 映射 ─────────────────────────────

function buildMsgToTurnMap(
  messages: TranscriptMessage[],
  turns: GroupedTurnItem[],
): number[] {
  // msgToTurn[i] = 该 raw 消息对应的 turn 索引
  const map = new Array(messages.length).fill(0)
  for (let ti = turns.length - 1; ti >= 0; ti--) {
    const start = turns[ti].startIndex
    // 从 start 到下一个 turn 的 start - 1 都属于这个 turn
    const end = ti + 1 < turns.length ? turns[ti + 1].startIndex : messages.length
    for (let mi = start; mi < end; mi++) {
      map[mi] = ti
    }
  }
  return map
}

// ── SVG 连线层 ──────────────────────────────────────

interface LineData {
  rawY: number
  styledY: number
  color: string
  turnIdx: number
  msgIdx: number
}

function ConnectingLines({
  lines, height, gapWidth,
}: {
  lines: LineData[]
  height: number
  gapWidth: number
}) {
  if (lines.length === 0) return null

  return (
    <svg
      width={gapWidth}
      height={height}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {lines.map((line, i) => {
        const x1 = 0
        const x2 = gapWidth
        const cpOffset = gapWidth * 0.45
        const d = `M ${x1},${line.rawY} C ${x1 + cpOffset},${line.rawY} ${x2 - cpOffset},${line.styledY} ${x2},${line.styledY}`
        return (
          <g key={i}>
            <path
              d={d}
              fill="none"
              stroke={line.color}
              strokeWidth={1.5}
              strokeOpacity={0.4}
            />
            {/* 左端点 */}
            <circle cx={x1 + 2} cy={line.rawY} r={2.5} fill={line.color} opacity={0.6} />
            {/* 右端点 */}
            <circle cx={x2 - 2} cy={line.styledY} r={2.5} fill={line.color} opacity={0.6} />
          </g>
        )
      })}
    </svg>
  )
}

// ── 主组件 ──────────────────────────────────────────

const GAP_WIDTH = 60

export function ChatDemo() {
  const rawRefs = useRef<(HTMLDivElement | null)[]>([])
  const styledRefs = useRef<(HTMLDivElement | null)[]>([])
  const [activeSection, setActiveSection] = useState(0)
  const [expandSignal, setExpandSignal] = useState(0)
  const [autoExpand] = useState(true)

  const rawScrollRef = useRef<HTMLDivElement>(null)
  const styledScrollRef = useRef<HTMLDivElement>(null)
  const isScrolling = useRef(false)

  const [lines, setLines] = useState<LineData[]>([])
  const [canvasHeight, setCanvasHeight] = useState(0)
  const [tick, setTick] = useState(0) // force re-calc

  const turns = useMemo(() => groupMessagesIntoTurns(DEMO_MESSAGES), [])
  const msgToTurn = useMemo(() => buildMsgToTurnMap(DEMO_MESSAGES, turns), [turns])

  // 同步滚动
  const handleScroll = useCallback((source: 'raw' | 'styled') => {
    if (isScrolling.current) return
    isScrolling.current = true
    const from = source === 'raw' ? rawScrollRef.current : styledScrollRef.current
    const to = source === 'raw' ? styledScrollRef.current : rawScrollRef.current
    if (from && to) {
      const ratio = from.scrollTop / (from.scrollHeight - from.clientHeight || 1)
      to.scrollTop = ratio * (to.scrollHeight - to.clientHeight || 1)
    }
    // 触发连线重算
    setTick(t => t + 1)
    requestAnimationFrame(() => { isScrolling.current = false })
  }, [])

  // 计算连线位置
  useEffect(() => {
    const rawScroll = rawScrollRef.current
    const styledScroll = styledScrollRef.current
    if (!rawScroll || !styledScroll) return

    const rawRect = rawScroll.getBoundingClientRect()
    const styledRect = styledScroll.getBoundingClientRect()
    const viewTop = rawRect.top
    const viewBottom = rawRect.bottom

    const newLines: LineData[] = []

    for (let mi = 0; mi < DEMO_MESSAGES.length; mi++) {
      const rawEl = rawRefs.current[mi]
      const turnIdx = msgToTurn[mi]
      const styledEl = styledRefs.current[turnIdx]
      if (!rawEl || !styledEl) continue

      const rawElRect = rawEl.getBoundingClientRect()
      const styledElRect = styledEl.getBoundingClientRect()

      // raw 元素中心 Y（相对于 scroll 容器顶部）
      const rawCenterY = (rawElRect.top + rawElRect.bottom) / 2 - viewTop
      // styled 元素中心 Y
      const styledCenterY = (styledElRect.top + styledElRect.bottom) / 2 - viewTop

      // 只画可见区域内的线
      if (rawCenterY < -50 || rawCenterY > viewBottom - viewTop + 50) continue
      if (styledCenterY < -50 || styledCenterY > viewBottom - viewTop + 50) continue

      newLines.push({
        rawY: rawCenterY,
        styledY: styledCenterY,
        color: getLineColor(turnIdx),
        turnIdx,
        msgIdx: mi,
      })
    }

    setLines(newLines)
    setCanvasHeight(rawRect.height)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, msgToTurn, expandSignal])

  // 初始计算 + resize 监听
  useEffect(() => {
    const timer = setTimeout(() => setTick(1), 300)

    const obs = new ResizeObserver(() => setTick(t => t + 1))
    if (rawScrollRef.current) obs.observe(rawScrollRef.current)
    if (styledScrollRef.current) obs.observe(styledScrollRef.current)

    return () => {
      clearTimeout(timer)
      obs.disconnect()
    }
  }, [])

  const scrollTo = useCallback((msgIndex: number, sectionIdx: number) => {
    rawRefs.current[msgIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const turnIdx = turns.findIndex(t => t.startIndex >= msgIndex)
    const target = turnIdx >= 0 ? turnIdx : turns.length - 1
    styledRefs.current[target]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setActiveSection(sectionIdx)
    setTimeout(() => setTick(t => t + 1), 400)
  }, [turns])

  return (
    <ExpandSignalCtx.Provider value={expandSignal}>
      <AutoExpandCtx.Provider value={autoExpand}>
        <div style={{ display: 'flex', height: 'calc(100vh - 160px)', gap: 0 }}>

          {/* ── 左侧：导航 ── */}
          <div style={{
            width: 180, flexShrink: 0,
            borderRight: '1px solid var(--tc-border)',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              padding: '4px 12px 8px', fontSize: 10, fontWeight: 700,
              color: 'var(--tc-foreground-secondary)',
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              消息类型 ({DEMO_SECTIONS.length})
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {DEMO_SECTIONS.map((sec, i) => (
                <button
                  key={i}
                  onClick={() => scrollTo(sec.index, i)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '5px 12px', border: 'none',
                    background: activeSection === i ? 'rgba(0, 122, 204, 0.1)' : 'transparent',
                    color: activeSection === i ? 'var(--tc-border-active)' : 'var(--tc-foreground-secondary)',
                    fontSize: 11, cursor: 'pointer', transition: 'all 0.15s',
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

            {/* 控制 */}
            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--tc-border)' }}>
              <button
                onClick={() => { setExpandSignal(s => s + 1); setTimeout(() => setTick(t => t + 1), 300) }}
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
                onClick={() => { setExpandSignal(s => s - 1); setTimeout(() => setTick(t => t + 1), 300) }}
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

          {/* ── 中间画布区：Raw + SVG连线 + Styled ── */}
          <div style={{ flex: 1, display: 'flex', minWidth: 0, overflow: 'hidden' }}>

            {/* Raw 列 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{
                padding: '6px 12px', fontSize: 10, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.5px',
                color: '#8b949e', background: 'var(--tc-panel-bg)',
                borderBottom: '1px solid var(--tc-border)',
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#8b949e', opacity: 0.5,
                }} />
                RAW — 未优化
              </div>
              <div
                ref={rawScrollRef}
                onScroll={() => handleScroll('raw')}
                style={{
                  flex: 1, overflowY: 'auto',
                  background: 'var(--tc-content-bg)', padding: '8px 0',
                }}
              >
                {DEMO_MESSAGES.map((msg, i) => (
                  <div key={i} ref={el => { rawRefs.current[i] = el }}>
                    <RawMessage msg={msg} />
                  </div>
                ))}
              </div>
            </div>

            {/* SVG 连线 */}
            <div style={{
              width: GAP_WIDTH, flexShrink: 0,
              background: 'rgba(0,0,0,0.15)',
              borderLeft: '1px solid var(--tc-border)',
              borderRight: '1px solid var(--tc-border)',
              overflow: 'hidden',
              position: 'relative',
            }}>
              {/* 顶部标签 */}
              <div style={{
                height: 29, // 与列头高度对齐
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderBottom: '1px solid var(--tc-border)',
                background: 'var(--tc-panel-bg)',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" strokeWidth="2" strokeLinecap="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
              <ConnectingLines
                lines={lines}
                height={canvasHeight}
                gapWidth={GAP_WIDTH}
              />
            </div>

            {/* Styled 列 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{
                padding: '6px 12px', fontSize: 10, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.5px',
                color: '#58a6ff', background: 'var(--tc-panel-bg)',
                borderBottom: '1px solid var(--tc-border)',
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#58a6ff',
                }} />
                STYLED — 当前样式
              </div>
              <div
                ref={styledScrollRef}
                onScroll={() => handleScroll('styled')}
                style={{
                  flex: 1, overflowY: 'auto',
                  background: 'var(--tc-content-bg)', padding: '8px 0',
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
        </div>
      </AutoExpandCtx.Provider>
    </ExpandSignalCtx.Provider>
  )
}
