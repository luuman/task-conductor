import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../../ui/skeleton/Skeleton'
import { api } from '../../../lib/api'
import type { SystemMetrics, ProcessList, ProcessInfo, ClaudeUsage } from '../../../lib/api/types'
import styles from '../admin.module.css'
import s from './server-monitor.module.css'

/* ── 进程名 → 固定颜色映射 ─────────────────────── */
const PROC_PALETTE = [
  '#60a5fa', // blue
  '#f97316', // orange
  '#a78bfa', // purple
  '#34d399', // green
  '#f472b6', // pink
  '#fbbf24', // amber
  '#22d3ee', // cyan
  '#e879f9', // fuchsia
  '#fb923c', // light-orange
  '#4ade80', // lime
  '#c084fc', // violet
  '#f87171', // red
]

function getProcessColor(name: string, colorMap: Map<string, string>): string {
  if (colorMap.has(name)) return colorMap.get(name)!
  const color = PROC_PALETTE[colorMap.size % PROC_PALETTE.length]
  colorMap.set(name, color)
  return color
}

/* ── 环形仪表 ─────────────────────────────────────── */
function GaugeRing({ value, label, color, sub, size = 96 }: { value: number; label: string; color: string; sub?: string; size?: number }) {
  const r = size * 0.395, stroke = size * 0.063
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(value, 100) / 100) * circ
  const cx = size / 2, cy = size / 2
  return (
    <div className={s.gauge}>
      <svg viewBox={`0 0 ${size} ${size}`} className={s.gaugeSvg} style={{ width: size, height: size }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--tc-border)" strokeWidth={stroke} />
        <circle
          cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transform: `rotate(-90deg)`, transformOrigin: `${cx}px ${cy}px`, transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text x={cx} y={cy - 4} textAnchor="middle" className={s.gaugeValue}>{Math.round(value)}%</text>
        <text x={cx} y={cy + 12} textAnchor="middle" className={s.gaugeLabel}>{label}</text>
      </svg>
      {sub && <span className={s.gaugeSub}>{sub}</span>}
    </div>
  )
}

