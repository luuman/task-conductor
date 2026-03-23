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

// ── 变体组件（4 种差异最大化风格）───────────────────

import type { TranscriptBlock as TB } from '../../../lib/api/types'

// 提取文件信息
function fileInfo(b: TB) {
  const fp = String(b.tool_input?.file_path || b.tool_input?.pattern || b.tool_input?.query || '')
  const fileName = fp.split('/').pop() || fp
  const dir = fp.includes('/') ? fp.split('/').slice(0, -1).join('/') : ''
  const lines = b.tool_result ? b.tool_result.split('\n').length : 0
  return { fp, fileName, dir, lines, name: b.tool_name || '' }
}

function editInfo(b: TB) {
  const fp = String(b.tool_input?.file_path || '')
  const fileName = fp.split('/').pop() || fp
  const addN = b.tool_input?.new_string ? String(b.tool_input.new_string).split('\n').length : 0
  const delN = b.tool_input?.old_string ? String(b.tool_input.old_string).split('\n').length : 0
  return { fp, fileName, addN, delN }
}

function bashInfo(b: TB) {
  const cmd = String(b.tool_input?.command ?? '').replace(/^cd [^ ]+ && /, '').slice(0, 100)
  const isErr = b.tool_error === true
  const result = (b.tool_result || '').trim()
  const noOut = !result || result === '(Bash completed with no output)'
  const lines = result ? result.split('\n').length : 0
  return { cmd, isErr, result, noOut, lines }
}

// ═══════ A: 默认（ChatRenderer 原组件）═══════

// ═══════ B: 可视化大卡片（参考 Dribbble 风格）═══════

