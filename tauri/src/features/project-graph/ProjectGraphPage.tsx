/**
 * ProjectGraphPage — TaskConductor 项目架构知识图谱
 *
 * 布局（左→右 4 列）：
 *   [Store 层] → [Feature 层（chat 详细）] → [API/Backend 层] → [Components 层]
 *
 * Chat 模块：详细卡片（文件列表 + 行数 + 10 大特性）
 * 其他模块：精简卡片（名称 + 行数 + 简述）
 */

import { useState, useCallback } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
  getBezierPath,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import styles from './project-graph.module.css'

// ─────────────────────────────────────────────
// 项目真实数据
// ─────────────────────────────────────────────

interface FeatureNode {
  id: string
  label: string
  lines: number
  desc: string
  color: string
  layer: 'feature' | 'store' | 'api' | 'component'
  deps?: string[]     // 依赖的节点 id
  details?: {
    files?: { name: string; lines: number }[]
    features?: string[]
    storeUsed?: string[]
    apiUsed?: string[]
  }
}

const NODES_DATA: FeatureNode[] = [
  // ── Stores（紫色）──────────────────────────────
  {
    id: 's-chat', label: 'chat store', lines: 127, layer: 'store', color: '#a78bfa',
    desc: '消息 / 生成状态 / 模型选择 / 权限模式',
  },
  {
    id: 's-app', label: 'app store', lines: 44, layer: 'store', color: '#a78bfa',
    desc: '主题 / 活跃项目 / sidebar 折叠',
  },
  {
    id: 's-editor', label: 'editor store', lines: 75, layer: 'store', color: '#a78bfa',
    desc: '打开标签 / 活跃路径 / 未保存列表',
  },
  {
    id: 's-canvas', label: 'canvas store', lines: 82, layer: 'store', color: '#a78bfa',
    desc: '节点/边 / zoom / 标签页',
  },
  {
    id: 's-sessions', label: 'sessions store', lines: 59, layer: 'store', color: '#a78bfa',
    desc: 'AI 会话列表 / 事件缓冲(200)',
  },
  {
    id: 's-auth', label: 'auth store', lines: 38, layer: 'store', color: '#a78bfa',
    desc: '认证状态 / token / 权限',
  },

  // ── Features（青色）───────────────────────────
  {
    id: 'f-chat', label: 'chat', lines: 3523, layer: 'feature', color: '#22d3ee',
    desc: '会话时间线 · 8种视图 · DOM拾取 · 风险检测',
    deps: ['s-chat', 's-app', 'a-chat', 'a-sessions', 'c-renderer', 'c-session-chat'],
    details: {
      files: [
        { name: 'index.tsx', lines: 1312 },
        { name: 'ChatTimeline.tsx', lines: 739 },
        { name: 'PromptInput.tsx', lines: 796 },
        { name: 'timeline-parser.ts', lines: 343 },
        { name: 'demo-data.ts', lines: 295 },
        { name: 'useArchivedSessions.ts', lines: 31 },
      ],
      features: [
        '8种视图样式(A-H)', '工具调用追踪(12类)', '意图自动推断(6种)',
        '风险检测(10+)', 'Commit自动生成', 'DOM拾取模式',
        '内嵌文件/图片', 'Prompt模板库', '消息合并', '虚拟滚动(Virtuoso)',
      ],
    },
  },
  {
    id: 'f-admin', label: 'admin', lines: 5487, layer: 'feature', color: '#22d3ee',
    desc: '管理后台：配置/会话/监控 · 25个文件',
    deps: ['s-auth', 'a-sessions', 'c-mindmap', 'c-renderer'],
  },
  {
    id: 'f-dashboard', label: 'dashboard', lines: 733, layer: 'feature', color: '#22d3ee',
    desc: '项目概览 · 任务图表 · 知识库预览 · 活动时间线',
    deps: ['s-app', 'a-projects', 'a-tasks'],
  },
  {
    id: 'f-files', label: 'files', lines: 1135, layer: 'feature', color: '#22d3ee',
    desc: '文件浏览 · Monaco 编辑器 · 内联 AI · 12个文件',
    deps: ['s-app', 's-editor', 'a-files'],
  },
  {
    id: 'f-git', label: 'git', lines: 950, layer: 'feature', color: '#22d3ee',
    desc: 'Git 变更/分支/Diff/日志 · 12个文件',
    deps: ['s-app', 'a-git'],
  },
  {
    id: 'f-canvas', label: 'canvas', lines: 589, layer: 'feature', color: '#22d3ee',
    desc: '可视化编辑 · Pixi.js · 模块图谱',
    deps: ['s-canvas'],
  },
  {
    id: 'f-tasks', label: 'task-manager', lines: 404, layer: 'feature', color: '#22d3ee',
    desc: '任务列表/筛选/创建 · 6个文件',
    deps: ['s-chat', 's-app', 'a-tasks'],
  },
  {
    id: 'f-sessions', label: 'sessions', lines: 25, layer: 'feature', color: '#22d3ee',
    desc: '会话页（占位）',
    deps: ['s-sessions', 'a-sessions'],
  },

  // ── API / Backend（绿色）──────────────────────
  {
    id: 'a-chat', label: 'api.chat', lines: 0, layer: 'api', color: '#34d399',
    desc: 'startInterview / sendMessage\n/ws/chat (WebSocket 流)',
  },
  {
    id: 'a-projects', label: 'api.projects', lines: 0, layer: 'api', color: '#34d399',
    desc: 'list / get / create / update',
  },
  {
    id: 'a-tasks', label: 'api.tasks', lines: 0, layer: 'api', color: '#34d399',
    desc: 'list / get / create / update / launch',
  },
  {
    id: 'a-sessions', label: 'api.sessions', lines: 0, layer: 'api', color: '#34d399',
    desc: 'list / get / getEvents\n/ws/sessions (WebSocket)',
  },
  {
    id: 'a-files', label: 'api.files', lines: 0, layer: 'api', color: '#34d399',
    desc: 'list / getContent / updateContent',
  },
  {
    id: 'a-git', label: 'api.git', lines: 0, layer: 'api', color: '#34d399',
    desc: 'status / branches / log / diff',
  },

  // ── Components（琥珀色）──────────────────────
  {
    id: 'c-renderer', label: 'ChatRenderer', lines: 1432, layer: 'component', color: '#fbbf24',
    desc: 'Markdown / CodeBlock / DiffBlock / fileExtIcon',
  },
  {
    id: 'c-session-chat', label: 'SessionChat', lines: 500, layer: 'component', color: '#fbbf24',
    desc: 'SessionChat / TranscriptViewer / SessionList / QuestionNav',
  },
  {
    id: 'c-mindmap', label: 'MindMap', lines: 1200, layer: 'component', color: '#fbbf24',
    desc: 'MindMapCanvas / Node / Edge / Layout (D3)',
  },
  {
    id: 'c-float', label: 'FloatingAssistant', lines: 500, layer: 'component', color: '#fbbf24',
    desc: '悬浮 AI 助手（拖拽/最小化）',
  },
]

