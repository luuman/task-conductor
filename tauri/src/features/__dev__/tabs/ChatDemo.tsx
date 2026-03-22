/**
 * ChatDemo — 先用最小用例验证连线，再渲染完整内容
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

// ── Raw 内容渲染 ────────────────────────────────────

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

// ── 节点数据 ────────────────────────────────────────

interface RawNodeData { label: string; color: string; icon: string; messages: TranscriptMessage[]; [k: string]: unknown }
interface StyledNodeData { label: string; color: string; icon: string; turns: GroupedTurnItem[]; rawCount: number; [k: string]: unknown }

// ── 简单标签节点（用于 source/target，保证连线可见）──

interface LabelNodeData { label: string; color: string; icon: string; side: 'raw' | 'styled'; [k: string]: unknown }

const LabelNode = memo(({ data }: NodeProps<Node<LabelNodeData>>) => (
  <div style={{
    padding: '6px 12px', borderRadius: 6,
    background: `${data.color}15`,
    border: `1.5px solid ${data.color}50`,
    fontSize: 11, fontWeight: 600,
    color: data.color,
    display: 'flex', alignItems: 'center', gap: 6,
    minWidth: 100,
  }}>
    <Handle type="target" position={Position.Left} style={{ background: data.color, width: 6, height: 6 }} />
    <span>{data.icon}</span>
    <span>{data.label}</span>
    <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 4 }}>{data.side === 'raw' ? '原始' : '渲染'}</span>
    <Handle type="source" position={Position.Right} style={{ background: data.color, width: 6, height: 6 }} />
  </div>
))
LabelNode.displayName = 'LabelNode'

// ── 内容节点（不参与连线，只展示内容）────────────────

const RawContentNode = memo(({ data }: NodeProps<Node<RawNodeData>>) => (
  <div style={{ width: 340 }}>
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
RawContentNode.displayName = 'RawContentNode'

function StyledContentInner({ turns }: { turns: GroupedTurnItem[] }) {
  return (
    <ExpandSignalCtx.Provider value={1}>
      <AutoExpandCtx.Provider value={true}>
        {turns.map((item, i) => {
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
      </AutoExpandCtx.Provider>
    </ExpandSignalCtx.Provider>
  )
}

const StyledContentNode = memo(({ data }: NodeProps<Node<StyledNodeData>>) => (
  <div style={{ width: 480 }}>
    <StyledContentInner turns={data.turns} />
  </div>
))
StyledContentNode.displayName = 'StyledContentNode'

const nodeTypes = {
  labelNode: LabelNode,
  rawContent: RawContentNode,
  styledContent: StyledContentNode,
}

// ── 布局 ────────────────────────────────────────────
// 每组 3 个节点：rawLabel ——连线——> styledLabel
//                rawContent（下方）  styledContent（下方）

const RAW_W = 340
const STYLED_W = 480
const PAIR_GAP = 200
const PAIR_TOTAL = RAW_W + PAIR_GAP + STYLED_W
const COL_GAP = 160
const ROW_PAD = 100
const COLS = 2
const LABEL_H = 36

function estimateH(msgCount: number, turnCount: number): number {
  const raw = msgCount * 160 + 60
  const styled = turnCount * 250 + 60
  return Math.max(raw, styled, 300)
}

function buildGraph(turns: GroupedTurnItem[]) {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const secs: Array<{
    rawMsgs: TranscriptMessage[]
    sectionTurns: GroupedTurnItem[]
    color: string
    icon: string
    label: string
    height: number
  }> = []

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

    secs.push({
      rawMsgs, sectionTurns,
      color: PALETTE[si % PALETTE.length],
      icon: getIcon(sec.label),
      label: sec.label,
      height: estimateH(rawMsgs.length, sectionTurns.length),
    })
  }

  const colY = new Array(COLS).fill(0)

  for (let si = 0; si < secs.length; si++) {
    const col = colY.indexOf(Math.min(...colY))
    const { rawMsgs, sectionTurns, color, icon, label, height } = secs[si]
    const x = col * (PAIR_TOTAL + COL_GAP)
    const y = colY[col]

    // 标签节点（用于连线）
    nodes.push({
      id: `rawLabel-${si}`,
      type: 'labelNode',
      position: { x: x + RAW_W / 2 - 60, y },
      data: { label, color, icon, side: 'raw' },
    })
    nodes.push({
      id: `styledLabel-${si}`,
      type: 'labelNode',
      position: { x: x + RAW_W + PAIR_GAP + STYLED_W / 2 - 60, y },
      data: { label, color, icon, side: 'styled' },
    })

    // 连线：rawLabel → styledLabel
    edges.push({
      id: `e-${si}`,
      source: `rawLabel-${si}`,
      target: `styledLabel-${si}`,
      type: 'default',
      style: { stroke: color, strokeWidth: 2 },
    })

    // 内容节点（在标签下方）
    nodes.push({
      id: `rawContent-${si}`,
      type: 'rawContent',
      position: { x, y: y + LABEL_H + 10 },
      data: { label, color, icon, messages: rawMsgs },
    })
    nodes.push({
      id: `styledContent-${si}`,
      type: 'styledContent',
      position: { x: x + RAW_W + PAIR_GAP, y: y + LABEL_H + 10 },
      data: { label, color, icon, turns: sectionTurns, rawCount: rawMsgs.length },
    })

    colY[col] += height + LABEL_H + ROW_PAD
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
  const { nodes: initNodes, edges: initEdges } = useMemo(() => buildGraph(turns), [turns])
  const [nodes, , onNodesChange] = useNodesState(initNodes)
  const [edges, , onEdgesChange] = useEdgesState(initEdges)
  const { fitView, fitBounds } = useReactFlow()

  useEffect(() => {
    setTimeout(() => fitView({ padding: 0.05, duration: 500 }), 300)
  }, [fitView])

  const handleJump = useCallback((idx: number) => {
    const r = nodes.find(n => n.id === `rawLabel-${idx}`)
    const s = nodes.find(n => n.id === `styledLabel-${idx}`)
    if (!r || !s) return
    const x = Math.min(r.position.x, s.position.x) - 60
    const y = r.position.y - 20
    const right = Math.max(r.position.x, s.position.x) + STYLED_W + 60
    fitBounds(
      { x, y, width: right - x, height: 660 },
      { padding: 0.08, duration: 600 },
    )
  }, [nodes, fitBounds])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={false}
        minZoom={0.03}
        maxZoom={1.2}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'var(--tc-content-bg)' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(255,255,255,0.03)" />
        <Controls position="bottom-left" style={{ background: 'var(--tc-panel-bg)', border: '1px solid var(--tc-border)', borderRadius: 8 }} />
        <MiniMap position="bottom-right"
          style={{ background: 'rgba(30,30,30,0.9)', border: '1px solid var(--tc-border)', borderRadius: 8 }}
          maskColor="rgba(0,0,0,0.5)"
          nodeColor={n => {
            const idx = parseInt(n.id.replace(/\D+/g, '') || '0')
            return PALETTE[idx % PALETTE.length]
          }}
        />
      </ReactFlow>
      <FloatingNav sections={DEMO_SECTIONS} onJump={handleJump} />
    </div>
  )
}

export function ChatDemo() {
  return (
    <div style={{ height: 'calc(100vh - 160px)', width: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 最小连线测试——如果这里能看到线，说明 xyflow 没问题 */}
      <EdgeTestBlock />
      {/* 完整画布 */}
      <div style={{ flex: 1 }}>
        <ReactFlowProvider><ChatDemoCanvas /></ReactFlowProvider>
      </div>
    </div>
  )
}

