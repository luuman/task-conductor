import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../../ui/skeleton/Skeleton'
import { api } from '../../../lib/api'
import type { SystemMetrics, ProcessList, ProcessInfo, ClaudeUsage } from '../../../lib/api/types'
import styles from '../admin.module.css'
import s from './server-monitor.module.css'

/* ── 颜色工具 ── */
const PROC_PALETTE: Record<string, string> = {
  chrome: '#60a5fa', claude: '#a78bfa', node: '#34d399',
  'rust-analyzer': '#f97316', python: '#fbbf24', vite: '#22d3ee',
  code: '#f472b6', bash: '#8891a5',
}

function procColor(name: string): string {
  return PROC_PALETTE[name] || '#8891a5'
}

function cpuColor(v: number): string {
  return v > 80 ? 'var(--tc-error)' : v > 50 ? 'var(--tc-warning)' : 'var(--tc-success)'
}

function memColor(v: number): string {
  return v > 80 ? 'var(--tc-error)' : v > 50 ? 'var(--tc-warning)' : 'var(--tc-success)'
}

function cpuColorRaw(v: number): string {
  return v > 50 ? '#f87171' : v > 10 ? '#f97316' : '#60a5fa'
}

function memColorRaw(mb: number): string {
  return mb > 1000 ? '#f97316' : '#34d399'
}

function fmtMem(mb: number): string {
  return mb > 1000 ? (mb / 1024).toFixed(1) + 'G' : Math.round(mb) + 'M'
}

/* ── SVG 环形 Gauge ── */
function GaugeRingSvg({ value, color, size = 64 }: { value: number; color: string; size?: number }) {
  const r = size * 0.38, sw = size * 0.08
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(value, 100) / 100) * circ
  const cx = size / 2, cy = size / 2
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--tc-border)" strokeWidth={sw} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px` }} />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={size * 0.2} fontWeight={600}
        fontFamily="'Geist Mono', monospace">{Math.round(value)}%</text>
    </svg>
  )
}