const NODE_MAP = Object.fromEntries(NODES_DATA.map(n => [n.id, n]))

// ─────────────────────────────────────────────
// 布局：4 列，y 轴按出现顺序
// ─────────────────────────────────────────────
const POSITIONS: Record<string, [number, number]> = {
  // Store 列 (x=0)
  's-chat':     [0,    0],
  's-app':      [0,  150],
  's-editor':   [0,  300],
  's-canvas':   [0,  450],
  's-sessions': [0,  600],
  's-auth':     [0,  750],

  // Feature 列 (x=280)
  'f-chat':     [280,  0],   // 高度大，与 store 对齐
  'f-admin':    [280, 340],
  'f-dashboard':[280, 490],
  'f-files':    [280, 640],
  'f-git':      [280, 790],
  'f-canvas':   [280, 940],
  'f-tasks':    [280,1090],
  'f-sessions': [280,1230],

  // API 列 (x=680)
  'a-chat':     [680,   0],
  'a-projects': [680, 140],
  'a-tasks':    [680, 280],
  'a-sessions': [680, 420],
  'a-files':    [680, 560],
  'a-git':      [680, 700],

  // Component 列 (x=940)
  'c-renderer':    [940,   0],
  'c-session-chat':[940, 150],
  'c-mindmap':     [940, 300],
  'c-float':       [940, 450],
}