/* ── 进度条 ───────────────────────────────────────── */
function Bar({ value, color, label, detail }: { value: number; color: string; label: string; detail?: string }) {
  return (
    <div className={s.barRow}>
      <div className={s.barMeta}>
        <span className={s.barLabel}>{label}</span>
        <span className={s.barDetail}>{detail ?? `${value.toFixed(1)}%`}</span>
      </div>
      <div className={s.barTrack}>
        <div className={s.barFill} style={{ width: `${Math.min(value, 100)}%`, background: color, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

/* ── Sparkline 迷你折线图 ────────────────────────── */
function Sparkline({ data, color, height = 40, label }: { data: number[]; color: string; height?: number; label?: string }) {
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const w = 280
  const points = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${height - (v / max) * (height - 4) - 2}`
  ).join(' ')
  return (
    <div className={s.sparkWrap}>
      {label && <span className={s.sparkLabel}>{label}</span>}
      <svg viewBox={`0 0 ${w} ${height}`} className={s.sparkSvg} preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
      </svg>
    </div>
  )
}

/* ── 进程卡片 ────────────────────────────────────── */
function ProcessCard({
  proc, color, metric, metricLabel, subMetric, subLabel, onKill
}: {
  proc: ProcessInfo
  color: string
  metric: string
  metricLabel: string
  subMetric: string
  subLabel: string
  onKill: (pid: number) => void
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className={s.procCard} style={{ borderLeftColor: color }} title={`PID ${proc.pid} · ${proc.name}\nCPU: ${proc.cpu_pct}% · MEM: ${proc.mem_mb} MB`}>
      <div className={s.procCardHeader}>
        <span className={s.procDot} style={{ background: color }} />
        <span className={s.procCardName}>{proc.name}</span>
      </div>
      <div className={s.procCardBody}>
        <span className={s.procMetricVal}>{metric}</span>
        <span className={s.procMetricSub}>{subMetric}</span>
      </div>
      <div className={s.procCardFooter}>
        {confirming ? (
          <>
            <button className={s.killConfirm} onClick={() => { onKill(proc.pid); setConfirming(false) }}>确认</button>
            <button className={s.killCancel} onClick={() => setConfirming(false)}>取消</button>
          </>
        ) : (
          <button className={s.killBtn} onClick={() => setConfirming(true)}>终止</button>
        )}
      </div>
    </div>
  )
}

/* ── 主页面 ───────────────────────────────────────── */
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

  // 稳定的颜色映射
  const colorMap = useMemo(() => new Map<string, string>(), [])

  const loading = sys === null && error === null

  const cpuColor = (sys?.cpu.percent ?? 0) > 80 ? 'var(--tc-error)' : (sys?.cpu.percent ?? 0) > 50 ? 'var(--tc-warning)' : 'var(--tc-success)'
  const memColor = (sys?.memory.percent ?? 0) > 80 ? 'var(--tc-error)' : (sys?.memory.percent ?? 0) > 50 ? 'var(--tc-warning)' : 'var(--tc-success)'
  const diskColor = (sys?.disk_space.percent ?? 0) > 85 ? 'var(--tc-error)' : (sys?.disk_space.percent ?? 0) > 60 ? 'var(--tc-warning)' : 'var(--tc-success)'

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <h1 className={styles.headerTitle}>{t('admin.server.title')}</h1>
          <p className={styles.headerHint}>
            {sys ? `${sys.hostname} · ${sys.platform} · 运行 ${sys.uptime_hours.toFixed(0)}h · ${sys.process_count ?? '—'} 进程` : t('admin.server.hint')}
          </p>
        </div>

        {error && <p style={{ color: 'var(--tc-error)', fontSize: 13, marginBottom: 16 }}>{error}</p>}
        {killMsg && <div className={s.toast}>{killMsg}</div>}

        {/* ── 顶部概览: 4个 Gauge ── */}
        <div className={s.gaugeRow}>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <div key={i} className={s.gauge}><Skeleton variant="circle" width={80} /></div>)
          ) : sys && (
            <>
              <GaugeRing value={sys.cpu.percent} label="CPU" color={cpuColor} size={80}
                sub={`${sys.cpu.count_physical}C/${sys.cpu.count_logical}T`} />
              <GaugeRing value={sys.memory.percent} label="MEM" color={memColor} size={80}
                sub={`${sys.memory.used_gb}/${sys.memory.total_gb} GB`} />
              <GaugeRing value={sys.disk_space.percent ?? 0} label="DISK" color={diskColor} size={80}
                sub={`${sys.disk_space.used_gb ?? '—'}/${sys.disk_space.total_gb ?? '—'} GB`} />
              <GaugeRing value={sys.swap.percent} label="SWAP" color="var(--tc-border-active)" size={80}
                sub={`${sys.swap.used_gb}/${sys.swap.total_gb} GB`} />
            </>
          )}
        </div>

        {/* ══════ CPU 组合卡片：左信息 + 右进程 ══════ */}
        <div className={s.dualCol}>
          <div className={s.comboCard}>
            <div className={s.comboCardHeader}>
              <div className={styles.sectionTitle}>CPU</div>
              <div className={styles.sectionHint}>
                {sys?.cpu.load_avg ? `Load: ${sys.cpu.load_avg['1m']} / ${sys.cpu.load_avg['5m']} / ${sys.cpu.load_avg['15m']}` : ''}
                {procs ? ` · ${procs.by_cpu.filter(p => p.cpu_pct > 0).length} 活跃进程` : ''}
              </div>
            </div>
            <div className={s.comboCardBody}>
              <div className={s.comboLeft}>
                <Sparkline data={cpuHistory} color={cpuColor} height={48} />
                {sys && (
                  <>
                    <div className={s.coreGrid}>
                      {sys.cpu.per_core.map((v, i) => (
                        <Bar key={i} value={v} color={v > 80 ? 'var(--tc-error)' : 'var(--tc-success)'} label={`C${i}`} />
                      ))}
                    </div>
                    {sys.cpu.user_pct != null && (
                      <div className={s.statRow}>
                        <span className={s.statItem}>User: {sys.cpu.user_pct}%</span>
                        <span className={s.statItem}>Sys: {sys.cpu.system_pct}%</span>
                        <span className={s.statItem}>IO: {sys.cpu.iowait_pct}%</span>
                        {sys.cpu.ctx_switches_per_sec != null && <span className={s.statItem}>Ctx/s: {sys.cpu.ctx_switches_per_sec}</span>}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className={s.comboRight}>
                {procs ? procs.by_cpu.map((p) => (
                  <ProcessCard key={p.pid} proc={p} color={getProcessColor(p.name, colorMap)}
                    metric={`${p.cpu_pct}%`} metricLabel="CPU" subMetric={`${p.mem_mb}MB`} subLabel="MEM" onKill={handleKill} />
                )) : Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className={s.procCard}><Skeleton variant="text" width="100%" height={40} /></div>
                ))}
              </div>
            </div>
          </div>

          {/* ══════ 内存 组合卡片 ══════ */}
          <div className={s.comboCard}>
            <div className={s.comboCardHeader}>
              <div className={styles.sectionTitle}>{t('admin.server.memory')}</div>
              <div className={styles.sectionHint}>
                {sys ? `${sys.memory.used_gb}/${sys.memory.total_gb} GB · ${sys.memory.avail_gb} GB 可用` : ''}
              </div>
            </div>
            <div className={s.comboCardBody}>
              <div className={s.comboLeft}>
                <Sparkline data={memHistory} color={memColor} height={48} />
                {sys && (
                  <>
                    <Bar value={(sys.memory.used_gb / sys.memory.total_gb) * 100} color={memColor} label="Used" detail={`${sys.memory.used_gb} GB`} />
                    <Bar value={(sys.memory.cached_gb / sys.memory.total_gb) * 100} color="var(--tc-border-active)" label="Cached" detail={`${sys.memory.cached_gb} GB`} />
                    <Bar value={(sys.memory.buffers_gb / sys.memory.total_gb) * 100} color="var(--tc-foreground-secondary)" label="Buffers" detail={`${sys.memory.buffers_gb} GB`} />
                    <div className={s.statRow}>
                      <span className={s.statItem}>Free: {sys.memory.free_gb} GB</span>
                      <span className={s.statItem}>Avail: {sys.memory.avail_gb} GB</span>
                    </div>
                  </>
                )}
              </div>
              <div className={s.comboRight}>
                {procs ? procs.by_mem.map((p) => (
                  <ProcessCard key={p.pid} proc={p} color={getProcessColor(p.name, colorMap)}
                    metric={`${p.mem_mb}MB`} metricLabel="MEM" subMetric={`${p.cpu_pct}%`} subLabel="CPU" onKill={handleKill} />
                )) : Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className={s.procCard}><Skeleton variant="text" width="100%" height={40} /></div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ══════ 下方卡片: 网络 / 磁盘IO / 传感器 / Claude ══════ */}
        <div className={styles.cardGrid}>
          {/* 网络 */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>{t('admin.server.network')}</div>
              {sys?.net_interfaces?.[0] && <div className={styles.sectionHint}>{sys.net_interfaces[0].name}: {sys.net_interfaces[0].ip}</div>}
            </div>
            <div className={styles.sectionBody}>
              <Sparkline data={netInHistory} color="var(--tc-success)" height={32} label="↓ In" />
              <Sparkline data={netOutHistory} color="var(--tc-border-active)" height={32} label="↑ Out" />
              {sys && (
                <div className={s.statRow}>
                  <span className={s.statItem}>↓ {sys.network.in_kbps?.toFixed(1) ?? '—'} KB/s</span>
                  <span className={s.statItem}>↑ {sys.network.out_kbps?.toFixed(1) ?? '—'} KB/s</span>
                  <span className={s.statItem}>Recv: {sys.network.recv_mb} MB</span>
                  <span className={s.statItem}>Sent: {sys.network.sent_mb} MB</span>
                </div>
              )}
              {sys?.network.tcp_states && Object.keys(sys.network.tcp_states).length > 0 && (
                <div className={s.tagGrid}>
                  {Object.entries(sys.network.tcp_states).map(([state, cnt]) => (
                    <span key={state} className={s.tag}>{state}: {cnt}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 磁盘 IO */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>{t('admin.server.disk_io')}</div>
              {sys?.disk_device && <div className={styles.sectionHint}>{sys.disk_device}</div>}
            </div>
            <div className={styles.sectionBody}>
              {sys ? (
                <>
                  <div className={s.statRow}>
                    <span className={s.statItem}>Read: {sys.disk_io.read_mbps?.toFixed(2) ?? '—'} MB/s</span>
                    <span className={s.statItem}>Write: {sys.disk_io.write_mbps?.toFixed(2) ?? '—'} MB/s</span>
                  </div>
                  <div className={s.statRow}>
                    <span className={s.statItem}>RIOPS: {sys.disk_io.read_iops ?? '—'}</span>
                    <span className={s.statItem}>WIOPS: {sys.disk_io.write_iops ?? '—'}</span>
                    <span className={s.statItem}>Util: {sys.disk_io.util_pct ?? '—'}%</span>
                  </div>
                </>
              ) : <Skeleton variant="text" width="80%" height={40} />}
            </div>
          </div>

          {/* 温度传感器 */}
          {sys && sys.sensors.temperatures.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionTitle}>{t('admin.server.sensors')}</div>
              </div>
              <div className={styles.sectionBody}>
                {sys.sensors.temperatures.map((sensor, i) => (
                  <div key={i} className={styles.formRow}>
                    <span className={styles.perfLabel}>{sensor.label}</span>
                    <span className={styles.perfValue} style={{ color: sensor.high && sensor.current > sensor.high ? 'var(--tc-error)' : undefined }}>
                      {sensor.current}°C
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Claude 进程 */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>{t('admin.server.claude_processes')}</div>
              {claude && <div className={styles.sectionHint}>{claude.sessions.active} 活跃 / {claude.sessions.total} 总计</div>}
            </div>
            <div className={styles.sectionBody}>
              {claude ? (
                <>
                  <div className={s.statRow}>
                    <span className={s.statItem}>活跃进程: {(claude.performance as Record<string, number>).active_processes ?? 0}</span>
                    <span className={s.statItem}>调用次数: {(claude.performance as Record<string, number>).call_count ?? 0}</span>
                  </div>
                  {claude.recent_tools.length > 0 && (
                    <div className={s.tagGrid}>
                      {claude.recent_tools.slice(0, 8).map((tool, i) => (
                        <span key={i} className={s.tag}>
                          {(tool as Record<string, string>).tool_name ?? '?'}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : <Skeleton variant="text" width="60%" height={20} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
