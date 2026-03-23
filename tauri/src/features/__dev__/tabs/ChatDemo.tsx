/**
 * ChatDemo — 画布卡片 + SVG 手绘连线（不依赖 xyflow edge）
 */
import { useState, useMemo, useCallback, useEffect, memo } from 'react'
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

// ── 节点数据 ────────────────────────────────────────

interface RawNodeData { label: string; color: string; icon: string; messages: TranscriptMessage[]; pairIndex: number; [k: string]: unknown }
interface StyledNodeData { label: string; color: string; icon: string; turns: GroupedTurnItem[]; rawCount: number; pairIndex: number; [k: string]: unknown }

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

// ── Read/Search 变体组件 ────────────────────────────

import type { TranscriptBlock as TB } from '../../../lib/api/types'

// A: 当前 Pill 行（默认）
function ReadVariantPill({ blocks }: { blocks: TB[] }) {
  return <ReadPillRow blocks={blocks} />
}

// B: 文件卡片（大图标 + 文件名 + 行数）
function ReadVariantCards({ blocks }: { blocks: TB[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '6px 0' }}>
      {blocks.map((b, i) => {
        const name = b.tool_name || ''
        const fp = String(b.tool_input?.file_path || b.tool_input?.pattern || b.tool_input?.query || '')
        const fileName = fp.split('/').pop() || fp
        const lines = b.tool_result ? b.tool_result.split('\n').length : 0
        return (
          <div key={i} style={{
            width: 140, padding: '10px 12px', borderRadius: 12,
            background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}>
            <img src={getFileIcon(fp)} alt="" style={{ width: 28, height: 28 }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--tc-foreground)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
              {fileName}
            </span>
            <span style={{ fontSize: 9, color: 'var(--tc-foreground-secondary)', fontFamily: "'Geist Mono', monospace" }}>
              {name === 'Read' ? `${lines} lines` : name === 'Grep' ? `${lines} matches` : `${lines} files`}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// C: 文件列表（紧凑行列表）
function ReadVariantList({ blocks }: { blocks: TB[] }) {
  return (
    <div style={{ margin: '6px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden', background: 'rgba(0,0,0,0.15)' }}>
      {blocks.map((b, i) => {
        const name = b.tool_name || ''
        const fp = String(b.tool_input?.file_path || b.tool_input?.pattern || '')
        const fileName = fp.split('/').pop() || fp
        const dir = fp.includes('/') ? fp.split('/').slice(0, -1).join('/') : ''
        const lines = b.tool_result ? b.tool_result.split('\n').length : 0
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 10px',
            borderBottom: i < blocks.length - 1 ? '1px solid rgba(255,255,255,0.04)' : undefined,
          }}>
            <img src={getFileIcon(fp)} alt="" style={{ width: 16, height: 16, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--tc-foreground)', flexShrink: 0 }}>{fileName}</span>
            <span style={{ fontSize: 9, color: 'var(--tc-foreground-secondary)', opacity: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontFamily: "'Geist Mono', monospace" }}>{dir}</span>
            <span style={{ fontSize: 9, color: 'var(--tc-foreground-secondary)', fontFamily: "'Geist Mono', monospace", flexShrink: 0 }}>
              {name === 'Grep' ? `${lines} hits` : `${lines} ln`}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// D: 内联标签（最紧凑）
function ReadVariantInline({ blocks }: { blocks: TB[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, margin: '4px 0', fontSize: 10, color: 'var(--tc-foreground-secondary)' }}>
      <span style={{ fontWeight: 600, opacity: 0.6 }}>Read</span>
      {blocks.map((b, i) => {
        const fp = String(b.tool_input?.file_path || b.tool_input?.pattern || '')
        const fileName = fp.split('/').pop() || fp
        return (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '1px 6px', borderRadius: 4,
            background: 'rgba(255,255,255,0.05)',
            fontFamily: "'Geist Mono', monospace",
          }}>
            <img src={getFileIcon(fp)} alt="" style={{ width: 10, height: 10 }} />
            {fileName}
          </span>
        )
      })}
    </div>
  )
}

// ── Edit/Write 变体组件 ─────────────────────────────

// A: 当前 EditInlineCard（默认）
// B: 紧凑行（图标+文件名+diff stats 一行）
function EditVariantCompact({ block }: { block: TB }) {
  const fp = String(block.tool_input?.file_path || '')
  const fileName = fp.split('/').pop() || fp
  const hasOld = block.tool_input?.old_string
  const hasNew = block.tool_input?.new_string
  const addN = hasNew ? String(block.tool_input!.new_string).split('\n').length : 0
  const delN = hasOld ? String(block.tool_input!.old_string).split('\n').length : 0
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
      fontSize: 11, color: 'var(--tc-foreground-secondary)',
    }}>
      <img src={getFileIcon(fp)} alt="" style={{ width: 14, height: 14 }} />
      <span style={{ fontWeight: 500, color: 'var(--tc-foreground)' }}>{fileName}</span>
      {(addN > 0 || delN > 0) && (
        <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10 }}>
          {addN > 0 && <span style={{ color: '#56d364' }}>+{addN}</span>}
          {addN > 0 && delN > 0 && ' '}
          {delN > 0 && <span style={{ color: '#f85149' }}>-{delN}</span>}
        </span>
      )}
      <span style={{ color: '#56d364', fontSize: 12 }}>✓</span>
    </div>
  )
}

// C: 文件卡片风格
function EditVariantCard({ block }: { block: TB }) {
  const fp = String(block.tool_input?.file_path || '')
  const fileName = fp.split('/').pop() || fp
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
      borderRadius: 10, background: 'rgba(86,211,100,0.06)', border: '1px solid rgba(86,211,100,0.15)',
      margin: '4px 0',
    }}>
      <img src={getFileIcon(fp)} alt="" style={{ width: 20, height: 20 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tc-foreground)' }}>{fileName}</div>
        <div style={{ fontSize: 9, color: 'var(--tc-foreground-secondary)', fontFamily: "'Geist Mono', monospace" }}>
          {block.tool_result || 'Updated'}
        </div>
      </div>
      <span style={{ color: '#56d364', fontSize: 14 }}>✓</span>
    </div>
  )
}

