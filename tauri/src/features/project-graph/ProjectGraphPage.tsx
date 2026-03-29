/**
 * ProjectGraphPage — TaskConductor 项目架构知识图谱
 * 严格按照 reactflow.dev 官方示例结构写，确保 edges 可渲染
 */

import { useState, useCallback, useMemo } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import styles from './project-graph.module.css'

// ─────────────────────────────────────────────
// 数据
// ─────────────────────────────────────────────
interface FeatureNode {
  id: string
  label: string
  lines: number
  desc: string
  color: string
  layer: 'feature' | 'store' | 'api' | 'component'
  deps?: string[]
  details?: {
    files?: { name: string; lines: number }[]
    features?: string[]
  }
}

const NODES_DATA: FeatureNode[] = [
  { id: 's-chat',     label: 'chat store',     lines: 127, layer: 'store',     color: '#a78bfa', desc: '消息 / 生成状态 / 模型选择 / 权限模式' },
  { id: 's-app',      label: 'app store',      lines: 44,  layer: 'store',     color: '#a78bfa', desc: '主题 / 活跃项目 / sidebar 折叠' },
  { id: 's-editor',   label: 'editor store',   lines: 75,  layer: 'store',     color: '#a78bfa', desc: '打开标签 / 活跃路径 / 未保存列表' },
  { id: 's-canvas',   label: 'canvas store',   lines: 82,  layer: 'store',     color: '#a78bfa', desc: '节点/边 / zoom / 标签页' },
  { id: 's-sessions', label: 'sessions store', lines: 59,  layer: 'store',     color: '#a78bfa', desc: 'AI 会话列表 / 事件缓冲(200)' },
  { id: 's-auth',     label: 'auth store',     lines: 38,  layer: 'store',     color: '#a78bfa', desc: '认证状态 / token / 权限' },

  {
    id: 'f-chat', label: 'chat', lines: 3523, layer: 'feature', color: '#22d3ee',
    desc: '会话时间线 · 8种视图 · DOM拾取 · 风险检测',
    deps: ['s-chat', 's-app', 'a-chat', 'a-sessions', 'c-renderer', 'c-session-chat'],
    details: {
      files: [
        { name: 'index.tsx', lines: 1312 }, { name: 'ChatTimeline.tsx', lines: 739 },
        { name: 'PromptInput.tsx', lines: 796 }, { name: 'timeline-parser.ts', lines: 343 },
        { name: 'demo-data.ts', lines: 295 }, { name: 'useArchivedSessions.ts', lines: 31 },
      ],
      features: ['8种视图(A-H)', '工具调用追踪', '意图推断', '风险检测', 'Commit生成', 'DOM拾取', '内嵌文件', 'Prompt模板', '消息合并', '虚拟滚动'],
    },
  },
  { id: 'f-admin',    label: 'admin',        lines: 5487, layer: 'feature', color: '#22d3ee', desc: '管理后台：配置/会话/监控', deps: ['s-auth', 'a-sessions', 'c-mindmap', 'c-renderer'] },
  { id: 'f-dashboard',label: 'dashboard',    lines: 733,  layer: 'feature', color: '#22d3ee', desc: '项目概览 · 任务图表', deps: ['s-app', 'a-projects', 'a-tasks'] },
  { id: 'f-files',    label: 'files',        lines: 1135, layer: 'feature', color: '#22d3ee', desc: '文件浏览 · Monaco 编辑器', deps: ['s-app', 's-editor', 'a-files'] },
  { id: 'f-git',      label: 'git',          lines: 950,  layer: 'feature', color: '#22d3ee', desc: 'Git 变更/分支/Diff', deps: ['s-app', 'a-git'] },
  { id: 'f-canvas',   label: 'canvas',       lines: 589,  layer: 'feature', color: '#22d3ee', desc: '可视化编辑 · Pixi.js', deps: ['s-canvas'] },
  { id: 'f-tasks',    label: 'task-manager', lines: 404,  layer: 'feature', color: '#22d3ee', desc: '任务列表/筛选/创建', deps: ['s-chat', 's-app', 'a-tasks'] },
  { id: 'f-sessions', label: 'sessions',     lines: 25,   layer: 'feature', color: '#22d3ee', desc: '会话页', deps: ['s-sessions', 'a-sessions'] },

  { id: 'a-chat',     label: 'api.chat',     lines: 0, layer: 'api', color: '#34d399', desc: 'startInterview / sendMessage / WS' },
  { id: 'a-projects', label: 'api.projects', lines: 0, layer: 'api', color: '#34d399', desc: 'list / get / create / update' },
  { id: 'a-tasks',    label: 'api.tasks',    lines: 0, layer: 'api', color: '#34d399', desc: 'list / get / create / launch' },
  { id: 'a-sessions', label: 'api.sessions', lines: 0, layer: 'api', color: '#34d399', desc: 'list / getEvents / WS' },
  { id: 'a-files',    label: 'api.files',    lines: 0, layer: 'api', color: '#34d399', desc: 'list / getContent / update' },
  { id: 'a-git',      label: 'api.git',      lines: 0, layer: 'api', color: '#34d399', desc: 'status / branches / log / diff' },

  { id: 'c-renderer',     label: 'ChatRenderer',      lines: 1432, layer: 'component', color: '#fbbf24', desc: 'Markdown / CodeBlock / DiffBlock' },
  { id: 'c-session-chat', label: 'SessionChat',        lines: 500,  layer: 'component', color: '#fbbf24', desc: 'TranscriptViewer / SessionList' },
  { id: 'c-mindmap',      label: 'MindMap',            lines: 1200, layer: 'component', color: '#fbbf24', desc: 'Canvas / Node / Edge / D3' },
  { id: 'c-float',        label: 'FloatingAssistant',  lines: 500,  layer: 'component', color: '#fbbf24', desc: '悬浮 AI 助手' },
]