// ─────────────────────────────────────────────
// 发光边（多层叠加 glow，不用 SVG filter）
// ─────────────────────────────────────────────
function GlowEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps) {
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const color  = (data?.color as string) ?? '#22d3ee'
  const active = data?.active as boolean

  return (
    <g>
      {active && <path d={path} fill="none" stroke={color} strokeWidth={12} opacity={0.04} />}
      {active && <path d={path} fill="none" stroke={color} strokeWidth={6}  opacity={0.10} />}
      {active && <path d={path} fill="none" stroke={color} strokeWidth={2.5}opacity={0.30} />}
      <path
        d={path} fill="none"
        stroke={active ? color : 'rgba(100,130,180,0.45)'}
        strokeWidth={active ? 1.5 : 1}
      />
    </g>
  )
}
const edgeTypes = { glow: GlowEdge }

// ─────────────────────────────────────────────
// 节点组件
// ─────────────────────────────────────────────
interface PGNodeData extends Record<string, unknown> {
  node: FeatureNode
  selected: boolean
  onSelect: (id: string) => void
}

function FeatureNodeComp({ data }: NodeProps) {
  const d = data as PGNodeData
  const n = d.node
  const isChatDetail = n.id === 'f-chat'

  const handleClick = () => d.onSelect(n.id)

  // Handle 样式
  const hs = (color: string) => ({
    background: color, border: 'none',
    width: 6, height: 6, opacity: 0.55,
  })

  if (isChatDetail) {
    return (
      <>
        <Handle type="target" position={Position.Left} style={hs(n.color)} />
        <div
          className={[styles.chatCard, d.selected ? styles.chatCardSelected : ''].join(' ')}
          onClick={handleClick}
        >
          <div className={styles.chatCardHead}>
            <span className={styles.chatCardBadge}>FEATURE</span>
            <span className={styles.chatCardTitle}>{n.label}</span>
            <span className={styles.chatCardLines}>{n.lines.toLocaleString()} L</span>
          </div>
          {/* 文件列表 */}
          <div className={styles.chatCardFiles}>
            {n.details?.files?.map(f => (
              <><span key={f.name + 'n'} className={styles.chatCardFileName}>{f.name}</span>
              <span key={f.name + 'l'} className={styles.chatCardFileLines}>{f.lines}</span></>
            ))}
          </div>
          <div className={styles.chatCardDivider} />
          {/* 特性 chips */}
          <div className={styles.chatCardFeatures}>
            {n.details?.features?.map(f => (
              <span key={f} className={styles.chatCardFeatureChip}>{f}</span>
            ))}
          </div>
          <div className={styles.chatCardProgressBar}>
            <div className={styles.chatCardProgressFill} />
          </div>
        </div>
        <Handle type="source" position={Position.Right} style={hs(n.color)} />
      </>
    )
  }

  if (n.layer === 'store') {
    return (
      <>
        <Handle type="source" position={Position.Right} style={hs(n.color)} />
        <div
          className={[styles.storeCard, d.selected ? styles.storeCardSelected : ''].join(' ')}
          onClick={handleClick}
        >
          <div className={styles.storeHead}>
            <span className={styles.storeDot} />
            <span className={styles.storeTitle}>{n.label}</span>
          </div>
          <div className={styles.storeDesc}>{n.desc}</div>
          {n.lines > 0 && <div className={styles.storeLines}>{n.lines} lines</div>}
        </div>
      </>
    )
  }

  if (n.layer === 'api') {
    return (
      <>
        <Handle type="target" position={Position.Left} style={hs(n.color)} />
        <div
          className={[styles.apiCard, d.selected ? styles.apiCardSelected : ''].join(' ')}
          onClick={handleClick}
        >
          <div className={styles.apiHead}>
            <span className={styles.apiDot} />
            <span className={styles.apiTitle}>{n.label}</span>
          </div>
          <div className={styles.apiDesc}>{n.desc}</div>
        </div>
      </>
    )
  }

  if (n.layer === 'component') {
    return (
      <>
        <Handle type="target" position={Position.Left} style={hs(n.color)} />
        <div
          className={[styles.compCard, d.selected ? styles.compCardSelected : ''].join(' ')}
          onClick={handleClick}
        >
          <div className={styles.compHead}>
            <span className={styles.compDot} />
            <span className={styles.compTitle}>{n.label}</span>
          </div>
          <div className={styles.compDesc}>{n.desc}</div>
        </div>
      </>
    )
  }

  // 普通 feature
  const pct = Math.min(100, (n.lines / 5500) * 100)
  return (
    <>
      <Handle type="target" position={Position.Left} style={hs(n.color)} />
      <div
        className={[styles.fnCard, d.selected ? styles.fnCardSelected : ''].join(' ')}
        style={{ '--fn-color': n.color } as React.CSSProperties}
        onClick={handleClick}
      >
        <div className={styles.fnHead}>
          <span className={styles.fnTypeBadge}>FEATURE</span>
          <span className={styles.fnTitle}>{n.label}</span>
          <span className={styles.fnLines}>{n.lines.toLocaleString()}</span>
        </div>
        <div className={styles.fnDesc}>{n.desc}</div>
        <div className={styles.fnProgressBar}>
          <div className={styles.fnProgressFill} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={hs(n.color)} />
    </>
  )
}