// ── Bash 变体组件 ───────────────────────────────────

// A: 当前 BashStatusLine（默认）
// B: 极简一行
function BashVariantOneliner({ block }: { block: TB }) {
  const cmd = String(block.tool_input?.command ?? '').replace(/^cd [^ ]+ && /, '').slice(0, 80)
  const isError = block.tool_error === true
  const result = (block.tool_result || '').trim()
  const noOutput = !result || result === '(Bash completed with no output)'
  const lines = result ? result.split('\n').length : 0
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0',
      fontSize: 10.5, fontFamily: "'Geist Mono', monospace",
    }}>
      <span style={{ color: '#56d364', fontWeight: 700 }}>$</span>
      <span style={{ color: 'var(--tc-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{cmd}</span>
      {!noOutput && <span style={{ fontSize: 9, color: 'var(--tc-foreground-secondary)', opacity: 0.5 }}>{lines}ln</span>}
      <span style={{
        fontSize: 8, padding: '1px 6px', borderRadius: 8,
        background: isError ? 'rgba(248,81,73,0.12)' : 'rgba(86,211,100,0.12)',
        color: isError ? '#f85149' : '#56d364', fontWeight: 600,
      }}>
        {isError ? '✗' : '✓'}
      </span>
    </div>
  )
}

// ── 变体方案定义 ────────────────────────────────────

const VARIANT_STYLES = [
  { key: 'A', label: '当前默认' },
  { key: 'B', label: '文件卡片 / 紧凑行 / 极简' },
  { key: 'C', label: '文件列表 / 卡片风格' },
  { key: 'D', label: '内联标签' },
]