function ReadStyleB({ blocks }: { blocks: TB[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '8px 0' }}>
      {blocks.map((b, i) => {
        const f = fileInfo(b)
        return (
          <div key={i} style={{
            width: 150, padding: '14px', borderRadius: 14,
            background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}>
            <img src={getFileIcon(f.fp)} alt="" style={{ width: 36, height: 36 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tc-foreground)', textAlign: 'center', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.fileName}</span>
            <div style={{ display: 'flex', gap: 6, fontSize: 9, color: 'var(--tc-foreground-secondary)', fontFamily: "'Geist Mono', monospace" }}>
              <span>{f.lines} ln</span>
              <span style={{ opacity: 0.3 }}>|</span>
              <span>{f.name}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function EditStyleB({ block }: { block: TB }) {
  const e = editInfo(block)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', margin: '6px 0',
      borderRadius: 14, background: 'rgba(86,211,100,0.05)', border: '1px solid rgba(86,211,100,0.12)',
    }}>
      <img src={getFileIcon(e.fp)} alt="" style={{ width: 28, height: 28 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tc-foreground)' }}>{e.fileName}</div>
        <div style={{ fontSize: 10, color: 'var(--tc-foreground-secondary)', fontFamily: "'Geist Mono', monospace", marginTop: 2 }}>
          {e.addN > 0 && <span style={{ color: '#56d364' }}>+{e.addN} </span>}
          {e.delN > 0 && <span style={{ color: '#f85149' }}>-{e.delN}</span>}
          {e.addN === 0 && e.delN === 0 && 'created'}
        </div>
      </div>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(86,211,100,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#56d364', fontSize: 14 }}>✓</div>
    </div>
  )
}

function BashStyleB({ block }: { block: TB }) {
  const b = bashInfo(block)
  return (
    <div style={{
      margin: '6px 0', borderRadius: 14, overflow: 'hidden',
      border: `1px solid ${b.isErr ? 'rgba(248,81,73,0.2)' : 'rgba(255,255,255,0.06)'}`,
      background: 'rgba(0,0,0,0.3)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: b.isErr ? '#f85149' : '#56d364' }} />
        <code style={{ fontSize: 11, color: 'var(--tc-foreground)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'Geist Mono', monospace" }}>{b.cmd}</code>
        {!b.noOut && <span style={{ fontSize: 9, color: 'var(--tc-foreground-secondary)', fontFamily: "'Geist Mono', monospace" }}>{b.lines} ln</span>}
      </div>
      {!b.noOut && (
        <pre style={{ margin: 0, padding: '8px 14px', fontSize: 10, fontFamily: "'Geist Mono', monospace", color: b.isErr ? '#fda4af' : 'var(--tc-foreground-secondary)', borderTop: '1px solid rgba(255,255,255,0.04)', maxHeight: 120, overflow: 'hidden', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {b.result.slice(0, 500)}
        </pre>
      )}
    </div>
  )
}

// ═══════ C: 时间线（左侧色条 + 圆点）═══════

function ReadStyleC({ blocks }: { blocks: TB[] }) {
  return (
    <div style={{ margin: '6px 0', paddingLeft: 16, borderLeft: '2px solid rgba(88,166,255,0.3)' }}>
      {blocks.map((b, i) => {
        const f = fileInfo(b)
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', position: 'relative' }}>
            <div style={{ position: 'absolute', left: -21, width: 10, height: 10, borderRadius: '50%', background: '#58a6ff', border: '2px solid rgba(30,30,40,0.8)' }} />
            <img src={getFileIcon(f.fp)} alt="" style={{ width: 14, height: 14 }} />
            <span style={{ fontSize: 11, color: 'var(--tc-foreground)', fontWeight: 500 }}>{f.fileName}</span>
            <span style={{ fontSize: 9, color: 'var(--tc-foreground-secondary)', fontFamily: "'Geist Mono', monospace", opacity: 0.5 }}>{f.dir}</span>
            <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--tc-foreground-secondary)', fontFamily: "'Geist Mono', monospace" }}>{f.lines}</span>
          </div>
        )
      })}
    </div>
  )
}

function EditStyleC({ block }: { block: TB }) {
  const e = editInfo(block)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0 3px 16px', borderLeft: '2px solid rgba(86,211,100,0.3)', position: 'relative' }}>
      <div style={{ position: 'absolute', left: -5, width: 10, height: 10, borderRadius: '50%', background: '#56d364', border: '2px solid rgba(30,30,40,0.8)' }} />
      <img src={getFileIcon(e.fp)} alt="" style={{ width: 14, height: 14 }} />
      <span style={{ fontSize: 11, color: 'var(--tc-foreground)', fontWeight: 500 }}>{e.fileName}</span>
      <span style={{ fontSize: 10, fontFamily: "'Geist Mono', monospace" }}>
        {e.addN > 0 && <span style={{ color: '#56d364' }}>+{e.addN}</span>}
        {e.delN > 0 && <span style={{ color: '#f85149' }}> -{e.delN}</span>}
      </span>
    </div>
  )
}

function BashStyleC({ block }: { block: TB }) {
  const b = bashInfo(block)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '3px 0 3px 16px', borderLeft: `2px solid ${b.isErr ? 'rgba(248,81,73,0.3)' : 'rgba(255,255,255,0.1)'}`, position: 'relative' }}>
      <div style={{ position: 'absolute', left: -5, width: 10, height: 10, borderRadius: '50%', background: b.isErr ? '#f85149' : '#8b949e', border: '2px solid rgba(30,30,40,0.8)', marginTop: 3 }} />
      <code style={{ fontSize: 10.5, fontFamily: "'Geist Mono', monospace", color: 'var(--tc-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>$ {b.cmd}</code>
    </div>
  )
}

// ═══════ D: 极简纯文字（无图标无边框）═══════

function ReadStyleD({ blocks }: { blocks: TB[] }) {
  const summary = blocks.map(b => {
    const f = fileInfo(b)
    return f.fileName
  }).join(', ')
  return (
    <div style={{ margin: '4px 0', fontSize: 10, color: 'var(--tc-foreground-secondary)', fontFamily: "'Geist Mono', monospace" }}>
      <span style={{ opacity: 0.5 }}>read </span>{summary}<span style={{ opacity: 0.3 }}> ({blocks.length})</span>
    </div>
  )
}

function EditStyleD({ block }: { block: TB }) {
  const e = editInfo(block)
  return (
    <div style={{ margin: '2px 0', fontSize: 10, fontFamily: "'Geist Mono', monospace" }}>
      <span style={{ color: 'var(--tc-foreground-secondary)', opacity: 0.5 }}>edit </span>
      <span style={{ color: 'var(--tc-foreground)' }}>{e.fileName}</span>
      {e.addN > 0 && <span style={{ color: '#56d364' }}> +{e.addN}</span>}
      {e.delN > 0 && <span style={{ color: '#f85149' }}> -{e.delN}</span>}
    </div>
  )
}

function BashStyleD({ block }: { block: TB }) {
  const b = bashInfo(block)
  return (
    <div style={{ margin: '2px 0', fontSize: 10, fontFamily: "'Geist Mono', monospace" }}>
      <span style={{ color: b.isErr ? '#f85149' : '#56d364' }}>$ </span>
      <span style={{ color: 'var(--tc-foreground)' }}>{b.cmd}</span>
      {b.isErr && <span style={{ color: '#f85149' }}> ✗</span>}
    </div>
  )
}

// ── 变体定义 ────────────────────────────────────────

const VARIANT_STYLES = [
  { key: 'A', label: '完整组件', color: '#58a6ff' },
  { key: 'B', label: '可视化卡片', color: '#3fb950' },
  { key: 'C', label: '时间线', color: '#d29922' },
  { key: 'D', label: '极简文字', color: '#bc8cff' },
]

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

              {turn.reads.length > 0 && (
                variant === 'A' ? <ReadPillRow blocks={turn.reads} />
                : variant === 'B' ? <ReadStyleB blocks={turn.reads} />
                : variant === 'C' ? <ReadStyleC blocks={turn.reads} />
                : <ReadStyleD blocks={turn.reads} />
              )}

              {turn.edits.map((block, ei) => (
                variant === 'A' ? <EditInlineCard key={`e${ei}`} block={block} />
                : variant === 'B' ? <EditStyleB key={`e${ei}`} block={block} />
                : variant === 'C' ? <EditStyleC key={`e${ei}`} block={block} />
                : <EditStyleD key={`e${ei}`} block={block} />
              ))}

              {turn.bashes.map((block, bi) => (
                variant === 'A' ? <BashStatusLine key={`b${bi}`} block={block} />
                : variant === 'B' ? <BashStyleB key={`b${bi}`} block={block} />
                : variant === 'C' ? <BashStyleC key={`b${bi}`} block={block} />
                : <BashStyleD key={`b${bi}`} block={block} />
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
        <VariantLabel label={s.label} idx={s.key} color={s.color} />
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