/* ── Mini Sparkline ── */
function MiniSpark({ data, color, w = 100, h = 22 }: { data: number[]; color: string; w?: number; h?: number }) {
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 3) - 1.5}`).join(' ')
  const fill = pts + ` ${w},${h} 0,${h}`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ display: 'block' }}>
      <polygon points={fill} fill={color + '15'} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" />
    </svg>
  )
}

/* ── 面积图 ── */
function AreaChart({ series, colors, w, h }: { series: number[][]; colors: string[]; w: number; h: number }) {
  if (!series.length || !series[0].length) return null
  const N = series[0].length
  const stacked = series.map((_, si) =>
    Array.from({ length: N }, (_, i) => series.slice(0, si + 1).reduce((sum, arr) => sum + arr[i], 0))
  )
  const maxY = Math.max(...stacked[stacked.length - 1], 1) * 1.15
  const paths = stacked.map((upper, si) => {
    const lower = si > 0 ? stacked[si - 1] : Array(N).fill(0)
    let d = `M0,${h}`
    for (let i = 0; i < N; i++) d += ` L${(i / (N - 1)) * w},${h - (lower[i] / maxY) * h}`
    for (let i = N - 1; i >= 0; i--) d += ` L${(i / (N - 1)) * w},${h - (upper[i] / maxY) * h}`
    return d + ' Z'
  })

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" height={h} style={{ width: '100%' }}>
      {[25, 50, 75].map(p => {
        const y = h - (p / maxY) * h
        return y > 0 && y < h ? <line key={p} x1={0} y1={y} x2={w} y2={y} stroke="var(--tc-border)" strokeWidth="0.5" /> : null
      })}
      {paths.map((d, i) => (
        <path key={i} d={d} fill={colors[i] + '30'} stroke={colors[i]} strokeWidth="1.2" />
      )).reverse()}
    </svg>
  )
}

/* ── 进程卡片 ── */
function ProcessCard({ proc, onKill }: { proc: ProcessInfo; onKill: (pid: number) => void }) {
  const [confirming, setConfirming] = useState(false)
  const color = procColor(proc.name)
  const cpuC = cpuColorRaw(proc.cpu_pct)
  const memC = memColorRaw(proc.mem_mb)
  const cpuPct = Math.min(proc.cpu_pct, 100)
  const memPct = Math.min(proc.mem_mb / 2600 * 100, 100)

  return (
    <div className={s.pc}>
      <div className={s.pcBar} style={{ background: color }} />
      <div className={s.pcHead}>
        <div className={s.pcDot} style={{ background: color }} />
        <span className={s.pcName}>{proc.name}</span>
        <span className={s.pcPid}>{proc.pid}</span>
      </div>
      <div className={s.pcMetrics}>
        <div className={s.pcMetric}>
          <div className={s.pcMetricHeader}>
            <span className={s.pcMetricLabel}>CPU</span>
            <span className={s.pcMetricVal} style={{ color: cpuC }}>{proc.cpu_pct}%</span>
          </div>
          <div className={s.pcTrack}><div className={s.pcFill} style={{ width: `${cpuPct}%`, background: cpuC }} /></div>
        </div>
        <div className={s.pcMetric}>
          <div className={s.pcMetricHeader}>
            <span className={s.pcMetricLabel}>MEM</span>
            <span className={s.pcMetricVal} style={{ color: memC }}>{fmtMem(proc.mem_mb)}</span>
          </div>
          <div className={s.pcTrack}><div className={s.pcFill} style={{ width: `${memPct}%`, background: memC }} /></div>
        </div>
      </div>
      {confirming ? (
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={s.pcKill} style={{ opacity: 1, borderColor: 'var(--tc-error)', color: 'var(--tc-error)' }}
            onClick={() => { onKill(proc.pid); setConfirming(false) }}>确认</button>
          <button className={s.pcKill} style={{ opacity: 1 }} onClick={() => setConfirming(false)}>取消</button>
        </div>
      ) : (
        <button className={s.pcKill} onClick={() => setConfirming(true)}>终止</button>
      )}
    </div>
  )
}

/* ── 拓扑图节点数据 ── */
interface TopoNode {
  id: string
  label: string
  x: number
  y: number
  cpu: number
  mem: number
  color: string
}

interface TopoEdge {
  from: string
  to: string
}

function buildTopology(procs: ProcessInfo[]): { nodes: TopoNode[]; edges: TopoEdge[] } {
  if (!procs.length) return { nodes: [], edges: [] }

  // 按名称分组
  const groups = new Map<string, ProcessInfo[]>()
  for (const p of procs) {
    const list = groups.get(p.name) ?? []
    list.push(p)
    groups.set(p.name, list)
  }

  const nodes: TopoNode[] = []
  const edges: TopoEdge[] = []

  // 根节点
  nodes.push({ id: 'root', label: 'host', x: 500, y: 40, cpu: 0, mem: 0, color: '#545d72' })

  // 根据 ppid 构建父子关系
  const pidToId = new Map<number, string>()
  const allPids = new Set(procs.map(p => p.pid))

  // 为每个进程创建节点
  let idx = 0
  const groupNames = [...groups.keys()].sort((a, b) => {
    const aCpu = Math.max(...(groups.get(a)?.map(p => p.cpu_pct) ?? [0]))
    const bCpu = Math.max(...(groups.get(b)?.map(p => p.cpu_pct) ?? [0]))
    return bCpu - aCpu
  })

  const groupCount = groupNames.length
  const spacing = 900 / (groupCount + 1)

  groupNames.forEach((name, gi) => {
    const members = groups.get(name)!
    const color = procColor(name)
    const gx = 100 + spacing * gi

    // 第一个成员作为组头（CPU 最高的）
    const sorted = [...members].sort((a, b) => b.cpu_pct - a.cpu_pct)
    const head = sorted[0]
    const headId = `p${head.pid}`
    nodes.push({ id: headId, label: name, x: gx, y: 160, cpu: head.cpu_pct, mem: head.mem_mb, color })
    pidToId.set(head.pid, headId)
    edges.push({ from: 'root', to: headId })

    // 其余成员作为子节点
    sorted.slice(1).forEach((p, ci) => {
      const cid = `p${p.pid}`
      const cx = gx - ((sorted.length - 2) / 2 - ci) * 70
      nodes.push({ id: cid, label: name, x: cx, y: 290, cpu: p.cpu_pct, mem: p.mem_mb, color })
      pidToId.set(p.pid, cid)

      // 如果 ppid 在当前进程列表中，连到父进程
      if (p.ppid && allPids.has(p.ppid) && pidToId.has(p.ppid)) {
        edges.push({ from: pidToId.get(p.ppid)!, to: cid })
      } else {
        edges.push({ from: headId, to: cid })
      }
    })
    idx++
  })

  return { nodes, edges }
}

/* ── 拓扑图组件 ── */
function ProcessTopology({ procs, onKill }: { procs: ProcessInfo[]; onKill: (pid: number) => void }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const { nodes, edges } = useMemo(() => buildTopology(procs), [procs])
  const [vb, setVb] = useState({ x: 0, y: 0, w: 1000, h: 380 })
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const panRef = useRef<{ startX: number; startY: number; vbx: number; vby: number } | null>(null)
  const dragRef = useRef<{ nodeId: string; dx: number; dy: number } | null>(null)
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(new Map())

  // 初始化位置
  useEffect(() => {
    const map = new Map<string, { x: number; y: number }>()
    nodes.forEach(n => map.set(n.id, { x: n.x, y: n.y }))
    setNodePositions(map)
  }, [nodes])

  // 关联关系
  const related = useMemo(() => {
    const r = new Map<string, Set<string>>()
    nodes.forEach(n => r.set(n.id, new Set([n.id])))
    edges.forEach(e => {
      r.get(e.from)?.add(e.to)
      r.get(e.to)?.add(e.from)
    })
    return r
  }, [nodes, edges])

  const getPos = (id: string) => nodePositions.get(id) ?? { x: 0, y: 0 }

  // 缩放（non-passive 才能 preventDefault 阻止外层滚动）
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const scale = e.deltaY > 0 ? 1.1 : 0.9
      setVb(prev => {
        const nw = prev.w * scale, nh = prev.h * scale
        if (nw < 200 || nw > 3000) return prev
        const svg = svgRef.current
        if (!svg) return prev
        const rect = svg.getBoundingClientRect()
        const mx = (e.clientX - rect.left) / rect.width
        const my = (e.clientY - rect.top) / rect.height
        return { x: prev.x + (prev.w - nw) * mx, y: prev.y + (prev.h - nh) * my, w: nw, h: nh }
      })
    }
    wrap.addEventListener('wheel', onWheel, { passive: false })
    return () => wrap.removeEventListener('wheel', onWheel)
  }, [])

  // 平移/拖拽
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const svgX = vb.x + (e.clientX - rect.left) / rect.width * vb.w
    const svgY = vb.y + (e.clientY - rect.top) / rect.height * vb.h

    // 检查是否点击了节点
    let closest: string | null = null, minDist = 40
    nodePositions.forEach((pos, id) => {
      const d = Math.hypot(pos.x - svgX, pos.y - svgY)
      if (d < minDist) { closest = id; minDist = d }
    })

    if (closest) {
      const pos = getPos(closest)
      dragRef.current = { nodeId: closest, dx: pos.x - svgX, dy: pos.y - svgY }
    } else {
      panRef.current = { startX: e.clientX, startY: e.clientY, vbx: vb.x, vby: vb.y }
    }
  }, [vb, nodePositions])

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()

      if (dragRef.current) {
        const svgX = vb.x + (e.clientX - rect.left) / rect.width * vb.w
        const svgY = vb.y + (e.clientY - rect.top) / rect.height * vb.h
        setNodePositions(prev => {
          const next = new Map(prev)
          next.set(dragRef.current!.nodeId, {
            x: svgX + dragRef.current!.dx,
            y: svgY + dragRef.current!.dy,
          })
          return next
        })
      } else if (panRef.current) {
        const dx = (e.clientX - panRef.current.startX) / rect.width * vb.w
        const dy = (e.clientY - panRef.current.startY) / rect.height * vb.h
        setVb(prev => ({ ...prev, x: panRef.current!.vbx - dx, y: panRef.current!.vby - dy }))
      }
    }
    const handleUp = () => { panRef.current = null; dragRef.current = null }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp) }
  }, [vb])

  const isRelated = (id: string) => !hoveredId || (related.get(hoveredId)?.has(id) ?? false)
  const isEdgeRelated = (from: string, to: string) =>
    !hoveredId || (related.get(hoveredId)?.has(from) && related.get(hoveredId)?.has(to))

  const outerR = 26, outerSW = 4, innerR = 18, innerSW = 4

  return (
    <div className={s.topoWrap} ref={wrapRef}>
      <svg
        ref={svgRef}
        className={s.topoSvg}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        onMouseDown={handleMouseDown}
      >
        <defs>
          {nodes.map(n => {
            const pos = getPos(n.id)
            return (
              <g key={`defs-${n.id}`}>
                <path id={`cpu-arc-${n.id}`}
                  d={`M${pos.x - outerR},${pos.y} A${outerR},${outerR} 0 0,1 ${pos.x + outerR},${pos.y}`}
                  fill="none" />
                <path id={`mem-arc-${n.id}`}
                  d={`M${pos.x + innerR},${pos.y} A${innerR},${innerR} 0 0,1 ${pos.x - innerR},${pos.y}`}
                  fill="none" />
              </g>
            )
          })}
        </defs>

        {/* 连线 */}
        {edges.map((e, i) => {
          const from = getPos(e.from), to = getPos(e.to)
          const rel = isEdgeRelated(e.from, e.to)
          return (
            <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              stroke={rel ? '#2a3244' : '#141820'}
              strokeWidth="1.5" strokeDasharray="5 3"
              style={{ transition: 'stroke 0.25s, opacity 0.25s', opacity: rel ? 1 : 0.1 }} />
          )
        })}

        {/* 流动光点 */}
        {edges.map((e, i) => {
          const from = getPos(e.from), to = getPos(e.to)
          const toNode = nodes.find(n => n.id === e.to)
          return (
            <circle key={`dot-${i}`} r="2" fill={toNode?.color ?? '#888'} opacity="0.6">
              <animateMotion
                dur={`${1.3 + (i % 5) * 0.3}s`}
                repeatCount="indefinite"
                path={`M${from.x},${from.y} L${to.x},${to.y}`}
              />
            </circle>
          )
        })}

        {/* 节点 */}
        {nodes.map(n => {
          const pos = getPos(n.id)
          const rel = isRelated(n.id)
          const cpuC = cpuColorRaw(n.cpu)
          const memC = memColorRaw(n.mem)
          const outerCirc = 2 * Math.PI * outerR
          const outerOff = outerCirc - (Math.min(n.cpu, 100) / 100) * outerCirc
          const innerCirc = 2 * Math.PI * innerR
          const memPct = Math.min(n.mem / 2600 * 100, 100)
          const innerOff = innerCirc - (memPct / 100) * innerCirc

          return (
            <g key={n.id}
              style={{
                opacity: rel ? 1 : 0.12,
                filter: rel ? 'none' : 'saturate(0)',
                transition: 'opacity 0.25s, filter 0.25s',
                cursor: 'pointer',
              }}
              onMouseEnter={() => setHoveredId(n.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* 外环 CPU */}
              <circle cx={pos.x} cy={pos.y} r={outerR} fill="none" stroke="var(--tc-border)" strokeWidth={outerSW} />
              <circle cx={pos.x} cy={pos.y} r={outerR} fill="none" stroke={cpuC} strokeWidth={outerSW}
                strokeDasharray={outerCirc} strokeDashoffset={outerOff} strokeLinecap="round"
                style={{ transform: `rotate(-90deg)`, transformOrigin: `${pos.x}px ${pos.y}px` }} />
              {/* 内环 MEM */}
              <circle cx={pos.x} cy={pos.y} r={innerR} fill="none" stroke="var(--tc-border)" strokeWidth={innerSW} />
              <circle cx={pos.x} cy={pos.y} r={innerR} fill="none" stroke={memC} strokeWidth={innerSW}
                strokeDasharray={innerCirc} strokeDashoffset={innerOff} strokeLinecap="round"
                style={{ transform: `rotate(-90deg)`, transformOrigin: `${pos.x}px ${pos.y}px` }} />
              {/* 中心 */}
              <circle cx={pos.x} cy={pos.y} r={innerR - innerSW / 2 - 1} fill={n.color + '15'} />
              {/* CPU% 沿外环 */}
              {n.cpu > 0 && (
                <text fill={cpuC} fontSize="7" fontWeight="700" fontFamily="'Geist Mono', monospace">
                  <textPath href={`#cpu-arc-${n.id}`} startOffset="50%" textAnchor="middle">{n.cpu}%</textPath>
                </text>
              )}
              {/* MEM 沿内环 */}
              <text fill={memC} fontSize="6.5" fontWeight="600" fontFamily="'Geist Mono', monospace">
                <textPath href={`#mem-arc-${n.id}`} startOffset="50%" textAnchor="middle">{fmtMem(n.mem)}</textPath>
              </text>
              {/* 进程名 */}
              <text x={pos.x} y={pos.y + 1} textAnchor="middle" dominantBaseline="central"
                fill="var(--tc-foreground)" fontSize="7.5" fontWeight="600"
                fontFamily="'Geist Mono', monospace">
                {n.label.length > 10 ? n.label.slice(0, 9) + '…' : n.label}
              </text>
            </g>
          )
        })}
      </svg>

      <div className={s.topoControls}>
        <button className={s.topoCtrlBtn} onClick={() => setVb(p => {
          const nw = p.w * 0.8, nh = p.h * 0.8
          return nw < 200 ? p : { x: p.x + (p.w - nw) / 2, y: p.y + (p.h - nh) / 2, w: nw, h: nh }
        })}>+</button>
        <button className={s.topoCtrlBtn} onClick={() => setVb(p => {
          const nw = p.w * 1.25, nh = p.h * 1.25
          return nw > 3000 ? p : { x: p.x + (p.w - nw) / 2, y: p.y + (p.h - nh) / 2, w: nw, h: nh }
        })}>−</button>
        <button className={s.topoCtrlBtn} onClick={() => setVb({ x: 0, y: 0, w: 1000, h: 380 })}>⟳</button>
      </div>
    </div>
  )
}