function VariantLabel({ label, idx }: { label: string; idx: string }) {
  return (
    <div style={{
      marginBottom: 6, padding: '3px 10px',
      borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 6,
      background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.15)',
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#58a6ff' }}>{idx}</span>
      <span style={{ fontSize: 9, color: 'var(--tc-foreground-secondary)' }}>{label}</span>
    </div>
  )
}

// 渲染单个变体
function StyledContentVariant({ turns, variant }: { turns: GroupedTurnItem[]; variant: string }) {
  return (
    <ExpandSignalCtx.Provider value={1}>
      <AutoExpandCtx.Provider value={true}>
        {turns.map((item, i) => {
          if (item.kind === 'user') {
            const text = item.msg.blocks.filter(b => b.type === 'text').map(b => b.text || '').join('\n').trim()
            if (!text) return null
            return (
              <div key={i} style={{
                padding: '10px 16px', borderRadius: 16, marginBottom: 8,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                fontSize: 12.5, lineHeight: 1.6, color: 'var(--tc-foreground)',
              }}>
                <RichTextBlock text={text} />
              </div>
            )
          }
          const { turn } = item
          return (
            <div key={i} style={{
              padding: '12px 16px', borderRadius: 16, marginBottom: 8,
              background: 'rgba(30,30,40,0.6)', border: '1px solid rgba(255,255,255,0.06)',
              fontSize: 12.5, lineHeight: 1.6, color: 'var(--tc-foreground)',
            }}>
              {turn.texts.map((t, ti) => <RichTextBlock key={`t${ti}`} text={t} />)}

              {/* Read/Search 变体 */}
              {turn.reads.length > 0 && (
                variant === 'A' ? <ReadVariantPill blocks={turn.reads} />
                : variant === 'B' ? <ReadVariantCards blocks={turn.reads} />
                : variant === 'C' ? <ReadVariantList blocks={turn.reads} />
                : <ReadVariantInline blocks={turn.reads} />
              )}

              {/* Edit 变体 */}
              {turn.edits.map((block, ei) => (
                variant === 'A' ? <EditInlineCard key={`e${ei}`} block={block} />
                : variant === 'B' ? <EditVariantCompact key={`e${ei}`} block={block} />
                : <EditVariantCard key={`e${ei}`} block={block} />
              ))}

              {/* Bash 变体 */}
              {turn.bashes.map((block, bi) => (
                variant === 'A' ? <BashStatusLine key={`b${bi}`} block={block} />
                : <BashVariantOneliner key={`b${bi}`} block={block} />
              ))}

              {turn.others.map((block, oi) => <ToolWidget key={`o${oi}`} block={block} />)}
            </div>
          )
        })}
      </AutoExpandCtx.Provider>
    </ExpandSignalCtx.Provider>
  )
}

// ── Styled 节点：4 种变体横向排列 ───────────────────

const StyledNode = memo(({ data }: NodeProps<Node<StyledNodeData>>) => (
  <div style={{ display: 'flex', gap: 16 }}>
    {VARIANT_STYLES.map(s => (
      <div key={s.key} style={{ width: 420, flexShrink: 0 }}>
        <VariantLabel label={s.label} idx={s.key} />
        <StyledContentVariant turns={data.turns} variant={s.key} />
      </div>
    ))}
  </div>
))
StyledNode.displayName = 'StyledNode'

const nodeTypes = { rawNode: RawNode, styledNode: StyledNode }

// ── 布局 ────────────────────────────────────────────

const RAW_W = 340
const STYLED_W = 4 * 420 + 3 * 16  // 4 变体 × 420px + 3 间距
const PAIR_GAP = 200
const PAIR_TOTAL = RAW_W + PAIR_GAP + STYLED_W
const COL_GAP = 200
const ROW_PAD = 120
const COLS = 1  // 单列（太宽了放不下 2 列）

function estimateH(msgCount: number, turnCount: number): number {
  return Math.max(msgCount * 160 + 60, turnCount * 250 + 60, 300)
}

// 存储每对节点的位置，供 SVG 连线使用
interface PairPosition {
  rawX: number; rawY: number
  styledX: number; styledY: number
  color: string
}

function buildGraph(turns: GroupedTurnItem[]): { nodes: Node[]; pairs: PairPosition[] } {
  const nodes: Node[] = []
  const pairs: PairPosition[] = []

  const secs: Array<{
    rawMsgs: TranscriptMessage[]
    sectionTurns: GroupedTurnItem[]
    color: string; icon: string; label: string; height: number
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
      data: { label, color, icon, turns: sectionTurns, rawCount: rawMsgs.length, pairIndex: si },
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
  const { nodes: initNodes, pairs } = useMemo(() => buildGraph(turns), [turns])
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
