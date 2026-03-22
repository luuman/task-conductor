/**
 * ChatDemo — 消息体 13 种类型样式预览
 * 左侧导航快速跳转，中间实际渲染效果
 */
import { useRef, useState, useMemo, useCallback } from 'react'
import { DEMO_MESSAGES, DEMO_SECTIONS } from './chat-demo-data'
import {
  groupMessagesIntoTurns,
  UserCard,
  AssistantTurnCard,
  ExpandSignalCtx,
  AutoExpandCtx,
} from '../../../components/ChatRenderer'

export function ChatDemo() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const [activeSection, setActiveSection] = useState(0)
  const [expandSignal, setExpandSignal] = useState(0)
  const [autoExpand] = useState(true)

  const turns = useMemo(() => groupMessagesIntoTurns(DEMO_MESSAGES), [])

  const scrollTo = useCallback((msgIndex: number, sectionIdx: number) => {
    // 找到该消息索引对应的 turn index
    const turnIdx = turns.findIndex(t => t.startIndex >= msgIndex)
    const target = turnIdx >= 0 ? turnIdx : turns.length - 1
    itemRefs.current[target]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setActiveSection(sectionIdx)
  }, [turns])

  return (
    <ExpandSignalCtx.Provider value={expandSignal}>
      <AutoExpandCtx.Provider value={autoExpand}>
        <div style={{ display: 'flex', height: 'calc(100vh - 160px)', gap: 0 }}>
          {/* ── 左侧：类型导航 ── */}
          <div style={{
            width: 200,
            flexShrink: 0,
            borderRight: '1px solid var(--tc-border)',
            overflowY: 'auto',
            padding: '8px 0',
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

            {/* 控制按钮 */}
            <div style={{ padding: '12px', borderTop: '1px solid var(--tc-border)', marginTop: 8 }}>
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

          {/* ── 中间：消息渲染 ── */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              background: 'var(--tc-content-bg)',
              padding: '8px 0',
            }}
          >
            {turns.map((item, i) => (
              <div
                key={i}
                ref={el => { itemRefs.current[i] = el }}
              >
                {item.kind === 'user'
                  ? <UserCard msg={item.msg} />
                  : <AssistantTurnCard turn={item.turn} />
                }
              </div>
            ))}
          </div>
        </div>
      </AutoExpandCtx.Provider>
    </ExpandSignalCtx.Provider>
  )
}