/* ── Claude 详情卡片 ── */
function ClaudeCard({ proc, color, index }: { proc: ProcessInfo; color: string; index: number }) {
  const isActive = proc.cpu_pct > 1
  const statusColor = isActive ? '#34d399' : '#f97316'
  const statusLabel = isActive ? '运行中' : '空闲'
  const roleIcon = '◉'

  const gaugeSize = 44
  const gR = gaugeSize * 0.36, gSW = gaugeSize * 0.1
  const cpuCirc = 2 * Math.PI * gR
  const cpuOff = cpuCirc - (Math.min(proc.cpu_pct, 20) / 20) * cpuCirc
  const memCirc = 2 * Math.PI * gR
  const memOff = memCirc - (Math.min(proc.mem_mb, 700) / 700) * memCirc

  const cpuC = proc.cpu_pct > 8 ? '#f97316' : '#60a5fa'
  const mC = proc.mem_mb > 450 ? '#f97316' : '#34d399'
  const cx = gaugeSize / 2, cy = gaugeSize / 2

  return (
    <div className={s.clCard}>
      <div className={s.clCardBar} style={{ background: color }} />
      <div className={s.clCardHead}>
        <div className={s.clCardIcon} style={{ background: color + '18', color }}>{roleIcon}</div>
        <div>
          <div className={s.clCardName}>{proc.name} ({proc.pid})</div>
          <div className={s.clCardPid}>PID {proc.pid}</div>
        </div>
        <span className={s.clCardBadge} style={{ background: statusColor + '18', color: statusColor }}>{statusLabel}</span>
      </div>
      <div className={s.clCardGauges}>
        <div className={s.miniGauge}>
          <svg viewBox={`0 0 ${gaugeSize} ${gaugeSize}`} width={gaugeSize} height={gaugeSize}>
            <circle cx={cx} cy={cy} r={gR} fill="none" stroke="var(--tc-border)" strokeWidth={gSW} />
            <circle cx={cx} cy={cy} r={gR} fill="none" stroke={cpuC} strokeWidth={gSW}
              strokeDasharray={cpuCirc} strokeDashoffset={cpuOff} strokeLinecap="round"
              style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px` }} />
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
              fill={cpuC} fontSize="10" fontWeight="600" fontFamily="'Geist Mono', monospace">
              {proc.cpu_pct.toFixed(1)}
            </text>
          </svg>
          <div className={s.miniGaugeLabel}>CPU %</div>
        </div>
        <div className={s.miniGauge}>
          <svg viewBox={`0 0 ${gaugeSize} ${gaugeSize}`} width={gaugeSize} height={gaugeSize}>
            <circle cx={cx} cy={cy} r={gR} fill="none" stroke="var(--tc-border)" strokeWidth={gSW} />
            <circle cx={cx} cy={cy} r={gR} fill="none" stroke={mC} strokeWidth={gSW}
              strokeDasharray={memCirc} strokeDashoffset={memOff} strokeLinecap="round"
              style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px` }} />
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
              fill={mC} fontSize="10" fontWeight="600" fontFamily="'Geist Mono', monospace">
              {Math.round(proc.mem_mb)}
            </text>
          </svg>
          <div className={s.miniGaugeLabel}>MEM MB</div>
        </div>
      </div>
      <dl className={s.clCardMeta}>
        <dt className={s.clCardMetaDt}>PID</dt><dd className={s.clCardMetaDd}>{proc.pid}</dd>
        <dt className={s.clCardMetaDt}>CPU</dt><dd className={s.clCardMetaDd}>{proc.cpu_pct}%</dd>
        <dt className={s.clCardMetaDt}>内存</dt><dd className={s.clCardMetaDd}>{fmtMem(proc.mem_mb)}</dd>
      </dl>
    </div>
  )
}