const NODE_MAP = Object.fromEntries(NODES_DATA.map(n => [n.id, n]))

const POSITIONS: Record<string, { x: number; y: number }> = {
  's-chat':      { x: 0,   y: 0    },
  's-app':       { x: 0,   y: 150  },
  's-editor':    { x: 0,   y: 300  },
  's-canvas':    { x: 0,   y: 450  },
  's-sessions':  { x: 0,   y: 600  },
  's-auth':      { x: 0,   y: 750  },
  'f-chat':      { x: 320, y: 0    },
  'f-admin':     { x: 320, y: 340  },
  'f-dashboard': { x: 320, y: 490  },
  'f-files':     { x: 320, y: 640  },
  'f-git':       { x: 320, y: 790  },
  'f-canvas':    { x: 320, y: 940  },
  'f-tasks':     { x: 320, y: 1090 },
  'f-sessions':  { x: 320, y: 1230 },
  'a-chat':      { x: 740, y: 0    },
  'a-projects':  { x: 740, y: 140  },
  'a-tasks':     { x: 740, y: 280  },
  'a-sessions':  { x: 740, y: 420  },
  'a-files':     { x: 740, y: 560  },
  'a-git':       { x: 740, y: 700  },
  'c-renderer':      { x: 1000, y: 0   },
  'c-session-chat':  { x: 1000, y: 150 },
  'c-mindmap':       { x: 1000, y: 300 },
  'c-float':         { x: 1000, y: 450 },
}

// ─────────────────────────────────────────────
// 节点组件
// ─────────────────────────────────────────────
interface NodeData extends Record<string, unknown> {
  nodeInfo: FeatureNode
  selected: boolean
  onSelect: (id: string) => void
}

