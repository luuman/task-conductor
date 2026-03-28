/**
 * DocsDemoPage — 文档展示风格 Demo（4 种方案对比）
 *
 * View 1: Traditional MD   — 三栏 (树/正文/TOC) + inline hover 引用预览
 * View 2: Flow Graph       — 知识图谱 (@xyflow/react)，文档作为节点
 * View 3: Pipeline-linked  — 文档锚定在流水线阶段
 * View 4: Triptych Split   — 目录 | 正文 | 右侧引用面板（每条引用 hover 展开预览）
 */

import { useState, useCallback } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  Handle,
  Position,
  type NodeProps,
  type EdgeProps,
  getBezierPath,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import styles from './docs-demo.module.css'

// ─────────────────────────────────────────────
// Mock 数据
// ─────────────────────────────────────────────
interface DocItem {
  id: string
  title: string
  type: 'prd' | 'tech' | 'api' | 'ui' | 'test' | 'plan'
  stage: string
  excerpt: string
  refs: string[]    // 引用的文档 id
  backRefs: string[] // 被哪些文档引用
  content: string
  toc: string[]
  updatedAt: string
}

const DOCS: DocItem[] = [
  {
    id: 'prd',
    title: 'PRD — 产品需求文档',
    type: 'prd',
    stage: 'analysis',
    excerpt: '定义 TaskConductor 的核心用户故事、功能边界与成功指标。',
    refs: ['tech-arch', 'ui-spec'],
    backRefs: ['plan'],
    toc: ['背景与目标', '用户故事', '功能范围', '非功能需求', '成功指标'],
    updatedAt: '2026-03-25',
    content: `TaskConductor 旨在将软件开发流程中重复、高认知负担的环节自动化。

## 背景与目标

项目团队在日常开发中面临：任务拆解耗时、进度不透明、审批流程割裂等痛点。本产品以 AI 驱动的流水线将这些环节串联，配合实时观测能力，提升团队整体效率。

参见 [[技术架构文档]] 了解系统边界定义，以及 [[UI 规范]] 的交互约束。

## 用户故事

**US-001**：作为项目经理，我希望在仪表盘上看到所有任务当前所处的流水线阶段，以便随时了解进度。

**US-002**：作为开发者，我希望 AI 自动分析需求并生成 3 套技术方案供我选择，减少方案调研时间。

## 功能范围

本期（MVP）包含：流水线可视化、分析阶段 AI 方案生成、人工审批节点、Claude 会话实时观测。

不包含：多租户支持、移动端适配。`,
  },
  {
    id: 'tech-arch',
    title: '技术架构文档',
    type: 'tech',
    stage: 'plan',
    excerpt: '描述系统整体架构、组件分层与关键设计决策。',
    refs: ['api-spec', 'db-schema'],
    backRefs: ['prd', 'plan'],
    toc: ['架构总览', '后端分层', '前端架构', '数据流', '部署拓扑'],
    updatedAt: '2026-03-26',
    content: `## 架构总览

采用前后端分离架构：FastAPI（后端）+ React/Tauri（前端）。

参见 [[API 规范]] 获取接口定义，[[DB Schema]] 了解数据模型。

## 后端分层

\`\`\`
Routers → Service → Repository → SQLAlchemy ORM
                ↓
         ClaudePool（headless subprocess）
\`\`\``,
  },
  {
    id: 'ui-spec',
    title: 'UI 规范',
    type: 'ui',
    stage: 'analysis',
    excerpt: '设计系统规范：色彩 Token、间距体系、组件交互规则。',
    refs: ['comp-lib'],
    backRefs: ['prd'],
    toc: ['设计原则', 'Color Tokens', '间距与栅格', '组件规范', '动效'],
    updatedAt: '2026-03-24',
    content: `## 设计原则

简洁、信息密度、暗色优先。参见 [[组件库]] 获取具体实现。`,
  },
  {
    id: 'api-spec',
    title: 'API 规范',
    type: 'api',
    stage: 'dev',
    excerpt: 'REST 端点定义、鉴权方式、错误码体系。',
    refs: [],
    backRefs: ['tech-arch'],
    toc: ['鉴权', '项目 API', '任务 API', '流水线 API', 'WebSocket'],
    updatedAt: '2026-03-27',
    content: `## 鉴权

所有端点需在 Header 中携带 Bearer token。\n\n\`POST /auth/pin\` → 返回 token。`,
  },
  {
    id: 'db-schema',
    title: 'DB Schema',
    type: 'tech',
    stage: 'dev',
    excerpt: 'SQLite 数据模型、关系图、迁移策略。',
    refs: [],
    backRefs: ['tech-arch'],
    toc: ['Project', 'Task', 'StageArtifact', 'ClaudeSession', 'ClaudeEvent'],
    updatedAt: '2026-03-26',
    content: `## 核心表

\`Project\` 1—N \`Task\` 1—N \`StageArtifact\``,
  },
  {
    id: 'comp-lib',
    title: '组件库',
    type: 'ui',
    stage: 'dev',
    excerpt: 'CSS Modules + CSS Variables 自建组件清单与使用指南。',
    refs: [],
    backRefs: ['ui-spec'],
    toc: ['Button', 'Toggle', 'TagInput', 'JsonEditor', 'Modal', 'Skeleton'],
    updatedAt: '2026-03-23',
    content: `## Button

variant: default / ghost / outline，size: sm / md / lg / icon。`,
  },
  {
    id: 'plan',
    title: '迭代计划',
    type: 'plan',
    stage: 'plan',
    excerpt: 'Sprint 拆分、里程碑与资源分配。',
    refs: ['prd', 'tech-arch'],
    backRefs: [],
    toc: ['Sprint 1', 'Sprint 2', 'Sprint 3', '风险'],
    updatedAt: '2026-03-28',
    content: `## Sprint 1（4-01 ~ 4-14）

目标：完成流水线基础阶段，打通 analysis → plan 流程。

依赖：[[PRD — 产品需求文档]] 与 [[技术架构文档]] 已审批。`,
  },
]

