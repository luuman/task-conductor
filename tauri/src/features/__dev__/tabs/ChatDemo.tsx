/**
 * ChatDemo — 大画布展示所有消息类型
 * 左列 Raw 节点 ←连线→ 右列 Styled 节点，右侧悬浮导航
 */
import { useState, useMemo, useCallback, useEffect, memo } from 'react'
import {
  ReactFlow,
  Background,
  MiniMap,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
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

// ── 颜色 ────────────────────────────────────────────

const PALETTE = [
  '#58a6ff', '#3fb950', '#d29922', '#f85149',
  '#bc8cff', '#39d2c0', '#ff7b72', '#79c0ff',
  '#56d364', '#e3b341', '#ffa657', '#a5d6ff',
]

function getIcon(label: string): string {
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
  if (label.includes('Bash') && label.includes('TS')) return '🔴'
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

// ── Raw 渲染（节点内嵌） ────────────────────────────

function RawBlockMini({ block }: { block: TranscriptBlock }) {
  if (block.type === 'text') {
    const text = block.text || ''
    const preview = text.length > 200 ? text.slice(0, 200) + '…' : text
    return (
      <div style={{
        padding: '6px 10px', fontSize: 10.5, lineHeight: 1.5,
        color: 'var(--tc-foreground)', whiteSpace: 'pre-wrap',
        wordBreak: 'break-word', maxHeight: 140, overflowY: 'auto',
      }}>
        {preview}
      </div>
    )
  }
  return (
    <div style={{
      margin: '3px 0', border: '1px solid var(--tc-border)',
      borderRadius: 4, overflow: 'hidden',
    }}>
      <div style={{
        padding: '3px 8px', fontSize: 10,
        fontFamily: "'Geist Mono', monospace",
        background: 'var(--tc-panel-bg)',
        borderBottom: '1px solid var(--tc-border)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ fontWeight: 600, color: 'var(--tc-foreground)' }}>
          {block.tool_name || 'Tool'}
        </span>
        {block.tool_error && (
          <span style={{ fontSize: 8, color: '#f85149', background: 'rgba(248,81,73,0.1)', padding: '0 4px', borderRadius: 2 }}>ERR</span>
        )}
      </div>
      {block.tool_input && (
        <pre style={{
          margin: 0, padding: '4px 8px', fontSize: 9,
          fontFamily: "'Geist Mono', monospace",
          color: 'var(--tc-foreground-secondary)', background: 'var(--tc-content-bg)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          maxHeight: 80, overflowY: 'auto',
          borderBottom: block.tool_result ? '1px solid var(--tc-border)' : undefined,
        }}>
          {JSON.stringify(block.tool_input, null, 2)}
        </pre>
      )}
      {block.tool_result && (
        <pre style={{
          margin: 0, padding: '4px 8px', fontSize: 9,
          fontFamily: "'Geist Mono', monospace",
          color: block.tool_error ? '#fda4af' : 'var(--tc-foreground-secondary)',
          background: 'var(--tc-content-bg)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          maxHeight: 80, overflowY: 'auto',
        }}>
          {String(block.tool_result).slice(0, 300)}
        </pre>
      )}
    </div>
  )
}

// ── 节点类型定义 ────────────────────────────────────

interface RawNodeData {
  label: string
  color: string
  icon: string
  messages: TranscriptMessage[]
  [key: string]: unknown
}

interface StyledNodeData {
  label: string
  color: string
  icon: string
  turns: GroupedTurnItem[]
  rawCount: number
  [key: string]: unknown
}

// Raw 节点
const RawNode = memo(({ data }: NodeProps<Node<RawNodeData>>) => {
  return (
    <div style={{
      width: 320,
      borderRadius: 10,
      border: `1.5px solid ${data.color}40`,
      background: 'var(--tc-content-bg)',
      overflow: 'hidden',
      boxShadow: `0 2px 12px ${data.color}15`,
    }}>
      <Handle type="source" position={Position.Right}
        style={{ background: data.color, width: 8, height: 8, border: `2px solid ${data.color}` }} />
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        background: `${data.color}10`,
        borderBottom: `1px solid ${data.color}25`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 15 }}>{data.icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: data.color }}>
          RAW
        </span>
        <span style={{
          fontSize: 10, color: 'var(--tc-foreground-secondary)',
          fontFamily: "'Geist Mono', monospace",
        }}>
          {data.label}
        </span>
      </div>
      {/* Body */}
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {data.messages.map((msg, i) => (
          <div key={i} style={{ borderBottom: i < data.messages.length - 1 ? '1px solid var(--tc-border)' : undefined }}>
            <div style={{
              padding: '2px 8px', fontSize: 8, fontWeight: 700,
              fontFamily: "'Geist Mono', monospace",
              textTransform: 'uppercase', letterSpacing: '0.5px',
              color: msg.role === 'user' ? '#eab308' : '#58a6ff',
              background: msg.role === 'user' ? 'rgba(234,179,8,0.04)' : 'rgba(88,166,255,0.04)',
            }}>
              {msg.role}
            </div>
            {msg.blocks.map((b, bi) => <RawBlockMini key={bi} block={b} />)}
          </div>
        ))}
      </div>
    </div>
  )
})
RawNode.displayName = 'RawNode'

// Styled 节点
const StyledNode = memo(({ data }: NodeProps<Node<StyledNodeData>>) => {
  return (
    <ExpandSignalCtx.Provider value={1}>
      <AutoExpandCtx.Provider value={true}>
        <div style={{
          width: 420,
          borderRadius: 10,
          border: `1.5px solid ${data.color}40`,
          background: 'var(--tc-content-bg)',
          overflow: 'hidden',
          boxShadow: `0 2px 12px ${data.color}15`,
        }}>
          <Handle type="target" position={Position.Left}
            style={{ background: data.color, width: 8, height: 8, border: `2px solid ${data.color}` }} />
          {/* Header */}
          <div style={{
            padding: '8px 12px',
            background: `${data.color}10`,
            borderBottom: `1px solid ${data.color}25`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 15 }}>{data.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: data.color }}>
              STYLED
            </span>
            <span style={{
              fontSize: 10, color: 'var(--tc-foreground-secondary)',
              fontFamily: "'Geist Mono', monospace",
            }}>
              {data.label}
            </span>
            <span style={{
              marginLeft: 'auto', fontSize: 9,
              color: 'var(--tc-foreground-secondary)',
              fontFamily: "'Geist Mono', monospace",
            }}>
              {data.rawCount} msg → {data.turns.length} turn
            </span>
          </div>
          {/* Body */}
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {data.turns.map((item, i) => (
              <div key={i}>
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
})
StyledNode.displayName = 'StyledNode'

const nodeTypes = { rawNode: RawNode, styledNode: StyledNode }

// ── 布局计算 ────────────────────────────────────────

const RAW_X = 50
const STYLED_X = 550
const START_Y = 50
const GAP_Y = 60

function buildGraph(turns: GroupedTurnItem[]) {
  const nodes: Node[] = []
  const edges: Edge[] = []

  let yOffset = START_Y

  for (let si = 0; si < DEMO_SECTIONS.length; si++) {
    const sec = DEMO_SECTIONS[si]
    const nextSec = DEMO_SECTIONS[si + 1]
    const startMsg = sec.index
    const endMsg = nextSec ? nextSec.index : DEMO_MESSAGES.length
    const rawMsgs = DEMO_MESSAGES.slice(startMsg, endMsg)
    const color = PALETTE[si % PALETTE.length]
    const icon = getIcon(sec.label)

    // 对应的 turns
    const turnStart = turns.findIndex(t => t.startIndex >= startMsg)
    const turnEnd = nextSec
      ? turns.findIndex(t => t.startIndex >= nextSec.index)
      : turns.length
    const sectionTurns = turns.slice(
      turnStart >= 0 ? turnStart : 0,
      turnEnd > (turnStart >= 0 ? turnStart : 0) ? turnEnd : (turnStart >= 0 ? turnStart : 0) + 1,
    )

    const rawId = `raw-${si}`
    const styledId = `styled-${si}`

    nodes.push({
      id: rawId,
      type: 'rawNode',
      position: { x: RAW_X, y: yOffset },
      data: { label: sec.label, color, icon, messages: rawMsgs },
    })

    nodes.push({
      id: styledId,
      type: 'styledNode',
      position: { x: STYLED_X, y: yOffset },
      data: { label: sec.label, color, icon, turns: sectionTurns, rawCount: rawMsgs.length },
    })

    edges.push({
      id: `e-${si}`,
      source: rawId,
      target: styledId,
      style: { stroke: color, strokeWidth: 2, opacity: 0.5 },
      type: 'default',
      animated: false,
    })

    // 估算高度推进
    const rawH = Math.max(80, rawMsgs.length * 60 + 50)
    const styledH = Math.max(80, sectionTurns.length * 100 + 50)
    yOffset += Math.max(rawH, styledH) + GAP_Y
  }

  return { nodes, edges }
}

// ── 悬浮导航 ────────────────────────────────────────

function FloatingNav({
  sections,
  onJump,
}: {
  sections: typeof DEMO_SECTIONS
  onJump: (idx: number) => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div style={{
      position: 'absolute', top: 12, right: 12,
      zIndex: 10,
      width: collapsed ? 36 : 180,
      borderRadius: 10,
      border: '1px solid var(--tc-border)',
      background: 'rgba(30,30,30,0.92)',
      backdropFilter: 'blur(12px)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      overflow: 'hidden',
      transition: 'width 0.2s ease',
    }}>
      {/* Header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        style={{
          width: '100%', padding: collapsed ? '8px' : '8px 12px',
          display: 'flex', alignItems: 'center', gap: 6,
          border: 'none', background: 'none', cursor: 'pointer',
          borderBottom: collapsed ? 'none' : '1px solid var(--tc-border)',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
        {!collapsed && (
          <span style={{ fontSize: 10, fontWeight: 700, color: '#58a6ff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            导航 ({sections.length})
          </span>
        )}
      </button>

      {/* Items */}
      {!collapsed && (
        <div style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', padding: '4px 0' }}>
          {sections.map((sec, i) => (
            <button
              key={i}
              onClick={() => onJump(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                width: '100%', padding: '4px 10px',
                border: 'none', background: 'none',
                cursor: 'pointer', textAlign: 'left',
                transition: 'background 0.15s',
                fontSize: 10.5, color: 'var(--tc-foreground-secondary)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
            >
              <span style={{ fontSize: 12, flexShrink: 0 }}>{getIcon(sec.label)}</span>
              <span style={{
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                flex: 1,
              }}>
                {sec.label}
              </span>
              <span style={{
                fontSize: 8, color: PALETTE[i % PALETTE.length],
                fontFamily: "'Geist Mono', monospace", flexShrink: 0,
              }}>
                #{i + 1}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 内部画布 ────────────────────────────────────────

function ChatDemoCanvas() {
  const turns = useMemo(() => groupMessagesIntoTurns(DEMO_MESSAGES), [])
  const { nodes: initNodes, edges: initEdges } = useMemo(() => buildGraph(turns), [turns])

  const [nodes, , onNodesChange] = useNodesState(initNodes)
  const [edges, , onEdgesChange] = useEdgesState(initEdges)
  const { fitView, setCenter } = useReactFlow()

  // 初始 fitView
  useEffect(() => {
    setTimeout(() => fitView({ padding: 0.1, duration: 400 }), 200)
  }, [fitView])

  const handleJump = useCallback((idx: number) => {
    const rawNode = nodes.find(n => n.id === `raw-${idx}`)
    const styledNode = nodes.find(n => n.id === `styled-${idx}`)
    if (rawNode && styledNode) {
      const cx = (rawNode.position.x + styledNode.position.x + 420) / 2
      const cy = rawNode.position.y + 100
      setCenter(cx, cy, { zoom: 0.85, duration: 500 })
    }
  }, [nodes, setCenter])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={1.5}
        defaultEdgeOptions={{ type: 'default' }}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'var(--tc-content-bg)' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.04)" />
        <Controls
          position="bottom-left"
          style={{ background: 'var(--tc-panel-bg)', border: '1px solid var(--tc-border)', borderRadius: 8 }}
        />
        <MiniMap
          position="bottom-right"
          style={{
            background: 'rgba(30,30,30,0.9)',
            border: '1px solid var(--tc-border)',
            borderRadius: 8,
          }}
          maskColor="rgba(0,0,0,0.5)"
          nodeColor={(n) => {
            const idx = parseInt(n.id.split('-')[1])
            return PALETTE[idx % PALETTE.length]
          }}
        />
      </ReactFlow>
      <FloatingNav sections={DEMO_SECTIONS} onJump={handleJump} />
    </div>
  )
}

// ── 导出 ────────────────────────────────────────────

export function ChatDemo() {
  return (
    <div style={{ height: 'calc(100vh - 160px)', width: '100%' }}>
      <ReactFlowProvider>
        <ChatDemoCanvas />
      </ReactFlowProvider>
    </div>
  )
}
