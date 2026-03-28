/**
 * ChatDemo — 画布卡片 + SVG 手绘连线
 * 展示 /chat 页面的 5 种实际渲染样式（a/b/d/g/h）与原始消息并排对比
 */
import React, { useMemo, useCallback, useEffect, memo } from 'react'
import {
  IconUser, IconPencil, IconLayoutGrid, IconClipboard, IconSettings, IconSearch,
  IconFileText, IconTerminal, IconBot, IconCircleHelp, IconGlobe, IconRadio,
  IconBlocks, IconFilePlus, IconLink,
} from '../../../ui/icon'
import {
  ReactFlow,
  Background,
  MiniMap,
  Controls,
  useNodesState,
  useReactFlow,
  useViewport,
  ReactFlowProvider,
  type Node,
  type NodeProps,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { DEMO_MESSAGES, DEMO_SECTIONS } from './chat-demo-data'
import type { TranscriptMessage, TranscriptBlock } from '../../../lib/api/types'
import { parseTimelineWithQuestions } from '../../chat/timeline-parser'
import type { TimelineStep } from '../../chat/timeline-parser'
import { StyleA, StyleB, StyleD, StyleG, StyleH, groupConsecutiveSameType } from '../../chat'
import type { StyleKey } from '../../chat'

// ── 颜色 ────────────────────────────────────────────

const PALETTE = [
  '#58a6ff', '#3fb950', '#d29922', '#f85149',
  '#bc8cff', '#39d2c0', '#ff7b72', '#79c0ff',
  '#56d364', '#e3b341', '#ffa657', '#a5d6ff',
]

function getIcon(label: string): React.ReactNode {
  const s = 11
  if (label.includes('用户')) return <IconUser size={s} />
  if (label.includes('Markdown')) return <IconFilePlus size={s} />
  if (label.includes('代码')) return <IconTerminal size={s} />
  if (label.includes('Mermaid')) return <IconLayoutGrid size={s} />
  if (label.includes('Task N')) return <IconClipboard size={s} />
  if (label.includes('System')) return <IconSettings size={s} />
  if (label.includes('Read') && label.includes('Grep')) return <IconSearch size={s} />
  if (label.includes('Read') && label.includes('ERROR')) return <IconFileText size={s} />
  if (label.includes('Edit') && label.includes('diff')) return <IconPencil size={s} />
  if (label.includes('MultiEdit')) return <IconPencil size={s} />
  if (label.includes('Write')) return <IconFileText size={s} />
  if (label.includes('Bash')) return <IconTerminal size={s} />
  if (label.includes('Agent')) return <IconBot size={s} />
  if (label.includes('AskUser')) return <IconCircleHelp size={s} />
  if (label.includes('WebSearch')) return <IconGlobe size={s} />
  if (label.includes('WebFetch')) return <IconRadio size={s} />
  if (label.includes('Skill')) return <IconBlocks size={s} />
  if (label.includes('TaskCreate')) return <IconClipboard size={s} />
  if (label.includes('Unknown')) return <IconCircleHelp size={s} />
  if (label.includes('Edit') && label.includes('ERROR')) return <IconPencil size={s} />
  return <IconLink size={s} />
}

// ── Raw 内容 ────────────────────────────────────────

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

// ── 节点数据类型 ─────────────────────────────────────

interface RawNodeData {
  label: string; color: string; icon: React.ReactNode
  messages: TranscriptMessage[]; pairIndex: number
  [k: string]: unknown
}

interface StyledNodeData {
  label: string; color: string
  steps: TimelineStep[]; pairIndex: number
  [k: string]: unknown
}

// ── Raw 节点 ────────────────────────────────────────

const RawNode = memo(({ data }: NodeProps<Node<RawNodeData>>) => (
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
RawNode.displayName = 'RawNode'

// ── 文件图标映射 ────────────────────────────────────

export function getFileIcon(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'file_type_typescript.svg', tsx: 'file_type_typescript.svg',
    js: 'file_type_js.svg', jsx: 'file_type_js.svg',
    py: 'file_type_python.svg', rs: 'file_type_rust.svg',
    go: 'file_type_go.svg', java: 'file_type_java.svg',
    css: 'file_type_css.svg', scss: 'file_type_scss.svg',
    json: 'file_type_json.svg', yaml: 'file_type_yaml.svg', yml: 'file_type_yaml.svg',
    toml: 'file_type_toml.svg', md: 'file_type_markdown.svg',
    sh: 'file_type_shell.svg', bash: 'file_type_shell.svg',
    svg: 'file_type_image.svg', png: 'file_type_image.svg',
    html: 'file_type_html@2x.png', xml: 'file_type_html@2x.png',
    sql: 'file_type_sql@2x.png',
    kt: 'file_type_kotlin.svg', dart: 'file_type_dart.svg',
    c: 'file_type_c.svg', cpp: 'file_type_cpp.svg', h: 'file_type_c.svg',
  }
  return `/file-icons/${map[ext] || 'file_type_default.svg'}`
}

// ── 5 种 chat 样式变体定义 ────────────────────────────

const VARIANT_STYLES: Array<{ key: StyleKey; label: string; color: string }> = [
  { key: 'a', label: '时间线点', color: '#58a6ff' },
  { key: 'b', label: '气泡行',  color: '#3fb950' },
  { key: 'd', label: '叙事流',  color: '#d29922' },
  { key: 'g', label: '头像气泡', color: '#bc8cff' },
  { key: 'h', label: '折叠卡片', color: '#39d2c0' },
]

const RENDERERS: Record<StyleKey, React.FC<{ steps: TimelineStep[] }>> = {
  a: StyleA, b: StyleB, d: StyleD, g: StyleG, h: StyleH,
}

function VariantLabel({ label, idx, color }: { label: string; idx: string; color: string }) {
  return (
    <div style={{
      marginBottom: 6, padding: '3px 10px',
      borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 6,
      background: `${color}15`, border: `1px solid ${color}30`,
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, color }}>{idx}</span>
      <span style={{ fontSize: 9, color: 'var(--tc-foreground-secondary)' }}>{label}</span>
    </div>
  )
}

// ── Styled 节点：5 种实际 chat 样式横向排列 ──────────

const StyledNode = memo(({ data }: NodeProps<Node<StyledNodeData>>) => (
  <div style={{ display: 'flex', gap: 16 }}>
    {VARIANT_STYLES.map(v => {
      const Renderer = RENDERERS[v.key]
      return (
        <div key={v.key} style={{ width: 420, flexShrink: 0 }}>
          <VariantLabel label={v.label} idx={v.key} color={v.color} />
          <Renderer steps={data.steps} />
        </div>
      )
    })}
  </div>
))
StyledNode.displayName = 'StyledNode'

const nodeTypes = { rawNode: RawNode, styledNode: StyledNode }

// ── 布局 ────────────────────────────────────────────

const RAW_W = 340
const STYLED_W = 5 * 420 + 4 * 16  // 5 样式 × 420px + 4 间距
const PAIR_GAP = 200
const PAIR_TOTAL = RAW_W + PAIR_GAP + STYLED_W
const COL_GAP = 200
const ROW_PAD = 120
const COLS = 1

function estimateH(msgCount: number, stepCount: number): number {
  return Math.max(msgCount * 160 + 60, stepCount * 100 + 60, 300)
}

// 存储每对节点的位置，供 SVG 连线使用
interface PairPosition {
  rawX: number; rawY: number
  styledX: number; styledY: number
  color: string
}

function buildGraph(): { nodes: Node[]; pairs: PairPosition[] } {
  const nodes: Node[] = []
  const pairs: PairPosition[] = []

  const secs = DEMO_SECTIONS.map((sec, si) => {
    const nextSec = DEMO_SECTIONS[si + 1]
    const startMsg = sec.index
    const endMsg = nextSec ? nextSec.index : DEMO_MESSAGES.length
    const rawMsgs = DEMO_MESSAGES.slice(startMsg, endMsg)
    const { steps: rawSteps } = parseTimelineWithQuestions(rawMsgs)
    const steps = groupConsecutiveSameType(rawSteps)
    return {
      rawMsgs, steps,
      color: PALETTE[si % PALETTE.length],
      icon: getIcon(sec.label),
      label: sec.label,
      height: estimateH(rawMsgs.length, steps.length),
    }
  })

  const colY = new Array(COLS).fill(0)

  for (let si = 0; si < secs.length; si++) {
    const col = colY.indexOf(Math.min(...colY))
    const { rawMsgs, steps, color, icon, label, height } = secs[si]
    const rawX = col * (PAIR_TOTAL + COL_GAP)
    const y = colY[col]
    const styledX = rawX + RAW_W + PAIR_GAP

    nodes.push({
      id: `raw-${si}`, type: 'rawNode',
      position: { x: rawX, y },
      data: { label, color, icon, messages: rawMsgs, pairIndex: si },
    })
    nodes.push({
      id: `styled-${si}`, type: 'styledNode',
      position: { x: styledX, y },
      data: { label, color, steps, pairIndex: si },
    })

    pairs.push({ rawX, rawY: y, styledX, styledY: y, color })
    colY[col] += height + ROW_PAD
  }

  return { nodes, pairs }
}

// ── SVG 连线覆盖层 ──────────────────────────────────

function SvgLines({ pairs }: { pairs: PairPosition[] }) {
  const { x: vx, y: vy, zoom } = useViewport()

  return (
    <svg
      style={{
        position: 'absolute',
        left: 0, top: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      <g transform={`translate(${vx}, ${vy}) scale(${zoom})`}>
        {pairs.map((p, i) => {
          const x1 = p.rawX + RAW_W
          const y1 = p.rawY + 30
          const x2 = p.styledX
          const y2 = p.styledY + 30
          const cpx = (x2 - x1) * 0.4
          const d = `M ${x1},${y1} C ${x1 + cpx},${y1} ${x2 - cpx},${y2} ${x2},${y2}`
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={p.color} strokeWidth={2 / zoom} strokeOpacity={0.5} />
              <circle cx={x1} cy={y1} r={4 / zoom} fill={p.color} opacity={0.7} />
              <circle cx={x2} cy={y2} r={4 / zoom} fill={p.color} opacity={0.7} />
            </g>
          )
        })}
      </g>
    </svg>
  )
}

// ── 悬浮导航 ────────────────────────────────────────

function FloatingNav({ sections, onJump }: {
  sections: typeof DEMO_SECTIONS
  onJump: (i: number) => void
}) {
  const [collapsed, setCollapsed] = React.useState(false)
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
  const { nodes: initNodes, pairs } = useMemo(() => buildGraph(), [])
  const [nodes, , onNodesChange] = useNodesState(initNodes)
  const { fitView, fitBounds } = useReactFlow()

  useEffect(() => {
    setTimeout(() => fitView({ padding: 0.05, duration: 500 }), 300)
  }, [fitView])

  const handleJump = useCallback((idx: number) => {
    const p = pairs[idx]
    if (!p) return
    fitBounds(
      { x: p.rawX - 30, y: p.rawY - 30, width: PAIR_TOTAL + 60, height: 660 },
      { padding: 0.08, duration: 600 },
    )
  }, [pairs, fitBounds])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={[]}
        onNodesChange={onNodesChange}
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
          nodeColor={n => PALETTE[parseInt(n.id.split('-')[1]) % PALETTE.length]}
        />
      </ReactFlow>
      {/* SVG 连线覆盖在 ReactFlow 上方 */}
      <SvgLines pairs={pairs} />
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