const DOC_MAP = Object.fromEntries(DOCS.map(d => [d.id, d]))

const TYPE_COLOR: Record<string, string> = {
  prd: '#7c3aed',
  tech: '#0ea5e9',
  api: '#10b981',
  ui: '#f59e0b',
  test: '#ef4444',
  plan: '#8b5cf6',
}

const STAGE_DOCS: Record<string, string[]> = {
  input: [],
  analysis: ['prd', 'ui-spec'],
  prd: ['prd'],
  plan: ['tech-arch', 'plan'],
  ui: ['ui-spec', 'comp-lib'],
  dev: ['api-spec', 'db-schema', 'comp-lib'],
  test: [],
  deploy: [],
  monitor: [],
}

const STAGES = ['input', 'analysis', 'prd', 'plan', 'ui', 'dev', 'test', 'deploy', 'monitor']

// ─────────────────────────────────────────────
// View 1: Traditional MD
// ─────────────────────────────────────────────
function renderContent(text: string, allDocs: Record<string, DocItem>) {
  const parts = text.split(/(\[\[.+?\]\])/g)
  return parts.map((part, i) => {
    const m = part.match(/^\[\[(.+?)\]\]$/)
    if (m) {
      const label = m[1]
      const target = Object.values(allDocs).find(d => d.title.includes(label.split(' ')[0]))
      if (target) {
        return (
          <span key={i} className={styles.mdInlineLink}>
            {label}
            <span className={styles.mdHoverCard}>
              <div className={styles.mdHoverCardTitle}>{target.title}</div>
              <div className={styles.mdHoverCardBody}>{target.excerpt}</div>
            </span>
          </span>
        )
      }
    }
    return <span key={i}>{part}</span>
  })
}