/* ── 主页面 ── */
export default function AdminServerMonitor() {
  const { t } = useTranslation()
  const [sys, setSys] = useState<SystemMetrics | null>(null)
  const [procs, setProcs] = useState<ProcessList | null>(null)
  const [claude, setClaude] = useState<ClaudeUsage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [killMsg, setKillMsg] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [cpuHistory, setCpuHistory] = useState<number[]>([])
  const [memHistory, setMemHistory] = useState<number[]>([])
  const [netInHistory, setNetInHistory] = useState<number[]>([])
  const [netOutHistory, setNetOutHistory] = useState<number[]>([])

  const fetchAll = useCallback(async () => {
    try {
      const [sysData, procData, claudeData] = await Promise.all([
        api.getSystemMetrics().catch(() => null),
        api.getProcesses().catch(() => null),
        api.getClaudeUsage().catch(() => null),
      ])
      if (sysData) {
        setSys(sysData)
        setCpuHistory(prev => [...prev.slice(-59), sysData.cpu.percent])
        setMemHistory(prev => [...prev.slice(-59), sysData.memory.percent])
        setNetInHistory(prev => [...prev.slice(-59), sysData.network.in_kbps ?? 0])
        setNetOutHistory(prev => [...prev.slice(-59), sysData.network.out_kbps ?? 0])
      }
      if (procData) setProcs(procData)
      if (claudeData) setClaude(claudeData)
      setError(null)
    } catch {
      setError('无法连接服务器')
    }
  }, [])

  useEffect(() => {
    fetchAll()
    timerRef.current = setInterval(fetchAll, 3000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fetchAll])

  const handleKill = useCallback(async (pid: number) => {
    try {
      const res = await api.killProcess(pid)
      setKillMsg(`已终止 ${res.name} (PID ${res.pid})`)
      fetchAll()
    } catch {
      setKillMsg(`终止 PID ${pid} 失败`)
    }
    setTimeout(() => setKillMsg(null), 3000)
  }, [fetchAll])

  const loading = sys === null && error === null

  const cpuC = cpuColor(sys?.cpu.percent ?? 0)
  const memC = memColor(sys?.memory.percent ?? 0)
  const diskC = (sys?.disk_space.percent ?? 0) > 85 ? 'var(--tc-error)' : (sys?.disk_space.percent ?? 0) > 60 ? 'var(--tc-warning)' : 'var(--tc-success)'

  // 提取 claude 进程
  const claudeProcs = useMemo(() => {
    if (!procs) return []
    const all = procs.all ?? [...procs.by_cpu, ...procs.by_mem]
    const seen = new Set<number>()
    return all.filter(p => {
      if (p.name !== 'claude' || seen.has(p.pid)) return false
      seen.add(p.pid)
      return true
    })
  }, [procs])

  // 合并去重全部进程
  const allProcs = useMemo(() => {
    if (!procs) return []
    const all = procs.all ?? [...procs.by_cpu, ...procs.by_mem]
    const seen = new Set<number>()
    return all.filter(p => { if (seen.has(p.pid)) return false; seen.add(p.pid); return true })
      .sort((a, b) => b.cpu_pct - a.cpu_pct)
  }, [procs])

  const CLAUDE_COLORS = ['#60a5fa', '#a78bfa', '#f472b6', '#34d399', '#f97316']

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
          <h1 className={styles.headerTitle}>{t('admin.server.title')}</h1>
          <span className={s.liveDot} />
        </div>
        <p className={styles.headerHint} style={{ marginBottom: 20 }}>
          {sys ? `${sys.hostname} · ${sys.platform} · 运行 ${sys.uptime_hours.toFixed(0)}h · ${sys.process_count ?? '—'} 进程 · 每 3s 刷新` : t('admin.server.hint')}
        </p>

        {error && <p style={{ color: 'var(--tc-error)', fontSize: 13, marginBottom: 16 }}>{error}</p>}
        {killMsg && <div className={s.toast}>{killMsg}</div>}

        {/* ═══ 顶部 4 Gauge ═══ */}
        <div className={s.gaugeRow}>
          {loading ? Array.from({ length: 4 }).map((_, i) => <div key={i} className={s.gaugeCard}><Skeleton variant="circle" width={64} /></div>) : sys && (
            <>
              {[
                { label: 'CPU', value: sys.cpu.percent, sub: `${sys.cpu.count_physical}C/${sys.cpu.count_logical}T`, color: cpuC, history: cpuHistory },
                { label: 'MEM', value: sys.memory.percent, sub: `${sys.memory.used_gb}/${sys.memory.total_gb} GB`, color: memC, history: memHistory },
                { label: 'DISK', value: sys.disk_space.percent ?? 0, sub: `${sys.disk_space.used_gb ?? '—'}/${sys.disk_space.total_gb ?? '—'} GB`, color: diskC, history: [] },
                { label: 'SWAP', value: sys.swap.percent, sub: `${sys.swap.used_gb}/${sys.swap.total_gb} GB`, color: 'var(--tc-foreground-secondary)', history: [] },
              ].map(g => (
                <div key={g.label} className={s.gaugeCard}>
                  <div className={s.gaugeSvgWrap}><GaugeRingSvg value={g.value} color={g.color} size={64} /></div>
                  <div className={s.gaugeInfo}>
                    <div className={s.gaugeInfoLabel}>{g.label}</div>
                    <div className={s.gaugeInfoVal} style={{ color: g.color }}>{Math.round(g.value)}%</div>
                    <div className={s.gaugeInfoSub}>{g.sub}</div>
                    {g.history.length > 1 && <div className={s.gaugeSpark}><MiniSpark data={g.history} color={g.color} /></div>}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* ═══ CPU + 内存 双栏 ═══ */}
        <div className={s.dualRow}>
          {/* CPU */}
          <div className={s.card}>
            <div className={s.cardHead}>
              <div className={s.cardTitle}>
                <div className={s.cardTitleIcon} style={{ background: '#60a5fa22', color: 'var(--tc-border-active)' }}>⚡</div>
                CPU
              </div>
              <div className={s.cardHint}>
                {sys?.cpu.load_avg ? `Load: ${sys.cpu.load_avg['1m']} / ${sys.cpu.load_avg['5m']} / ${sys.cpu.load_avg['15m']}` : ''}
              </div>
            </div>
            <div className={s.cardBody}>
              {sys ? (
                <>
                  <div className={s.heatmap}>
                    {sys.cpu.per_core.map((v, i) => {
                      const intensity = Math.min(v / 30, 1)
                      const bg = intensity < 0.05 ? 'var(--tc-border)'
                        : `rgba(${Math.round(96 + intensity * 152)},${Math.round(165 - intensity * 100)},${Math.round(250 - intensity * 130)},${(0.25 + intensity * 0.6).toFixed(2)})`
                      return <div key={i} className={s.heatCell} style={{ background: bg }} title={`C${i}: ${v}%`} />
                    })}
                  </div>
                  <div className={s.areaWrap}>
                    <AreaChart series={[cpuHistory]} colors={['#60a5fa']} w={400} h={70} />
                    <span className={s.areaOverlay}>60s</span>
                  </div>
                  <div className={s.statRow}>
                    {sys.cpu.user_pct != null && <span>User: {sys.cpu.user_pct}%</span>}
                    {sys.cpu.system_pct != null && <span>Sys: {sys.cpu.system_pct}%</span>}
                    {sys.cpu.iowait_pct != null && <span>IO: {sys.cpu.iowait_pct}%</span>}
                    {sys.cpu.ctx_switches_per_sec != null && <span>Ctx/s: {sys.cpu.ctx_switches_per_sec}</span>}
                  </div>
                </>
              ) : <Skeleton variant="text" width="100%" height={120} />}
            </div>
          </div>

          {/* 内存 */}
          <div className={s.card}>
            <div className={s.cardHead}>
              <div className={s.cardTitle}>
                <div className={s.cardTitleIcon} style={{ background: '#34d39922', color: 'var(--tc-success)' }}>▦</div>
                {t('admin.server.memory')}
              </div>
              <div className={s.cardHint}>{sys ? `${sys.memory.used_gb}/${sys.memory.total_gb} GB · ${sys.memory.avail_gb} GB 可用` : ''}</div>
            </div>
            <div className={s.cardBody}>
              {sys ? (
                <>
                  <div className={s.areaWrap}>
                    <AreaChart series={[memHistory]} colors={['#34d399']} w={400} h={70} />
                    <span className={s.areaOverlay}>60s</span>
                  </div>
                  <div className={s.memBars}>
                    {[
                      { label: 'Used', value: sys.memory.used_gb, pct: (sys.memory.used_gb / sys.memory.total_gb) * 100, color: 'var(--tc-success)' },
                      { label: 'Cached', value: sys.memory.cached_gb, pct: (sys.memory.cached_gb / sys.memory.total_gb) * 100, color: 'var(--tc-border-active)' },
                      { label: 'Buffers', value: sys.memory.buffers_gb, pct: (sys.memory.buffers_gb / sys.memory.total_gb) * 100, color: 'var(--tc-foreground-secondary)' },
                    ].map(b => (
                      <div key={b.label} className={s.memBarRow}>
                        <span className={s.memBarLabel}>{b.label}</span>
                        <div className={s.memBarTrack}><div className={s.memBarFill} style={{ width: `${b.pct}%`, background: b.color }} /></div>
                        <span className={s.memBarVal}>{b.value} GB</span>
                      </div>
                    ))}
                  </div>
                  <div className={s.statRow}>
                    <span>Free: {sys.memory.free_gb} GB</span>
                    <span>Avail: {sys.memory.avail_gb} GB</span>
                    <span>Swap: {sys.swap.used_gb}/{sys.swap.total_gb} GB</span>
                  </div>
                </>
              ) : <Skeleton variant="text" width="100%" height={120} />}
            </div>
          </div>
        </div>

        {/* ═══ 网络 + 磁盘IO + 温度 三栏 ═══ */}
        <div className={s.tripleRow}>
          {/* 网络 */}
          <div className={s.card}>
            <div className={s.cardHead}>
              <div className={s.cardTitle}>
                <div className={s.cardTitleIcon} style={{ background: '#22d3ee22', color: 'var(--tc-border-active)' }}>⇅</div>
                {t('admin.server.network')}
              </div>
              {sys?.net_interfaces?.[0] && <div className={s.cardHint}>{sys.net_interfaces[0].name}: {sys.net_interfaces[0].ip}</div>}
            </div>
            <div className={s.cardBody}>
              <div className={s.areaWrap}>
                <AreaChart
                  series={[netInHistory, netOutHistory]}
                  colors={['#34d399', '#22d3ee']}
                  w={300} h={50}
                />
              </div>
              {sys && (
                <div className={s.netStats}>
                  <div className={s.netStat}><span className={s.netStatLabel}>↓ In</span><span className={s.netStatVal} style={{ color: 'var(--tc-success)' }}>{sys.network.in_kbps?.toFixed(1) ?? '—'} KB/s</span></div>
                  <div className={s.netStat}><span className={s.netStatLabel}>↑ Out</span><span className={s.netStatVal} style={{ color: 'var(--tc-border-active)' }}>{sys.network.out_kbps?.toFixed(1) ?? '—'} KB/s</span></div>
                  <div className={s.netStat}><span className={s.netStatLabel}>Recv</span><span className={s.netStatVal}>{sys.network.recv_mb} MB</span></div>
                  <div className={s.netStat}><span className={s.netStatLabel}>Sent</span><span className={s.netStatVal}>{sys.network.sent_mb} MB</span></div>
                </div>
              )}
            </div>
          </div>

          {/* 磁盘 IO */}
          <div className={s.card}>
            <div className={s.cardHead}>
              <div className={s.cardTitle}>
                <div className={s.cardTitleIcon} style={{ background: '#f9731622', color: 'var(--tc-warning)' }}>◉</div>
                {t('admin.server.disk_io')}
              </div>
              {sys?.disk_device && <div className={s.cardHint}>{sys.disk_device}</div>}
            </div>
            <div className={s.cardBody}>
              {sys ? (
                <>
                  <div className={s.diskMetrics}>
                    <div className={s.diskMetric}><div className={s.diskMetricVal} style={{ color: 'var(--tc-success)' }}>{sys.disk_io.read_mbps?.toFixed(2) ?? '—'}</div><div className={s.diskMetricUnit}>MB/s</div><div className={s.diskMetricLabel}>Read</div></div>
                    <div className={s.diskMetric}><div className={s.diskMetricVal} style={{ color: 'var(--tc-warning)' }}>{sys.disk_io.write_mbps?.toFixed(2) ?? '—'}</div><div className={s.diskMetricUnit}>MB/s</div><div className={s.diskMetricLabel}>Write</div></div>
                    <div className={s.diskMetric}><div className={s.diskMetricVal}>{sys.disk_io.read_iops ?? '—'}</div><div className={s.diskMetricLabel}>RIOPS</div></div>
                    <div className={s.diskMetric}><div className={s.diskMetricVal}>{sys.disk_io.write_iops ?? '—'}</div><div className={s.diskMetricLabel}>WIOPS</div></div>
                  </div>
                  <div className={s.diskBarRow}>
                    <span className={s.diskBarLabel}>Util</span>
                    <div className={s.diskBarTrack}><div className={s.diskBarFill} style={{ width: `${sys.disk_io.util_pct ?? 0}%`, background: 'var(--tc-warning)' }} /></div>
                    <span className={s.diskBarLabel}>{sys.disk_io.util_pct ?? 0}%</span>
                  </div>
                </>
              ) : <Skeleton variant="text" width="80%" height={80} />}
            </div>
          </div>

          {/* 传感器 */}
          {sys && sys.sensors.temperatures.length > 0 ? (
            <div className={s.card}>
              <div className={s.cardHead}>
                <div className={s.cardTitle}>
                  <div className={s.cardTitleIcon} style={{ background: '#f8717122', color: 'var(--tc-error)' }}>🌡</div>
                  {t('admin.server.sensors')}
                </div>
              </div>
              <div className={s.cardBody}>
                {sys.sensors.temperatures.map((sensor, i) => (
                  <div key={i} className={s.sensorRow}>
                    <span className={s.sensorName}>{sensor.label}</span>
                    <span className={s.sensorVal} style={{ color: sensor.high && sensor.current > sensor.high ? 'var(--tc-error)' : undefined }}>
                      {sensor.current}°C
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className={s.card}>
              <div className={s.cardHead}>
                <div className={s.cardTitle}>🌡 {t('admin.server.sensors')}</div>
              </div>
              <div className={s.cardBody}><Skeleton variant="text" width="60%" height={60} /></div>
            </div>
          )}
        </div>

        {/* ═══ 进程总览 ═══ */}
        <div className={s.sectionLabel}>进程总览</div>
        <div className={s.card} style={{ marginBottom: 14 }}>
          <div className={s.cardHead}>
            <div className={s.cardTitle}>
              <div className={s.cardTitleIcon} style={{ background: '#fbbf2422', color: 'var(--tc-warning)' }}>▤</div>
              Top 进程
            </div>
            <div className={s.cardHint}>{allProcs.length} 进程 · 按 CPU 排序</div>
          </div>
          <div className={s.cardBody}>
            <div className={s.procGrid}>
              {allProcs.length ? allProcs.map(p => (
                <ProcessCard key={p.pid} proc={p} onKill={handleKill} />
              )) : Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className={s.pc}><Skeleton variant="text" width="100%" height={60} /></div>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ 进程拓扑 ═══ */}
        <div className={s.sectionLabel}>进程拓扑</div>
        <div className={s.card} style={{ marginBottom: 14 }}>
          <div className={s.cardHead}>
            <div className={s.cardTitle}>
              <div className={s.cardTitleIcon} style={{ background: '#a78bfa22', color: '#a78bfa' }}>⬡</div>
              进程关系图
            </div>
            <div className={s.cardHint}>双环：外环 = CPU% · 内环 = MEM · 拖拽/缩放</div>
          </div>
          <div className={s.cardBody}>
            {allProcs.length ? (
              <>
                <ProcessTopology procs={allProcs} onKill={handleKill} />
                <div className={s.topoLegend}>
                  <span><span className={s.topoLegendDot} style={{ background: '#60a5fa' }} />外环 = CPU%</span>
                  <span><span className={s.topoLegendDot} style={{ background: '#34d399' }} />内环 = MEM</span>
                  {Object.entries(PROC_PALETTE).slice(0, 5).map(([name, color]) => (
                    <span key={name}><span className={s.topoLegendDot} style={{ background: color }} />{name}</span>
                  ))}
                </div>
              </>
            ) : <Skeleton variant="text" width="100%" height={300} />}
          </div>
        </div>

        {/* ═══ Claude 详情 ═══ */}
        {claudeProcs.length > 0 && (
          <>
            <div className={s.sectionLabel}>Claude 进程详情</div>
            <div className={s.claudeCards}>
              {claudeProcs.map((p, i) => (
                <ClaudeCard key={p.pid} proc={p} color={CLAUDE_COLORS[i % CLAUDE_COLORS.length]} index={i} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