function PGNode({ data }: NodeProps) {
  const d = data as NodeData
  const n = d.nodeInfo

  const handleClick = () => d.onSelect(n.id)

  const dotStyle: React.CSSProperties = {
    width: 6, height: 6, background: 'transparent', border: 'none',
  }

  if (n.layer === 'store') {
    return (
      <div
        className={[styles.storeCard, d.selected ? styles.storeCardSelected : ''].join(' ')}
        onClick={handleClick}
      >
        <Handle type="target" position={Position.Left}  style={dotStyle} />
        <Handle type="source" position={Position.Right} style={{ ...dotStyle, background: n.color, opacity: 0.6 }} />
        <div className={styles.storeHead}>
          <span className={styles.storeDot} style={{ background: n.color }} />
          <span className={styles.storeTitle}>{n.label}</span>
        </div>
        <div className={styles.storeDesc}>{n.desc}</div>
        {n.lines > 0 && <div className={styles.storeLines}>{n.lines}L</div>}
      </div>
    )
  }

  if (n.layer === 'api') {
    return (
      <div
        className={[styles.apiCard, d.selected ? styles.apiCardSelected : ''].join(' ')}
        onClick={handleClick}
      >
        <Handle type="target" position={Position.Left}  style={{ ...dotStyle, background: n.color, opacity: 0.6 }} />
        <Handle type="source" position={Position.Right} style={dotStyle} />
        <div className={styles.apiHead}>
          <span className={styles.apiDot} style={{ background: n.color }} />
          <span className={styles.apiTitle}>{n.label}</span>
        </div>
        <div className={styles.apiDesc}>{n.desc}</div>
      </div>
    )
  }

  if (n.layer === 'component') {
    return (
      <div
        className={[styles.compCard, d.selected ? styles.compCardSelected : ''].join(' ')}
        onClick={handleClick}
      >
        <Handle type="target" position={Position.Left}  style={{ ...dotStyle, background: n.color, opacity: 0.6 }} />
        <Handle type="source" position={Position.Right} style={dotStyle} />
        <div className={styles.compHead}>
          <span className={styles.compDot} style={{ background: n.color }} />
          <span className={styles.compTitle}>{n.label}</span>
        </div>
        <div className={styles.compDesc}>{n.desc}</div>
      </div>
    )
  }

  if (n.id === 'f-chat') {
    return (
      <div
        className={[styles.chatCard, d.selected ? styles.chatCardSelected : ''].join(' ')}
        onClick={handleClick}
      >
        <Handle type="target" position={Position.Left}  style={{ ...dotStyle, background: n.color, opacity: 0.6 }} />
        <Handle type="source" position={Position.Right} style={{ ...dotStyle, background: n.color, opacity: 0.6 }} />
        <div className={styles.chatCardHead}>
          <span className={styles.chatCardBadge}>FEATURE</span>
          <span className={styles.chatCardTitle}>{n.label}</span>
          <span className={styles.chatCardLines}>{n.lines.toLocaleString()} L</span>
        </div>
        <div className={styles.chatCardFiles}>
          {n.details?.files?.map(f => (
            <>
              <span key={f.name + 'n'} className={styles.chatCardFileName}>{f.name}</span>
              <span key={f.name + 'l'} className={styles.chatCardFileLines}>{f.lines}</span>
            </>
          ))}
        </div>
        <div className={styles.chatCardDivider} />
        <div className={styles.chatCardFeatures}>
          {n.details?.features?.map(f => (
            <span key={f} className={styles.chatCardFeatureChip}>{f}</span>
          ))}
        </div>
        <div className={styles.chatCardProgressBar}>
          <div className={styles.chatCardProgressFill} />
        </div>
      </div>
    )
  }

  // 普通 feature
  const pct = Math.min(100, (n.lines / 5500) * 100)
  return (
    <div
      className={[styles.fnCard, d.selected ? styles.fnCardSelected : ''].join(' ')}
      style={{ '--fn-color': n.color } as React.CSSProperties}
      onClick={handleClick}
    >
      <Handle type="target" position={Position.Left}  style={{ ...dotStyle, background: n.color, opacity: 0.6 }} />
      <Handle type="source" position={Position.Right} style={{ ...dotStyle, background: n.color, opacity: 0.6 }} />
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
  )
}

const nodeTypes = { pg: PGNode }

// ─────────────────────────────────────────────
// 构建初始节点 / 边
// ─────────────────────────────────────────────
function makeNodes(selectedId: string | null, onSelect: (id: string) => void): Node[] {
  return NODES_DATA.map(n => ({
    id: n.id,
    type: 'pg',
    position: POSITIONS[n.id] ?? { x: 0, y: 0 },
    data: { nodeInfo: n, selected: selectedId === n.id, onSelect } as NodeData,
  }))
}

function makeEdges(selectedId: string | null): Edge[] {
  const edges: Edge[] = []
  NODES_DATA.forEach(n => {
    n.deps?.forEach(depId => {
      const dep = NODE_MAP[depId]
      if (!dep) return
      const active = selectedId === n.id || selectedId === depId
      const color  = active ? (dep.layer === 'store' ? dep.color : n.color) : 'rgba(100,130,180,0.4)'
      const isStore = dep.layer === 'store'
      edges.push({
        id:     `${isStore ? depId : n.id}--${isStore ? n.id : depId}`,
        source: isStore ? depId : n.id,
        target: isStore ? n.id  : depId,
        style:  { stroke: color, strokeWidth: active ? 1.5 : 1 },
        animated: active,
      })
    })
  })
  return edges
}