const nodeTypes = { pg: FeatureNodeComp }

// ─────────────────────────────────────────────
// 构建 Flow 元素
// ─────────────────────────────────────────────
function buildElements(selectedId: string | null, onSelect: (id: string) => void) {
  const nodes: Node[] = NODES_DATA.map(n => ({
    id: n.id,
    type: 'pg',
    position: { x: POSITIONS[n.id]?.[0] ?? 0, y: POSITIONS[n.id]?.[1] ?? 0 },
    data: { node: n, selected: selectedId === n.id, onSelect } as unknown as Record<string, unknown>,
  }))

  const edges: Edge[] = []
  NODES_DATA.forEach(n => {
    n.deps?.forEach(depId => {
      const depNode = NODE_MAP[depId]
      if (!depNode) return
      const active = selectedId === n.id || selectedId === depId
      const color = active
        ? (n.color !== '#22d3ee' ? n.color : depNode.color)
        : '#22d3ee'

      // 布局左→右：store(x=0) → feature(x=280) → api/component(x=680/940)
      // store 依赖：store 是 source，feature 是 target
      // api/component 依赖：feature 是 source，api/component 是 target
      const isStoreDep = depNode.layer === 'store'
      const sourceId = isStoreDep ? depId : n.id
      const targetId = isStoreDep ? n.id  : depId

      edges.push({
        id: `${sourceId}→${targetId}`,
        type: 'glow',
        source: sourceId,
        target: targetId,
        data: { color, active },
      })
    })
  })

  return { nodes, edges }
}