function ViewMD() {
  const [selectedId, setSelectedId] = useState('prd')
  const doc = DOC_MAP[selectedId]

  const paragraphs = doc.content.split('\n\n').filter(Boolean)

  return (
    <div className={styles.mdLayout}>
      {/* 左侧文档树 */}
      <div className={styles.mdSidebar}>
        <div className={styles.mdSidebarHeader}>文档</div>
        <div className={styles.mdDocList}>
          {DOCS.map(d => (
            <div
              key={d.id}
              className={[styles.mdDocItem, selectedId === d.id ? styles.mdDocItemActive : ''].join(' ')}
              onClick={() => setSelectedId(d.id)}
            >
              <span className={styles.mdDocIcon}>
                {d.type === 'prd' ? '📋' : d.type === 'tech' ? '🏗️' : d.type === 'api' ? '🔌' : d.type === 'ui' ? '🎨' : d.type === 'plan' ? '📅' : '📄'}
              </span>
              <span style={{ flex: 1 }}>{d.title.split(' — ')[0]}</span>
              {d.stage === 'analysis' && <span className={styles.mdDocTag}>AI</span>}
            </div>
          ))}
        </div>
      </div>

      {/* 正文 */}
      <div className={styles.mdMain}>
        <h1 className={styles.mdH1}>{doc.title}</h1>
        <div className={styles.mdMeta}>
          <span className={styles.mdMetaTag}>{doc.stage}</span>
          <span className={styles.mdMetaTag}>{doc.updatedAt}</span>
          <span style={{ color: 'var(--tc-text-secondary)' }}>引用 {doc.refs.length} 篇 · 被引用 {doc.backRefs.length} 篇</span>
        </div>
        {paragraphs.map((para, i) => {
          if (para.startsWith('## ')) {
            return <h2 key={i} className={styles.mdH2}>{para.slice(3)}</h2>
          }
          if (para.startsWith('```')) {
            const code = para.replace(/^```\w*\n?/, '').replace(/```$/, '')
            return <pre key={i} className={styles.mdCodeBlock}>{code}</pre>
          }
          return (
            <p key={i} className={styles.mdPara}>
              {renderContent(para, DOC_MAP)}
            </p>
          )
        })}
      </div>

      {/* 右侧 TOC */}
      <div className={styles.mdToc}>
        <div className={styles.mdTocHeader}>目录</div>
        {doc.toc.map((item, i) => (
          <div key={i} className={styles.mdTocItem}>
            <span className={styles.mdTocDot} />
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// View 2: Flow Graph（Cinematic 风格）
// ─────────────────────────────────────────────

// 节点颜色表：对应 Dribbble 参考图的 cyan / purple / green 色系
const NODE_COLOR: Record<string, string> = {
  prd:  '#22d3ee',   // cyan
  tech: '#a78bfa',   // purple
  api:  '#34d399',   // green
  ui:   '#fbbf24',   // amber
  test: '#f87171',   // red
  plan: '#818cf8',   // indigo
}

// 节点完成度 mock（用于 progress bar）
const NODE_PROGRESS: Record<string, number> = {
  prd: 85, 'tech-arch': 70, 'ui-spec': 60,
  'api-spec': 90, 'db-schema': 95, 'comp-lib': 55, plan: 40,
}

interface GraphNodeData extends Record<string, unknown> {
  doc: DocItem
  selected: boolean
  onSelect: (id: string) => void
}

function GraphNode({ data }: NodeProps) {
  const d = data as GraphNodeData
  const color = NODE_COLOR[d.doc.type] ?? '#22d3ee'
  const progress = NODE_PROGRESS[d.doc.id] ?? 60

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div
        className={[styles.gnCard, d.selected ? styles.gnCardSelected : ''].join(' ')}
        style={{ '--node-color': color } as React.CSSProperties}
        onClick={() => d.onSelect(d.doc.id)}
      >
        {/* 顶部：图标 + 标题 + 类型徽章 */}
        <div className={styles.gnTop}>
          <span className={styles.gnDot} style={{ background: color }} />
          <span className={styles.gnTitle}>{d.doc.title.split(' — ')[0]}</span>
          <span className={styles.gnBadge}>{d.doc.type.toUpperCase()}</span>
        </div>

        {/* 摘要 */}
        <div className={styles.gnExcerpt}>{d.doc.excerpt}</div>

        {/* 进度条 */}
        <div className={styles.gnBar}>
          <div className={styles.gnBarFill} style={{ width: `${progress}%` }} />
        </div>

        {/* 底部 meta */}
        <div className={styles.gnFoot}>
          <span>{d.doc.stage}</span>
          <span>·</span>
          <span>{d.doc.updatedAt}</span>
          <span className={styles.gnFootDivider} />
          {d.doc.refs.length > 0 && <span>↗ {d.doc.refs.length}</span>}
          {d.doc.backRefs.length > 0 && <span>↙ {d.doc.backRefs.length}</span>}
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </>
  )
}

// 发光 Bezier 边
// 用多层叠加模拟 glow，不依赖 SVG filter（跨浏览器更可靠）
function GlowEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const color = (data?.color as string) ?? '#22d3ee'
  const active = data?.active as boolean

  // 箭头 marker id 基于颜色（避免重复）
  const markerId = `arrow-${color.replace('#', '')}`

  return (
    <g>
      <defs>
        <marker
          id={markerId}
          markerWidth="8" markerHeight="8"
          refX="6" refY="3"
          orient="auto"
        >
          <path d="M0,0 L0,6 L8,3 z" fill={active ? color : 'rgba(100,120,160,0.5)'} />
        </marker>
      </defs>

      {/* 激活时：多层宽度递减 + 不透明度递减，堆叠出 glow 光晕 */}
      {active && <path d={edgePath} fill="none" stroke={color} strokeWidth={12} opacity={0.04} />}
      {active && <path d={edgePath} fill="none" stroke={color} strokeWidth={7}  opacity={0.09} />}
      {active && <path d={edgePath} fill="none" stroke={color} strokeWidth={3}  opacity={0.20} />}

      {/* 实线（所有状态都渲染，非激活用可见灰色） */}
      <path
        d={edgePath} fill="none"
        stroke={active ? color : 'rgba(100,130,170,0.45)'}
        strokeWidth={active ? 1.5 : 1}
        markerEnd={`url(#${markerId})`}
      />
    </g>
  )
}

const nodeTypes = { docNode: GraphNode }
const edgeTypes = { glow: GlowEdge }

/**
 * 层级布局（从左到右体现引用依赖关系）
 *
 *  plan ──→ prd ──────→ tech-arch ──→ api-spec
 *            │                    └──→ db-schema
 *            └──→ ui-spec ──────────→ comp-lib
 *
 * x 轴 = 层级深度，y 轴 = 在本层中的垂直位置
 */
function buildFlowElements(selectedId: string | null, onSelect: (id: string) => void) {
  const positions: Record<string, [number, number]> = {
    plan:        [  0, 200],   // 层 0：最上层规划
    prd:         [240,  90],   // 层 1
    'tech-arch': [480,  30],   // 层 2
    'ui-spec':   [480, 240],   // 层 2
    'api-spec':  [720,   0],   // 层 3
    'db-schema': [720, 130],   // 层 3
    'comp-lib':  [720, 260],   // 层 3
  }

  const nodes: Node[] = DOCS.map(d => ({
    id: d.id,
    type: 'docNode',
    position: { x: positions[d.id]?.[0] ?? 0, y: positions[d.id]?.[1] ?? 0 },
    data: { doc: d, selected: selectedId === d.id, onSelect } as unknown as Record<string, unknown>,
  }))

  const edges: Edge[] = []
  DOCS.forEach(d => {
    d.refs.forEach(r => {
      const active = selectedId === d.id || selectedId === r
      edges.push({
        id: `${d.id}->${r}`,
        type: 'glow',
        source: d.id,
        target: r,
        data: { color: NODE_COLOR[d.doc?.type ?? d.type] ?? NODE_COLOR[DOC_MAP[d.id]?.type ?? 'prd'], active },
      })
    })
  })

  return { nodes, edges }
}

function ViewGraphInner() {
  const [selectedId, setSelectedId] = useState<string | null>('prd')
  const selected = selectedId ? DOC_MAP[selectedId] : null

  const handleSelect = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id)
  }, [])

  const { nodes, edges } = buildFlowElements(selectedId, handleSelect)

  return (
    <div className={styles.graphLayout}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'transparent' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={28} size={1}
          color="rgba(255,255,255,0.03)"
        />
      </ReactFlow>

      {/* 左侧详情卡片 */}
      <div className={styles.graphDetailPanel}>
        {/* 固定：图谱标题卡 */}
        <div className={styles.gdpCard}>
          <div className={styles.gdpLabel}>知识图谱</div>
          <div style={{ fontSize: 11, color: 'rgba(140,160,200,0.5)' }}>
            {DOCS.length} 篇文档 · {DOCS.reduce((n, d) => n + d.refs.length, 0)} 条引用关系
          </div>
        </div>

        {/* 选中文档详情卡 */}
        {selected && (() => {
          const color = NODE_COLOR[selected.type] ?? '#22d3ee'
          const progress = NODE_PROGRESS[selected.id] ?? 60
          return (
            <div className={[styles.gdpCard, styles.gdpCardActive].join(' ')}>
              <div className={styles.gdpLabel} style={{ color: `color-mix(in srgb, ${color} 60%, rgba(120,140,180,0.6))` }}>
                {selected.type.toUpperCase()}
              </div>
              <div className={styles.gdpTitle}>{selected.title.split(' — ')[0]}</div>
              <div className={styles.gdpMeta}>{selected.stage} · {selected.updatedAt}</div>
              <div className={styles.gdpExcerpt}>{selected.excerpt}</div>

              {/* 完成度 */}
              <div className={styles.gdpMetricRow}>
                <div className={styles.gdpMetricLabel}>
                  <span>完成度</span>
                  <span className={styles.gdpMetricValue}>{progress}%</span>
                </div>
                <div className={styles.gdpMetricBar}>
                  <div className={styles.gdpMetricFill}
                    style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 60%, white))`, boxShadow: `0 0 6px ${color}` }} />
                </div>
              </div>

              {/* 引用数 */}
              <div className={styles.gdpMetricRow}>
                <div className={styles.gdpMetricLabel}>
                  <span>引用 / 被引</span>
                  <span className={styles.gdpMetricValue}>{selected.refs.length} / {selected.backRefs.length}</span>
                </div>
                <div className={styles.gdpMetricBar}>
                  <div className={styles.gdpMetricFill}
                    style={{ width: `${Math.min(100, (selected.refs.length + selected.backRefs.length) * 20)}%`, background: 'rgba(168,139,250,0.7)' }} />
                </div>
              </div>

              {/* 快速跳转 */}
              {(selected.refs.length > 0 || selected.backRefs.length > 0) && (
                <div className={styles.gdpLinks}>
                  {[...selected.refs, ...selected.backRefs].map(r => (
                    <span key={r} className={styles.gdpLink} onClick={() => handleSelect(r)}>
                      {DOC_MAP[r]?.title.split(' — ')[0]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* 右下角图例 */}
      <div className={styles.graphLegend}>
        {Object.entries(NODE_COLOR).map(([type, color]) => (
          <span key={type} style={{ display: 'flex', alignItems: 'center' }}>
            <span className={styles.graphLegendDot} style={{ background: color, color }} />
            {type.toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  )
}

function ViewGraph() {
  return (
    <ReactFlowProvider>
      <ViewGraphInner />
    </ReactFlowProvider>
  )
}

// ─────────────────────────────────────────────
// View 3: Pipeline-linked
// ─────────────────────────────────────────────
function ViewPipeline() {
  const [activeStage, setActiveStage] = useState('analysis')
  const docIds = STAGE_DOCS[activeStage] ?? []
  const docs = docIds.map(id => DOC_MAP[id]).filter(Boolean)

  return (
    <div className={styles.pipeLayout}>
      {/* 流水线 Stage 条 */}
      <div className={styles.pipeStageBar}>
        {STAGES.map((stage, i) => {
          const count = (STAGE_DOCS[stage] ?? []).length
          return (
            <div key={stage} style={{ display: 'flex', alignItems: 'center' }}>
              <div
                className={[styles.pipeStage, activeStage === stage ? styles.pipeStageActive : ''].join(' ')}
                onClick={() => setActiveStage(stage)}
              >
                <div className={styles.pipeStageNode}>
                  {count > 0 && (
                    <span className={styles.pipeStageDocBadge}>{count}</span>
                  )}
                  <span style={{ fontSize: 11 }}>{stage}</span>
                </div>
                <span className={styles.pipeStageLabel}>
                  {count > 0 ? `${count} 文档` : '—'}
                </span>
              </div>
              {i < STAGES.length - 1 && <div className={styles.pipeConnector} />}
            </div>
          )
        })}
      </div>

      {/* 文档区域 */}
      <div className={styles.pipeDocArea}>
        <div className={styles.pipeDocAreaHeader}>
          <span className={styles.pipeDocAreaTitle}>{activeStage}</span>
          <span style={{ color: 'var(--tc-text-secondary)', fontSize: 11 }}>阶段文档</span>
        </div>

        {docs.length === 0 ? (
          <div className={styles.pipeEmpty}>
            <span style={{ fontSize: 24 }}>📭</span>
            <span>该阶段暂无关联文档</span>
          </div>
        ) : (
          <div className={styles.pipeDocGrid}>
            {docs.map(doc => (
              <div key={doc.id} className={styles.pipeDocCard}>
                <div className={styles.pipeDocCardTitle}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: TYPE_COLOR[doc.type], flexShrink: 0,
                    display: 'inline-block'
                  }} />
                  {doc.title}
                </div>
                <div className={styles.pipeDocCardBody}>{doc.content.replace(/##.+?\n/g, '').replace(/\[\[|\]\]/g, '').trim()}</div>
                <div className={styles.pipeDocCardMeta}>
                  <span className={styles.pipeDocCardMetaTag}>{doc.type.toUpperCase()}</span>
                  <span className={styles.pipeDocCardMetaTag}>{doc.updatedAt}</span>
                  {doc.refs.length > 0 && (
                    <span className={styles.pipeDocCardMetaTag}>↗ {doc.refs.length} 引用</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// View 4: Triptych (三栏 + hover 引用预览)
// ─────────────────────────────────────────────
function ViewTriptych() {
  const [selectedId, setSelectedId] = useState('prd')
  const doc = DOC_MAP[selectedId]
  const paragraphs = doc.content.split('\n\n').filter(Boolean)

  const refDocs = doc.refs.map(r => DOC_MAP[r]).filter(Boolean)
  const backRefDocs = doc.backRefs.map(r => DOC_MAP[r]).filter(Boolean)

  return (
    <div className={styles.triLayout}>
      {/* 左侧大纲 */}
      <div className={styles.triOutline}>
        <div className={styles.triOutlineSection}>
          <div className={styles.triOutlineSectionLabel}>文档</div>
          {DOCS.map(d => (
            <div key={d.id}>
              <div
                className={[
                  styles.triOutlineItem,
                  selectedId === d.id ? styles.triOutlineItemActive : ''
                ].join(' ')}
                onClick={() => setSelectedId(d.id)}
              >
                <span>{d.type === 'prd' ? '📋' : d.type === 'tech' ? '🏗️' : d.type === 'api' ? '🔌' : d.type === 'ui' ? '🎨' : d.type === 'plan' ? '📅' : '📄'}</span>
                <span style={{ fontSize: 11 }}>{d.title.split(' — ')[0]}</span>
              </div>
              {selectedId === d.id && d.toc.map((h, i) => (
                <div key={i} className={[styles.triOutlineItem, styles.triOutlineIndent].join(' ')}>
                  {h}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 中间正文 */}
      <div className={styles.triContent}>
        <h1 className={styles.mdH1}>{doc.title}</h1>
        <div className={styles.mdMeta}>
          <span className={styles.mdMetaTag}>{doc.stage}</span>
          <span className={styles.mdMetaTag}>{doc.updatedAt}</span>
        </div>
        {paragraphs.map((para, i) => {
          if (para.startsWith('## ')) {
            return <h2 key={i} className={styles.mdH2}>{para.slice(3)}</h2>
          }
          if (para.startsWith('```')) {
            const code = para.replace(/^```\w*\n?/, '').replace(/```$/, '')
            return <pre key={i} className={styles.mdCodeBlock}>{code}</pre>
          }
          return (
            <p key={i} className={styles.mdPara}>
              {renderContent(para, DOC_MAP)}
            </p>
          )
        })}
      </div>

      {/* 右侧引用面板 */}
      <div className={styles.triRefPanel}>
        <div className={styles.triRefPanelTitle}>引用关系</div>

        {refDocs.length > 0 && (
          <div className={styles.triRefSection}>
            <div className={styles.triRefSectionLabel}>
              本文引用
              <span className={styles.triRefCount}>{refDocs.length}</span>
            </div>
            {refDocs.map(d => (
              <div
                key={d.id}
                className={styles.triRefItem}
                onClick={() => setSelectedId(d.id)}
              >
                <div>
                  <div className={styles.triRefItemTitle}>{d.title.split(' — ')[0]}</div>
                  <div className={styles.triRefItemContext}>{d.excerpt.slice(0, 48)}…</div>
                </div>
                {/* Hover 预览卡片 */}
                <div className={styles.triRefHoverCard}>
                  <div className={styles.triRefHoverCardTitle}>{d.title}</div>
                  <div className={styles.triRefHoverCardContent}>
                    {d.content.replace(/##.+?\n/g, '').replace(/\[\[|\]\]/g, '').trim().slice(0, 180)}…
                  </div>
                  <div style={{ marginTop: 8, fontSize: 10, color: 'var(--tc-text-secondary)' }}>
                    目录：{d.toc.join(' · ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {backRefDocs.length > 0 && (
          <div className={styles.triRefSection}>
            <div className={styles.triRefSectionLabel}>
              被引用
              <span className={styles.triRefCount}>{backRefDocs.length}</span>
            </div>
            {backRefDocs.map(d => (
              <div
                key={d.id}
                className={styles.triRefItem}
                onClick={() => setSelectedId(d.id)}
              >
                <div>
                  <div className={styles.triRefItemTitle}>{d.title.split(' — ')[0]}</div>
                  <div className={styles.triRefItemContext}>{d.excerpt.slice(0, 48)}…</div>
                </div>
                <div className={styles.triRefHoverCard}>
                  <div className={styles.triRefHoverCardTitle}>{d.title}</div>
                  <div className={styles.triRefHoverCardContent}>
                    {d.content.replace(/##.+?\n/g, '').replace(/\[\[|\]\]/g, '').trim().slice(0, 180)}…
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {refDocs.length === 0 && backRefDocs.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--tc-text-secondary)', textAlign: 'center', marginTop: 24 }}>
            无引用关系
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 主页面
// ─────────────────────────────────────────────
const VIEWS = [
  { id: 'md',       label: 'MD 传统三栏',    badge: 'stable', desc: '树+正文+TOC，inline hover 引用预览' },
  { id: 'graph',    label: '知识图谱',        badge: 'flow',   desc: '@xyflow/react 节点关系图，点击节点展开预览' },
  { id: 'pipeline', label: '流水线绑定',      badge: 'P0',     desc: '文档锚定阶段，点击 stage 展示关联文档卡片' },
  { id: 'triptych', label: '三栏+引用面板',   badge: 'rec',    desc: '目录|正文|引用，hover 展开全文预览' },
] as const

type ViewId = typeof VIEWS[number]['id']

const BADGE_COLOR: Record<string, string> = {
  stable: '#64748b',
  flow:   '#0ea5e9',
  P0:     '#7c3aed',
  rec:    '#10b981',
}

export default function DocsDemoPage() {
  const [view, setView] = useState<ViewId>('md')

  return (
    <div className={styles.page}>
      <div className={styles.viewTabs}>
        {VIEWS.map(v => (
          <button
            key={v.id}
            className={[styles.viewTab, view === v.id ? styles.viewTabActive : ''].join(' ')}
            onClick={() => setView(v.id)}
            title={v.desc}
          >
            {v.label}
            <span
              className={styles.viewTabBadge}
              style={{ background: BADGE_COLOR[v.badge] }}
            >
              {v.badge}
            </span>
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tc-text-secondary)' }}>
          hover 引用链接/面板查看预览
        </span>
      </div>

      <div className={styles.viewContent}>
        {view === 'md'       && <ViewMD />}
        {view === 'graph'    && <ViewGraph />}
        {view === 'pipeline' && <ViewPipeline />}
        {view === 'triptych' && <ViewTriptych />}
      </div>
    </div>
  )
}
