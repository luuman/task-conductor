/**
 * ChatDemo — 散落式画布，每组 = Raw卡片 ←连线→ Styled卡片
 * 无外框、无头像，纯内容展示
 */
import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react'
import {
  ReactFlow,
  Background,
  MiniMap,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useNodesInitialized,
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
  RichTextBlock,
  ReadPillRow,
  EditInlineCard,
  BashStatusLine,
  ToolWidget,
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

// ── Raw 节点：纯内容，无外框 ────────────────────────

function RawBlockContent({ block }: { block: TranscriptBlock }) {
  if (block.type === 'text') {
    return (
      <div style={{
        padding: '6px 10px', fontSize: 10.5, lineHeight: 1.5,
        color: 'var(--tc-foreground)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {block.text}
      </div>
    )
  }
  return (
    <div style={{
      margin: '3px 6px', border: '1px solid var(--tc-border)', borderRadius: 4, overflow: 'hidden',
    }}>
      <div style={{
        padding: '3px 8px', fontSize: 10, fontFamily: "'Geist Mono', monospace",
        background: 'var(--tc-panel-bg)', borderBottom: '1px solid var(--tc-border)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ fontWeight: 600, color: 'var(--tc-foreground)' }}>{block.tool_name || 'Tool'}</span>
        {block.tool_error && (
          <span style={{ fontSize: 8, color: '#f85149', background: 'rgba(248,81,73,0.1)', padding: '0 4px', borderRadius: 2 }}>ERR</span>
        )}
      </div>
      {block.tool_input && (
        <pre style={{
          margin: 0, padding: '4px 8px', fontSize: 9, fontFamily: "'Geist Mono', monospace",
          color: 'var(--tc-foreground-secondary)', background: 'var(--tc-content-bg)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          borderBottom: block.tool_result ? '1px solid var(--tc-border)' : undefined,
        }}>
          {JSON.stringify(block.tool_input, null, 2)}
        </pre>
      )}
      {block.tool_result && (
        <pre style={{
          margin: 0, padding: '4px 8px', fontSize: 9, fontFamily: "'Geist Mono', monospace",
          color: block.tool_error ? '#fda4af' : 'var(--tc-foreground-secondary)',
          background: 'var(--tc-content-bg)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {block.tool_result}
        </pre>
      )}
    </div>
  )
}

interface RawNodeData { label: string; color: string; icon: string; messages: TranscriptMessage[]; [k: string]: unknown }
interface StyledNodeData { label: string; color: string; icon: string; turns: GroupedTurnItem[]; rawCount: number; [k: string]: unknown }

// Raw 节点：纯内容，无外壳
const RawNode = memo(({ data }: NodeProps<Node<RawNodeData>>) => (
  <div style={{
    width: 340, position: 'relative', minHeight: 20,
    padding: 4, borderRadius: 10,
    border: '1px solid transparent',
    background: 'transparent',
  }}>
    <Handle type="source" position={Position.Right}
      style={{ background: data.color, width: 8, height: 8, border: `2px solid ${data.color}` }} />
    {data.messages.map((msg, i) => {
      const isUser = msg.role === 'user'
      return (
        <div key={i} style={{
          marginBottom: i < data.messages.length - 1 ? 6 : 0,
          borderRadius: 8,
          border: `1px solid ${isUser ? 'var(--tc-border)' : 'rgba(88,166,255,0.15)'}`,
          background: isUser ? 'var(--tc-sidebar-item-hover)' : 'var(--tc-content-bg)',
          overflow: 'hidden',
        }}>
          {msg.blocks.map((b, bi) => <RawBlockContent key={bi} block={b} />)}
        </div>
      )
    })}
  </div>
))
RawNode.displayName = 'RawNode'

// Styled 节点：纯内容，无外壳，无头像
const StyledNode = memo(({ data }: NodeProps<Node<StyledNodeData>>) => (
  <ExpandSignalCtx.Provider value={1}>
    <AutoExpandCtx.Provider value={true}>
      <div style={{
        width: 480, position: 'relative', minHeight: 20,
        padding: 4, borderRadius: 10,
        border: '1px solid transparent',
        background: 'transparent',
      }}>
        <Handle type="target" position={Position.Left}
          style={{ background: data.color, width: 8, height: 8, border: `2px solid ${data.color}` }} />
        {data.turns.map((item, i) => {
          if (item.kind === 'user') {
            const text = item.msg.blocks.filter(b => b.type === 'text').map(b => b.text || '').join('\n').trim()
            if (!text) return null
            return (
              <div key={i} style={{
                padding: '8px 12px', borderRadius: 8, marginBottom: 6,
                background: 'var(--tc-sidebar-item-hover)', border: '1px solid var(--tc-border)',
                fontSize: 12.5, lineHeight: 1.6, color: 'var(--tc-foreground)',
              }}>
                <RichTextBlock text={text} />
              </div>
            )
          }
          const { turn } = item
          return (
            <div key={i} style={{
              padding: '8px 12px', borderRadius: 8, marginBottom: 6,
              background: 'rgba(68,119,255,0.04)', border: '1px solid rgba(68,119,255,0.12)',
              fontSize: 12.5, lineHeight: 1.6, color: 'var(--tc-foreground)',
            }}>
              {turn.texts.map((t, ti) => <RichTextBlock key={`t${ti}`} text={t} />)}
              {turn.reads.length > 0 && <ReadPillRow blocks={turn.reads} />}
              {turn.edits.map((block, ei) => <EditInlineCard key={`e${ei}`} block={block} />)}
              {turn.bashes.map((block, bi) => <BashStatusLine key={`b${bi}`} block={block} />)}
              {turn.others.map((block, oi) => <ToolWidget key={`o${oi}`} block={block} />)}
            </div>
          )
        })}
      </div>
    </AutoExpandCtx.Provider>
  </ExpandSignalCtx.Provider>
))
StyledNode.displayName = 'StyledNode'

const nodeTypes = { rawNode: RawNode, styledNode: StyledNode }

// ── 布局 ────────────────────────────────────────────

const RAW_W = 340
const STYLED_W = 480
const PAIR_GAP = 200

function buildInitialGraph(turns: GroupedTurnItem[]) {
  const nodes: Node[] = []
  const edges: Edge[] = []

  // 初始全部 y=0，等渲染后用实际高度重排
  for (let si = 0; si < DEMO_SECTIONS.length; si++) {
    const sec = DEMO_SECTIONS[si]
    const nextSec = DEMO_SECTIONS[si + 1]
    const startMsg = sec.index
    const endMsg = nextSec ? nextSec.index : DEMO_MESSAGES.length
    const rawMsgs = DEMO_MESSAGES.slice(startMsg, endMsg)

    const turnStart = turns.findIndex(t => t.startIndex >= startMsg)
    const turnEnd = nextSec ? turns.findIndex(t => t.startIndex >= nextSec.index) : turns.length
    const sectionTurns = turns.slice(
      turnStart >= 0 ? turnStart : 0,
      turnEnd > (turnStart >= 0 ? turnStart : 0) ? turnEnd : (turnStart >= 0 ? turnStart : 0) + 1,
    )

    const color = PALETTE[si % PALETTE.length]
    const icon = getIcon(sec.label)

    nodes.push({
      id: `raw-${si}`, type: 'rawNode',
      position: { x: 0, y: 0 },
      data: { label: sec.label, color, icon, messages: rawMsgs },
      style: { width: RAW_W + 8 },
    })
    nodes.push({
      id: `styled-${si}`, type: 'styledNode',
      position: { x: RAW_W + PAIR_GAP, y: 0 },
      data: { label: sec.label, color, icon, turns: sectionTurns, rawCount: rawMsgs.length },
      style: { width: STYLED_W + 8 },
    })
    edges.push({
      id: `e-${si}`,
      source: `raw-${si}`,
      target: `styled-${si}`,
      style: { stroke: color, strokeWidth: 2, opacity: 0.5 },
      type: 'smoothstep',
    })
  }

  return { nodes, edges }
}

// ── 悬浮导航 ────────────────────────────────────────

function FloatingNav({ sections, onJump }: { sections: typeof DEMO_SECTIONS; onJump: (i: number) => void }) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div style={{
      position: 'absolute', top: 12, right: 12, zIndex: 10,
      width: collapsed ? 36 : 180, borderRadius: 10,
      border: '1px solid var(--tc-border)',
      background: 'rgba(30,30,30,0.92)', backdropFilter: 'blur(12px)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)', overflow: 'hidden',
      transition: 'width 0.2s ease',
    }}>
      <button onClick={() => setCollapsed(v => !v)} style={{
        width: '100%', padding: collapsed ? '8px' : '8px 12px',
        display: 'flex', alignItems: 'center', gap: 6,
        border: 'none', background: 'none', cursor: 'pointer',
        borderBottom: collapsed ? 'none' : '1px solid var(--tc-border)',
        justifyContent: collapsed ? 'center' : 'flex-start',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
        </svg>
        {!collapsed && <span style={{ fontSize: 10, fontWeight: 700, color: '#58a6ff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>导航 ({sections.length})</span>}
      </button>
      {!collapsed && (
        <div style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', padding: '4px 0' }}>
          {sections.map((sec, i) => (
            <button key={i} onClick={() => onJump(i)} style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '4px 10px',
              border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
              transition: 'background 0.15s', fontSize: 10.5, color: 'var(--tc-foreground-secondary)',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
            >
              <span style={{ fontSize: 12, flexShrink: 0 }}>{getIcon(sec.label)}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{sec.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 画布 ────────────────────────────────────────────

function ChatDemoCanvas() {
  const turns = useMemo(() => groupMessagesIntoTurns(DEMO_MESSAGES), [])
  const { nodes: initNodes, edges: initEdges } = useMemo(() => buildInitialGraph(turns), [turns])
  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes)
  const [edges, , onEdgesChange] = useEdgesState(initEdges)
  const { fitView, fitBounds, getInternalNode } = useReactFlow()
  const initialized = useNodesInitialized()
  const didLayout = useRef(false)

  // 节点渲染后用实际高度重排
  useEffect(() => {
    if (!initialized || didLayout.current) return
    didLayout.current = true

    // 读取每对节点的实际高度
    const pairHeights: number[] = []
    for (let si = 0; si < DEMO_SECTIONS.length; si++) {
      const rawNode = getInternalNode(`raw-${si}`)
      const styledNode = getInternalNode(`styled-${si}`)
      const rh = rawNode?.measured?.height ?? 200
      const sh = styledNode?.measured?.height ?? 200
      pairHeights.push(Math.max(rh, sh))
    }

    // 瀑布流 3 列
    const COLS = 3
    const COL_GAP = 120
    const ROW_PAD = 60
    const colY = new Array(COLS).fill(0)
    const pairTotal = RAW_W + PAIR_GAP + STYLED_W

    setNodes(prev => {
      const updated = [...prev]
      for (let si = 0; si < DEMO_SECTIONS.length; si++) {
        const col = colY.indexOf(Math.min(...colY))
        const x = col * (pairTotal + COL_GAP)
        const y = colY[col]

        const rawIdx = updated.findIndex(n => n.id === `raw-${si}`)
        const styledIdx = updated.findIndex(n => n.id === `styled-${si}`)
        if (rawIdx >= 0) updated[rawIdx] = { ...updated[rawIdx], position: { x, y } }
        if (styledIdx >= 0) updated[styledIdx] = { ...updated[styledIdx], position: { x: x + RAW_W + PAIR_GAP, y } }

        colY[col] += pairHeights[si] + ROW_PAD
      }
      return updated
    })

    setTimeout(() => fitView({ padding: 0.05, duration: 500 }), 100)
  }, [initialized, getInternalNode, setNodes, fitView])

  const handleJump = useCallback((idx: number) => {
    const r = nodes.find(n => n.id === `raw-${idx}`)
    const s = nodes.find(n => n.id === `styled-${idx}`)
    if (r && s) {
      const rawH = getInternalNode(`raw-${idx}`)?.measured?.height ?? 300
      const styledH = getInternalNode(`styled-${idx}`)?.measured?.height ?? 300
      const x = Math.min(r.position.x, s.position.x)
      const y = Math.min(r.position.y, s.position.y)
      const right = Math.max(r.position.x + RAW_W, s.position.x + STYLED_W)
      const bottom = Math.max(r.position.y + rawH, s.position.y + styledH)
      fitBounds(
        { x: x - 20, y: y - 20, width: right - x + 40, height: bottom - y + 40 },
        { padding: 0.08, duration: 600 },
      )
    }
  }, [nodes, fitBounds, getInternalNode])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes} fitView
        nodesDraggable={false}
        minZoom={0.03} maxZoom={1.2}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'var(--tc-content-bg)' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(255,255,255,0.03)" />
        <Controls position="bottom-left" style={{ background: 'var(--tc-panel-bg)', border: '1px solid var(--tc-border)', borderRadius: 8 }} />
        <MiniMap position="bottom-right"
          style={{ background: 'rgba(30,30,30,0.9)', border: '1px solid var(--tc-border)', borderRadius: 8 }}
          maskColor="rgba(0,0,0,0.5)"
          nodeColor={n => PALETTE[parseInt(n.id.split('-')[1]) % PALETTE.length]}
        />
      </ReactFlow>
      <FloatingNav sections={DEMO_SECTIONS} onJump={handleJump} />
    </div>
  )
}

export function ChatDemo() {
  return (
    <div style={{ height: 'calc(100vh - 160px)', width: '100%' }}>
      <ReactFlowProvider><ChatDemoCanvas /></ReactFlowProvider>
    </div>
  )
}