// ── 内联最小测试 ────────────────────────────────────

function SimpleSource({ data }: NodeProps) {
  return (
    <div style={{ padding: 12, background: '#1e1e2e', border: '2px solid #58a6ff', borderRadius: 8, color: '#fff' }}>
      {String(data?.label ?? 'A')}
      <Handle type="source" position={Position.Right} style={{ background: '#58a6ff' }} />
    </div>
  )
}
function SimpleTarget({ data }: NodeProps) {
  return (
    <div style={{ padding: 12, background: '#1e1e2e', border: '2px solid #3fb950', borderRadius: 8, color: '#fff' }}>
      <Handle type="target" position={Position.Left} style={{ background: '#3fb950' }} />
      {String(data?.label ?? 'B')}
    </div>
  )
}
const simpleTypes = { simpleSource: SimpleSource, simpleTarget: SimpleTarget }
const testNodes: Node[] = [
  { id: 'x', type: 'simpleSource', position: { x: 0, y: 50 }, data: { label: 'Raw' } },
  { id: 'y', type: 'simpleTarget', position: { x: 300, y: 50 }, data: { label: 'Styled' } },
]
const testEdges: Edge[] = [
  { id: 'xy', source: 'x', target: 'y' },
]

function EdgeTestInner() {
  const [n, , onN] = useNodesState(testNodes)
  const [e, , onE] = useEdgesState(testEdges)
  return (
    <ReactFlow nodes={n} edges={e} onNodesChange={onN} onEdgesChange={onE}
      nodeTypes={simpleTypes} fitView style={{ background: '#111' }} />
  )
}

function EdgeTestBlock() {
  return (
    <div style={{ height: 160, border: '2px dashed #f85149', borderRadius: 8, margin: 4, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 4, left: 8, fontSize: 10, color: '#f85149', zIndex: 10, fontWeight: 700 }}>
        连线测试（如果看不到线，是 xyflow 全局问题）
      </div>
      <ReactFlowProvider>
        <EdgeTestInner />
      </ReactFlowProvider>
    </div>
  )
}