// ─────────────────────────────────────────────
// 左侧详情面板
// ─────────────────────────────────────────────
function DetailPanel({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const n = selectedId ? NODE_MAP[selectedId] : null
  const totalLines = NODES_DATA.reduce((s, x) => s + x.lines, 0)
  const layers = [
    { label: 'Feature', count: NODES_DATA.filter(x => x.layer === 'feature').length, color: '#22d3ee' },
    { label: 'Store',   count: NODES_DATA.filter(x => x.layer === 'store').length,   color: '#a78bfa' },
    { label: 'API',     count: NODES_DATA.filter(x => x.layer === 'api').length,     color: '#34d399' },
    { label: 'Comp',    count: NODES_DATA.filter(x => x.layer === 'component').length, color: '#fbbf24' },
  ]
  const maxCount = Math.max(...layers.map(l => l.count))

  return (
    <div className={styles.panel}>
      <div className={styles.panelCard}>
        <div className={styles.panelLabel}>项目架构</div>
        <div className={styles.panelTitle}>TaskConductor</div>
        <div className={styles.panelSub}>Tauri + React 19 · {(totalLines / 1000).toFixed(0)}K+ 行</div>
        {layers.map(l => (
          <div key={l.label} className={styles.panelBarRow}>
            <div className={styles.panelBarHead}>
              <span>{l.label}</span>
              <span className={styles.panelBarVal}>{l.count}</span>
            </div>
            <div className={styles.panelBarTrack}>
              <div className={styles.panelBarFill} style={{ width: `${(l.count / maxCount) * 100}%`, background: l.color }} />
            </div>
          </div>
        ))}
      </div>

      {n ? (
        <div className={styles.panelCard} style={{ borderColor: `${n.color}44` }}>
          <div className={styles.panelLabel} style={{ color: n.color }}>{n.layer.toUpperCase()}</div>
          <div className={styles.panelTitle}>{n.label}</div>
          <div className={styles.panelSub}>{n.desc}</div>
          {n.lines > 0 && (
            <div className={styles.panelBarRow}>
              <div className={styles.panelBarHead}><span>代码行数</span><span className={styles.panelBarVal}>{n.lines.toLocaleString()}</span></div>
              <div className={styles.panelBarTrack}>
                <div className={styles.panelBarFill} style={{ width: `${Math.min(100,(n.lines/5500)*100)}%`, background: n.color }} />
              </div>
            </div>
          )}
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
          {n.details?.features && (
            <div className={styles.panelSection}>
              <div className={styles.panelSectionLabel}>核心特性</div>
              <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                {n.details.features.map(f => <span key={f} className={styles.panelFeatureChip}>{f}</span>)}
              </div>
            </div>
          )}
          {n.deps && n.deps.length > 0 && (
            <div className={styles.panelSection}>
              <div className={styles.panelSectionLabel}>依赖</div>
              <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                {n.deps.map(depId => {
                  const dep = NODE_MAP[depId]
                  if (!dep) return null
                  return (
                    <span key={depId} className={styles.panelDepChip} onClick={() => onSelect(depId)}>
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
          <div style={{ fontSize: 11, color: 'rgba(100,120,160,0.4)' }}>点击节点查看详情</div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 主页面 — 严格按 reactflow.dev 官方结构
// ─────────────────────────────────────────────
function ProjectGraphInner() {
  const [selectedId, setSelectedId] = useState<string | null>('f-chat')

  const handleSelect = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id)
  }, [])

  const initialNodes = useMemo(() => makeNodes('f-chat', handleSelect), [handleSelect])
  const initialEdges = useMemo(() => makeEdges('f-chat'), [])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // selectedId 变化时同步更新 node.data.selected 和 edge 样式
  const handleSelectWithSync = useCallback((id: string) => {
    const next = selectedId === id ? null : id
    setSelectedId(next)
    setNodes(makeNodes(next, handleSelect))
    setEdges(makeEdges(next))
  }, [selectedId, handleSelect, setNodes, setEdges])

  return (
    // position: absolute + inset:0 绕过 height:100% 在 flex 容器中解析为 auto 的问题
    <div style={{ position: 'absolute', inset: 0, background: '#07080f' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.15}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={32} size={1} color="rgba(255,255,255,0.025)" />
      </ReactFlow>

      {/* DEBUG: remove after fix */}
      <div style={{ position:'absolute', top:4, right:4, zIndex:9999, background:'red', color:'#fff', padding:'4px 8px', fontSize:11, borderRadius:4 }}>
        nodes:{nodes.length} edges:{edges.length}
      </div>
      <DetailPanel selectedId={selectedId} onSelect={handleSelectWithSync} />

      <div className={styles.legend}>
        {[
          { label: 'Feature', color: '#22d3ee' },
          { label: 'Store',   color: '#a78bfa' },
          { label: 'API',     color: '#34d399' },
          { label: 'Comp',    color: '#fbbf24' },
        ].map(l => (
          <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className={styles.legendDot} style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
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