// ─────────────────────────────────────────────
// 左侧详情面板
// ─────────────────────────────────────────────
function DetailPanel({
  selectedId,
  onSelect,
}: {
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const n = selectedId ? NODE_MAP[selectedId] : null

  const TOTALS = {
    features: NODES_DATA.filter(x => x.layer === 'feature').length,
    stores:   NODES_DATA.filter(x => x.layer === 'store').length,
    apis:     NODES_DATA.filter(x => x.layer === 'api').length,
    comps:    NODES_DATA.filter(x => x.layer === 'component').length,
    totalLines: NODES_DATA.reduce((s, x) => s + x.lines, 0),
  }

  const layers = [
    { label: 'Feature', count: TOTALS.features, color: '#22d3ee', pct: 100 },
    { label: 'Store',   count: TOTALS.stores,   color: '#a78bfa', pct: (TOTALS.stores   / TOTALS.features) * 100 },
    { label: 'API',     count: TOTALS.apis,     color: '#34d399', pct: (TOTALS.apis     / TOTALS.features) * 100 },
    { label: 'Comp',    count: TOTALS.comps,    color: '#fbbf24', pct: (TOTALS.comps    / TOTALS.features) * 100 },
  ]

  return (
    <div className={styles.panel}>
      {/* 汇总卡 */}
      <div className={styles.panelCard}>
        <div className={styles.panelLabel}>项目架构</div>
        <div className={styles.panelTitle}>TaskConductor</div>
        <div className={styles.panelSub}>Tauri + React 19 · {(TOTALS.totalLines / 1000).toFixed(0)}K+ 行</div>
        {layers.map(l => (
          <div key={l.label} className={styles.panelBarRow}>
            <div className={styles.panelBarHead}>
              <span>{l.label}</span>
              <span className={styles.panelBarVal}>{l.count}</span>
            </div>
            <div className={styles.panelBarTrack}>
              <div className={styles.panelBarFill}
                style={{ width: `${l.pct}%`, background: l.color }} />
            </div>
          </div>
        ))}
      </div>

      {/* 选中节点详情 */}
      {n ? (
        <div className={styles.panelCard}
          style={{ borderColor: `color-mix(in srgb, ${n.color} 30%, rgba(255,255,255,0.06))` }}>
          <div className={styles.panelLabel} style={{ color: `color-mix(in srgb, ${n.color} 70%, rgba(100,120,160,0.5))` }}>
            {n.layer.toUpperCase()}
          </div>
          <div className={styles.panelTitle}>{n.label}</div>
          <div className={styles.panelSub}>{n.desc}</div>

          {n.lines > 0 && (
            <div className={styles.panelBarRow}>
              <div className={styles.panelBarHead}>
                <span>代码行数</span>
                <span className={styles.panelBarVal}>{n.lines.toLocaleString()}</span>
              </div>
              <div className={styles.panelBarTrack}>
                <div className={styles.panelBarFill}
                  style={{ width: `${Math.min(100, (n.lines / 5500) * 100)}%`, background: n.color }} />
              </div>
            </div>
          )}

          {/* Chat 详细文件列表 */}
          {n.details?.files && (
            <div className={styles.panelSection}>
              <div className={styles.panelSectionLabel}>文件构成</div>
              {n.details.files.map(f => (
                <div key={f.name} className={styles.panelFileRow}>
                  <span>{f.name}</span>
                  <span className={styles.panelFileLines}>{f.lines}</span>
                </div>
              ))}
            </div>
          )}

          {/* Chat 特性列表 */}
          {n.details?.features && (
            <div className={styles.panelSection}>
              <div className={styles.panelSectionLabel}>核心特性</div>
              <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                {n.details.features.map(f => (
                  <span key={f} className={styles.panelFeatureChip}>{f}</span>
                ))}
              </div>
            </div>
          )}

          {/* 依赖跳转 */}
          {n.deps && n.deps.length > 0 && (
            <div className={styles.panelSection}>
              <div className={styles.panelSectionLabel}>依赖</div>
              <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                {n.deps.map(depId => {
                  const dep = NODE_MAP[depId]
                  if (!dep) return null
                  return (
                    <span key={depId} className={styles.panelDepChip}
                      onClick={() => onSelect(depId)}>
                      <span className={styles.panelDepDot} style={{ background: dep.color }} />
                      {dep.label}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.panelCard} style={{ textAlign: 'center', padding: '20px 13px' }}>
          <div style={{ fontSize: 11, color: 'rgba(100,120,160,0.4)' }}>
            点击节点查看详情
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 主页面
// ─────────────────────────────────────────────
function ProjectGraphInner() {
  const [selectedId, setSelectedId] = useState<string | null>('f-chat')

  const handleSelect = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id)
  }, [])

  const { nodes, edges } = buildElements(selectedId, handleSelect)

  return (
    <div className={styles.page}>
      <DetailPanel selectedId={selectedId} onSelect={handleSelect} />

      <div className={styles.canvas}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          minZoom={0.15}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          style={{ background: 'transparent' }}
          nodesDraggable={false}
        >
          <Background variant={BackgroundVariant.Dots} gap={32} size={1}
            color="rgba(255,255,255,0.025)" />
        </ReactFlow>

        {/* 图例 */}
        <div className={styles.legend}>
          {[
            { label: 'Feature', color: '#22d3ee' },
            { label: 'Store',   color: '#a78bfa' },
            { label: 'API',     color: '#34d399' },
            { label: 'Comp',    color: '#fbbf24' },
          ].map(l => (
            <span key={l.label} style={{ display: 'flex', alignItems: 'center' }}>
              <span className={styles.legendDot} style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ProjectGraphPage() {
  return (
    <ReactFlowProvider>
      <ProjectGraphInner />
    </ReactFlowProvider>
  )
}
