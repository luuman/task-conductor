import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../../ui/skeleton/Skeleton'
import { api } from '../../../lib/api'
import type { SystemMetrics, ProcessList, ClaudeUsage } from '../../../lib/api/types'
import styles from '../admin.module.css'
import monStyles from './server-monitor.module.css'

/* ── 环形仪表 ─────────────────────────────────────── */
function GaugeRing({ value, label, color, sub }: { value: number; label: string; color: string; sub?: string }) {
  const r = 38, stroke = 6
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(value, 100) / 100) * circ
  return (
    <div className={monStyles.gauge}>
      <svg viewBox="0 0 96 96" className={monStyles.gaugeSvg}>
        <circle cx="48" cy="48" r={r} fill="none" stroke="var(--tc-border)" strokeWidth={stroke} />
        <circle
          cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transform: 'rotate(-90deg)', transformOrigin: '48px 48px', transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text x="48" y="44" textAnchor="middle" className={monStyles.gaugeValue}>{Math.round(value)}%</text>
        <text x="48" y="58" textAnchor="middle" className={monStyles.gaugeLabel}>{label}</text>
      </svg>
      {sub && <span className={monStyles.gaugeSub}>{sub}</span>}
    </div>
  )
}

/* ── 进度条 ───────────────────────────────────────── */
function Bar({ value, color, label, detail }: { value: number; color: string; label: string; detail?: string }) {
  return (
    <div className={monStyles.barRow}>
      <div className={monStyles.barMeta}>
        <span className={monStyles.barLabel}>{label}</span>
        <span className={monStyles.barDetail}>{detail ?? `${value.toFixed(1)}%`}</span>
      </div>
      <div className={monStyles.barTrack}>
        <div className={monStyles.barFill} style={{ width: `${Math.min(value, 100)}%`, background: color, transition: 'width 0.6s ease' }} />
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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 历史记录（最近 60 个采样点）
  const [cpuHistory, setCpuHistory] = useState<number[]>([])
  const [memHistory, setMemHistory] = useState<number[]>([])
  const [netInHistory, setNetInHistory] = useState<number[]>([])
  const [netOutHistory, setNetOutHistory] = useState<number[]>([])

  const fetchAll = useCallback(async () => {
    try {
      const [s, p, c] = await Promise.all([
        api.getSystemMetrics().catch(() => null),
        api.getProcesses().catch(() => null),
        api.getClaudeUsage().catch(() => null),
      ])
      if (s) {
        setSys(s)
        setCpuHistory(prev => [...prev.slice(-59), s.cpu.percent])
        setMemHistory(prev => [...prev.slice(-59), s.memory.percent])
        setNetInHistory(prev => [...prev.slice(-59), s.network.in_kbps ?? 0])
        setNetOutHistory(prev => [...prev.slice(-59), s.network.out_kbps ?? 0])
      }
      if (p) setProcs(p)
      if (c) setClaude(c)
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

  const loading = sys === null && error === null

  // 颜色阈值
  const cpuColor = (sys?.cpu.percent ?? 0) > 80 ? 'var(--tc-error)' : (sys?.cpu.percent ?? 0) > 50 ? 'var(--tc-warning)' : 'var(--tc-success)'
  const memColor = (sys?.memory.percent ?? 0) > 80 ? 'var(--tc-error)' : (sys?.memory.percent ?? 0) > 50 ? 'var(--tc-warning)' : 'var(--tc-success)'
  const diskColor = (sys?.disk_space.percent ?? 0) > 85 ? 'var(--tc-error)' : (sys?.disk_space.percent ?? 0) > 60 ? 'var(--tc-warning)' : 'var(--tc-success)'

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.headerTitle}>{t('admin.server.title')}</h1>
          <p className={styles.headerHint}>
            {sys ? `${sys.hostname} · ${sys.platform} · 运行 ${sys.uptime_hours.toFixed(0)}h · ${sys.process_count ?? '—'} 进程` : t('admin.server.hint')}
          </p>
        </div>

        {error && <p style={{ color: 'var(--tc-error)', fontSize: 13, marginBottom: 16 }}>{error}</p>}

        {/* ── 环形仪表区 ── */}
        <div className={monStyles.gaugeRow}>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={monStyles.gauge}>
                <Skeleton variant="circle" width={96} />
              </div>
            ))
          ) : sys && (
            <>
              <GaugeRing value={sys.cpu.percent} label="CPU" color={cpuColor}
                sub={`${sys.cpu.count_physical}C/${sys.cpu.count_logical}T${sys.cpu.freq_mhz ? ` · ${sys.cpu.freq_mhz}MHz` : ''}`} />
              <GaugeRing value={sys.memory.percent} label="MEM" color={memColor}
                sub={`${sys.memory.used_gb}/${sys.memory.total_gb} GB`} />
              <GaugeRing value={sys.disk_space.percent ?? 0} label="DISK" color={diskColor}
                sub={`${sys.disk_space.used_gb ?? '—'}/${sys.disk_space.total_gb ?? '—'} GB`} />
              <GaugeRing value={sys.swap.percent} label="SWAP" color="var(--tc-border-active)"
                sub={`${sys.swap.used_gb}/${sys.swap.total_gb} GB`} />
            </>
          )}
        </div>

        {/* ── Sparkline + 详细区 ── */}
        <div className={styles.cardGrid}>
          {/* CPU 详情 */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>CPU</div>
              {sys?.cpu.load_avg && <div className={styles.sectionHint}>Load: {sys.cpu.load_avg['1m']} / {sys.cpu.load_avg['5m']} / {sys.cpu.load_avg['15m']}</div>}
            </div>
            <div className={styles.sectionBody}>
              <Sparkline data={cpuHistory} color={cpuColor} height={48} />
              {sys && (
                <>
                  <div className={monStyles.coreGrid}>
                    {sys.cpu.per_core.map((v, i) => (
                      <Bar key={i} value={v} color={v > 80 ? 'var(--tc-error)' : 'var(--tc-success)'} label={`Core ${i}`} />
                    ))}
                  </div>
                  {sys.cpu.user_pct != null && (
                    <div className={monStyles.statRow}>
                      <span className={monStyles.statItem}>User: {sys.cpu.user_pct}%</span>
                      <span className={monStyles.statItem}>Sys: {sys.cpu.system_pct}%</span>
                      <span className={monStyles.statItem}>IO Wait: {sys.cpu.iowait_pct}%</span>
                      {sys.cpu.ctx_switches_per_sec != null && <span className={monStyles.statItem}>Ctx/s: {sys.cpu.ctx_switches_per_sec}</span>}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 内存详情 */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>{t('admin.server.memory')}</div>
            </div>
            <div className={styles.sectionBody}>
              <Sparkline data={memHistory} color={memColor} height={48} />
              {sys && (
                <>
                  <Bar value={(sys.memory.used_gb / sys.memory.total_gb) * 100} color={memColor} label="Used" detail={`${sys.memory.used_gb} GB`} />
                  <Bar value={(sys.memory.cached_gb / sys.memory.total_gb) * 100} color="var(--tc-border-active)" label="Cached" detail={`${sys.memory.cached_gb} GB`} />
                  <Bar value={(sys.memory.buffers_gb / sys.memory.total_gb) * 100} color="var(--tc-foreground-secondary)" label="Buffers" detail={`${sys.memory.buffers_gb} GB`} />
                  <div className={monStyles.statRow}>
                    <span className={monStyles.statItem}>Free: {sys.memory.free_gb} GB</span>
                    <span className={monStyles.statItem}>Available: {sys.memory.avail_gb} GB</span>
                  </div>
                </>
              )}
            </div>
          </div>

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
                <div className={monStyles.statRow}>
                  <span className={monStyles.statItem}>↓ {sys.network.in_kbps?.toFixed(1) ?? '—'} KB/s</span>
                  <span className={monStyles.statItem}>↑ {sys.network.out_kbps?.toFixed(1) ?? '—'} KB/s</span>
                  <span className={monStyles.statItem}>Recv: {sys.network.recv_mb} MB</span>
                  <span className={monStyles.statItem}>Sent: {sys.network.sent_mb} MB</span>
                </div>
              )}
              {sys?.network.tcp_states && Object.keys(sys.network.tcp_states).length > 0 && (
                <div className={monStyles.tagGrid}>
                  {Object.entries(sys.network.tcp_states).map(([state, cnt]) => (
                    <span key={state} className={monStyles.tag}>{state}: {cnt}</span>
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
                  <div className={monStyles.statRow}>
                    <span className={monStyles.statItem}>Read: {sys.disk_io.read_mbps?.toFixed(2) ?? '—'} MB/s</span>
                    <span className={monStyles.statItem}>Write: {sys.disk_io.write_mbps?.toFixed(2) ?? '—'} MB/s</span>
                  </div>
                  <div className={monStyles.statRow}>
                    <span className={monStyles.statItem}>RIOPS: {sys.disk_io.read_iops ?? '—'}</span>
                    <span className={monStyles.statItem}>WIOPS: {sys.disk_io.write_iops ?? '—'}</span>
                    <span className={monStyles.statItem}>Util: {sys.disk_io.util_pct ?? '—'}%</span>
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
                {sys.sensors.temperatures.map((s, i) => (
                  <div key={i} className={styles.formRow}>
                    <span className={styles.perfLabel}>{s.label}</span>
                    <span className={styles.perfValue} style={{ color: s.high && s.current > s.high ? 'var(--tc-error)' : undefined }}>
                      {s.current}°C
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
                  <div className={monStyles.statRow}>
                    <span className={monStyles.statItem}>活跃进程: {(claude.performance as Record<string, number>).active_processes ?? 0}</span>
                    <span className={monStyles.statItem}>调用次数: {(claude.performance as Record<string, number>).call_count ?? 0}</span>
                  </div>
                  {claude.recent_tools.length > 0 && (
                    <div className={monStyles.tagGrid}>
                      {claude.recent_tools.slice(0, 8).map((tool, i) => (
                        <span key={i} className={monStyles.tag}>
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

        {/* ── 进程列表 ── */}
        <div className={styles.cardGrid}>
          {/* Top CPU */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>{t('admin.server.top_cpu')}</div>
            </div>
            <div>
              {procs ? procs.by_cpu.map((p, i) => (
                <div key={i} className={styles.listItem}>
                  <span className={monStyles.pid}>{p.pid}</span>
                  <div className={styles.listItemContent}>
                    <span className={monStyles.procName}>{p.name}</span>
                  </div>
                  <div className={styles.listItemRight}>
                    <span className={monStyles.procVal}>{p.cpu_pct}%</span>
                    <span className={monStyles.procSub}>{p.mem_mb} MB</span>
                  </div>
                </div>
              )) : Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={styles.listItem}>
                  <Skeleton variant="text" width="100%" height={16} />
                </div>
              ))}
            </div>
          </div>

          {/* Top Memory */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>{t('admin.server.top_mem')}</div>
            </div>
            <div>
              {procs ? procs.by_mem.map((p, i) => (
                <div key={i} className={styles.listItem}>
                  <span className={monStyles.pid}>{p.pid}</span>
                  <div className={styles.listItemContent}>
                    <span className={monStyles.procName}>{p.name}</span>
                  </div>
                  <div className={styles.listItemRight}>
                    <span className={monStyles.procVal}>{p.mem_mb} MB</span>
                    <span className={monStyles.procSub}>{p.cpu_pct}%</span>
                  </div>
                </div>
              )) : Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={styles.listItem}>
                  <Skeleton variant="text" width="100%" height={16} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Sparkline 迷你折线图 ─────────────────────────── */
function Sparkline({ data, color, height = 40, label }: { data: number[]; color: string; height?: number; label?: string }) {
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const w = 280
  const points = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${height - (v / max) * (height - 4) - 2}`
  ).join(' ')

  return (
    <div className={monStyles.sparkWrap}>
      {label && <span className={monStyles.sparkLabel}>{label}</span>}
      <svg viewBox={`0 0 ${w} ${height}`} className={monStyles.sparkSvg} preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
      </svg>
    </div>
  )
}
