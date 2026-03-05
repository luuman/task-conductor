// frontend/src/pages/Dashboard.tsx
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Star, Activity, Zap, Shield, Fan, HardDrive, Globe, Cpu } from "lucide-react";
import { api, type Project, type Task, type Metrics, type SystemMetrics, type ClaudeUsageMetrics, type ProcessInfo } from "../lib/api";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { KnowledgePanel } from "../components/KnowledgePanel";
import { cn } from "../lib/utils";

interface DashboardProps {
  projectId: number | null;
  projects: Project[];
  projectsLoaded: boolean;
  onOpenTask: (id: number) => void;
  onSelectProject: (id: number) => void;
  liveEvents?: unknown[];
  wsStatus?: unknown;
}

// ── 工具函数 ─────────────────────────────────────────────────────

function useAutoRefresh<T>(fetcher: () => Promise<T>, intervalMs = 4000) {
  const [data, setData] = useState<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refresh = async () => { try { setData(await fetcher()); } catch { /* ignore */ } };
  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, intervalMs);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);
  return data;
}

function fmtGb(gb: number | null | undefined) {
  if (gb == null) return "—";
  return gb >= 1 ? `${gb} GB` : `${Math.round(gb * 1024)} MB`;
}
function fmtUptime(h: number) {
  if (h < 1) return `${Math.round(h * 60)} 分钟`;
  if (h < 24) return `${h.toFixed(1)} h`;
  return `${Math.floor(h / 24)} 天 ${(h % 24).toFixed(0)} h`;
}
function fmtKbps(k: number | null) {
  if (k == null) return "—";
  if (k >= 1024 * 1024) return `${(k / 1024 / 1024).toFixed(2)} GB/s`;
  if (k >= 1024) return `${(k / 1024).toFixed(1)} MB/s`;
  return `${k.toFixed(0)} KB/s`;
}
function fmtMbps(m: number | null) {
  if (m == null) return "—";
  if (m >= 1024) return `${(m / 1024).toFixed(2)} GB/s`;
  return `${m.toFixed(2)} MB/s`;
}
function fmtSentRecv(mb: number | null) {
  if (mb == null) return "—";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

// ── iStatMenus 7 风格组件 ─────────────────────────────────────

interface HistPt {
  cpu: number; cpu_user: number; cpu_sys: number; cpu_iowait: number;
  disk_r: number; disk_w: number;
  net_in: number; net_out: number;
  mem: number;
}
const ZERO_PT: HistPt = { cpu:0, cpu_user:0, cpu_sys:0, cpu_iowait:0, disk_r:0, disk_w:0, net_in:0, net_out:0, mem:0 };
const HIST_LEN = 60;

// iOS 系统精确配色（来自 iStatMenus）
const CC  = "#007AFF";   // iOS 蓝   — 用户 / 读取 / 下载
const CR  = "#FF2D55";   // iOS 粉红 — 系统 / 写入 / 上传
const CP  = "#BF5AF2";   // iOS 紫   — IO Wait / 缓存
const CO  = "#FF9F0A";   // iOS 橙   — Buffers / 告警
const CGR = "#34C759";   // iOS 绿   — 空闲 / 已建立
const CV_PINK = "#FF2D55"; // = CR，v2 左侧（读/上传）
const CV_BLUE = "#007AFF"; // = CC，v2 右侧（写/下载）

/** 滚动柱状图（无网格线，1-3 层叠加） */
function Sparkline({
  pts, getA, getB, getC,
  colorA = CC, colorB = CR, colorC = CP, h = 40,
}: {
  pts: HistPt[];
  getA: (p: HistPt) => number;
  getB?: (p: HistPt) => number;
  getC?: (p: HistPt) => number;
  colorA?: string; colorB?: string; colorC?: string; h?: number;
}) {
  const padded = [...Array(Math.max(0, HIST_LEN - pts.length)).fill(ZERO_PT), ...pts.slice(-HIST_LEN)];
  const maxVal = Math.max(...padded.map(p =>
    getA(p) + (getB ? getB(p) : 0) + (getC ? getC(p) : 0)
  ), 0.001);
  const bW = 2, gap = 1, W = HIST_LEN * (bW + gap) - gap;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" className="block">
      {padded.map((p, i) => {
        const x  = i * (bW + gap);
        const aH = Math.max(0, (getA(p) / maxVal) * h);
        const bH = getB ? Math.max(0, (getB(p) / maxVal) * h) : 0;
        const cH = getC ? Math.max(0, (getC(p) / maxVal) * h) : 0;
        return (
          <g key={i}>
            {cH > 0 && <rect x={x} y={h - aH - bH - cH} width={bW} height={cH} fill={colorC} />}
            {bH > 0 && <rect x={x} y={h - aH - bH}       width={bW} height={bH} fill={colorB} />}
            {aH > 0 && <rect x={x} y={h - aH}             width={bW} height={aH} fill={colorA} />}
          </g>
        );
      })}
    </svg>
  );
}

/** iStatMenus 风格双向柱状图 — 从中心线向上/向下各一色 */
function DualSparkline({
  pts, getTop, getBottom,
  colorTop = CR, colorBottom = CC, h = 50,
}: {
  pts: HistPt[];
  getTop:    (p: HistPt) => number;
  getBottom: (p: HistPt) => number;
  colorTop?: string; colorBottom?: string; h?: number;
}) {
  const padded = [...Array(Math.max(0, HIST_LEN - pts.length)).fill(ZERO_PT), ...pts.slice(-HIST_LEN)];
  const maxVal = Math.max(...padded.map(p => Math.max(getTop(p), getBottom(p))), 0.001);
  const bW = 2, gap = 1, W = HIST_LEN * (bW + gap) - gap;
  const mid = h / 2;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" className="block">
      {/* 中心分隔线 */}
      <line x1="0" y1={mid} x2={W} y2={mid} stroke="#2a2a2a" strokeWidth="0.5" />
      {padded.map((p, i) => {
        const x    = i * (bW + gap);
        const topH = Math.max(0, (getTop(p)    / maxVal) * (mid - 1));
        const botH = Math.max(0, (getBottom(p) / maxVal) * (mid - 1));
        return (
          <g key={i}>
            {topH > 0 && (
              <rect x={x} y={mid - topH} width={bW} height={topH} fill={colorTop}    fillOpacity={0.9} />
            )}
            {botH > 0 && (
              <rect x={x} y={mid + 1}    width={bW} height={botH} fill={colorBottom} fillOpacity={0.9} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** 大号环形仪表（带 framer-motion 动画 + 发光效果） */
function RingGauge({ pct, color = CC, label, size = 96, valueText }: {
  pct: number; color?: string; label: string; size?: number; valueText?: string;
}) {
  const sw     = 6;
  const r      = (size - sw - 2) / 2;
  const c      = size / 2;
  const circ   = 2 * Math.PI * r;
  const offset = circ - (circ * Math.max(0, Math.min(100, pct)) / 100);
  return (
    <div className="relative flex items-center justify-center shrink-0"
         style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute"
           style={{ transform: "rotate(-90deg)", overflow: "visible" }}>
        {/* 背景轨道 */}
        <circle cx={c} cy={c} r={r} fill="none" stroke="#222222" strokeWidth={sw} />
        {/* 动画弧 — framer-motion */}
        <motion.circle
          cx={c} cy={c} r={r} fill="none"
          stroke={color} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "circOut" }}
          style={{}}
        />
      </svg>
      <div className="flex flex-col items-center justify-center" style={{ zIndex: 1 }}>
        <span className="font-bold font-mono leading-none text-white"
              style={{ fontSize: size / 4.6 }}>
          {valueText ?? `${Math.round(pct)}%`}
        </span>
        <span className="font-mono" style={{ fontSize: size / 7.5, color: "#8a8a8e" }}>
          {label}
        </span>
      </div>
    </div>
  );
}

/** label + 横向进度条 + value */
function MRow({ label, pct, value, color, max = 100 }: {
  label: string; pct: number | null; value: string; color: string; max?: number;
}) {
  const w = pct != null ? Math.min(100, (pct / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-[9px] font-mono shrink-0" style={{ color: "#8a8a8e" }}>{label}</span>
      <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: "#1a1a1a" }}>
        <div className="h-full rounded-full transition-all duration-700"
             style={{ width: `${w}%`, background: color }} />
      </div>
      <span className="w-9 text-right text-[9px] font-mono tabular-nums shrink-0" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

/** 内存图例行：色点 + label + GB */
function MemRow({ color, label, gb }: { color: string; label: string; gb: number }) {
  const s = gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(gb * 1024)} MB`;
  return (
    <div className="flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="flex-1 text-[10px]" style={{ color: "#8a8a8e" }}>{label}</span>
      <span className="text-[10px] font-mono tabular-nums text-white">{s}</span>
    </div>
  );
}

/** iStatMenus 卡片 — Orion 风格 */
function ICard({ title, children, right }: {
  title: string; children: React.ReactNode; right?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl flex flex-col overflow-hidden relative"
         style={{
           background: "#0b0b18",
           border: "1px solid #1e2038",
           boxShadow: "0 4px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.03)",
         }}>
      {/* Orion 顶部 accent 渐变线 */}
      <div className="absolute top-0 left-0 right-0"
           style={{ height: 1, background: "linear-gradient(90deg,var(--accent,#4477ff) 0%,transparent 55%)" }} />
      <div className="flex items-center justify-between px-4 py-3"
           style={{ borderBottom: "1px solid #16162a" }}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: "var(--accent,#4477ff)" }}>{title}</span>
        {right}
      </div>
      <div className="flex-1 px-4 py-3 space-y-3">{children}</div>
    </div>
  );
}

// ── iStatMenus V3 手机界面还原 ────────────────────────────────────


/** 进程行（iStatMenus 风格） */
function PhoneProc({ name, value, valueColor = CC }: { name: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center gap-2 py-[3px]">
      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
           style={{ background: "#1a1a1a" }}>
        <span className="text-[7px] font-mono" style={{ color: "#636366" }}>
          {name.slice(0, 1).toUpperCase()}
        </span>
      </div>
      <span className="flex-1 text-xs truncate" style={{ color: "#d1d5db" }}>{name}</span>
      <span className="text-xs font-mono tabular-nums" style={{ color: valueColor }}>{value}</span>
    </div>
  );
}

function IStatV3Cards({ sys, hist, procs }: {
  sys:   SystemMetrics | null;
  hist:  HistPt[];
  procs: { by_cpu: ProcessInfo[]; by_mem: ProcessInfo[] } | null;
}) {
  const cpuProcs = procs?.by_cpu.slice(0, 3) ?? [];
  const memProcs = procs?.by_mem.slice(0, 3) ?? [];

  const temps   = sys?.sensors?.temperatures ?? [];
  const fans    = sys?.sensors?.fans ?? [];
  const cpuTemp = temps.find(t =>
    t.sensor.toLowerCase().includes("coretemp") ||
    t.sensor.toLowerCase().includes("k10temp")  ||
    t.label.toLowerCase().includes("tdie")) ?? temps[0] ?? null;
  const nvmeTemp  = temps.find(t => t.sensor.toLowerCase().includes("nvme")) ?? null;
  const boardTemp = temps.find(t => t.sensor.toLowerCase().includes("acpitz")) ?? null;
  const coreTemps = temps.filter(t =>
    t.sensor.toLowerCase().includes("coretemp") && t.label.toLowerCase().startsWith("core "));
  const coreMax = coreTemps.length > 0 ? Math.max(...coreTemps.map(t => t.current)) : null;
  const coreAvg = coreTemps.length > 0
    ? Math.round(coreTemps.reduce((s, t) => s + t.current, 0) / coreTemps.length)
    : null;
  const fanInfo  = fans[0] ?? null;
  const tColor   = (v: number) => v >= 90 ? CR : v >= 70 ? CO : CC;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">

      {/* ══ CPU ══════════════════════════════════════════ */}
      <ICard title="CPU"
        right={
          <span className="text-xs font-mono text-white">
            {cpuTemp ? `${cpuTemp.current}°` : "—"}
          </span>
        }
      >
        {/* 双向柱状图 */}
        <div className="rounded-sm overflow-hidden" style={{ background: "#111", height: 50 }}>
          <DualSparkline pts={hist}
            getTop={p => p.cpu_user} getBottom={p => p.cpu_sys}
            colorTop={CR} colorBottom={CC} h={50} />
        </div>

        {/* 用户 / 系统 */}
        <div className="flex justify-between text-[10px] font-medium">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: CC }} />
            <span className="text-gray-400">用户</span>
            <span className="text-white ml-1">{(sys?.cpu.user_pct ?? 0).toFixed(1)}%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: CR }} />
            <span className="text-gray-400">系统</span>
            <span className="text-white ml-1">{(sys?.cpu.system_pct ?? 0).toFixed(1)}%</span>
          </div>
        </div>

        {/* 核心格子 — clipPath 样式 */}
        {sys?.cpu.per_core && sys.cpu.per_core.length > 0 && (
          <div className="grid gap-1.5 py-1"
               style={{ gridTemplateColumns: `repeat(${Math.min(sys.cpu.per_core.length, 8)}, 1fr)` }}>
            {sys.cpu.per_core.map((pct, i) => {
              const c = pct >= 80 ? CR : pct >= 45 ? CO : CC;
              return (
                <div key={i} className="flex flex-col items-center">
                  <div className="w-6 h-6 rounded-full border border-gray-800 relative flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full"
                         style={{ border: `2px solid ${c}`, clipPath: `inset(${100 - pct}% 0 0 0)` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 能效核心 / 性能核心 */}
        {sys?.cpu.count_logical && (
          <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 6 }} className="space-y-1">
            <div className="flex justify-between text-[10px] font-medium">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ background: CR }} />
                <span className="text-gray-400">能效核心</span>
              </div>
              <span className="text-white">{sys.cpu.count_logical}</span>
            </div>
            <div className="flex justify-between text-[10px] font-medium">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ background: CC }} />
                <span className="text-gray-400">性能核心</span>
              </div>
              <span className="text-white">
                {sys.cpu.freq_mhz ? `${(sys.cpu.freq_mhz / 1000).toFixed(2)} GHz` : "—"}
              </span>
            </div>
          </div>
        )}

        {/* 进程列表 */}
        {cpuProcs.length > 0 && (
          <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 6 }} className="space-y-1">
            <div className="text-xs font-medium mb-1" style={{ color: CC }}>进程</div>
            {cpuProcs.map(p => (
              <PhoneProc key={p.pid} name={p.name} value={`${p.cpu_pct}%`} valueColor={CC} />
            ))}
          </div>
        )}

        {/* 开机时间 */}
        {sys && (
          <div className="flex justify-between items-center text-[11px] font-medium uppercase tracking-wider"
               style={{ borderTop: "1px solid #1a1a1a", paddingTop: 8, color: "#636366" }}>
            <span style={{ color: CC }}>电脑开启时间</span>
            <span className="text-white">
              {sys.uptime_hours >= 24
                ? `${Math.floor(sys.uptime_hours / 24)} 天 ${(sys.uptime_hours % 24).toFixed(0)} 小时`
                : `${sys.uptime_hours.toFixed(1)} 小时`}
            </span>
          </div>
        )}
      </ICard>

      {/* ══ MEMORY ═══════════════════════════════════════ */}
      <ICard title="内存">
        {/* 双环 */}
        <div className="flex justify-between items-center px-2">
          <RingGauge pct={sys?.memory.percent ?? 0} label="内存" color={CR} size={110} />
          {(sys?.swap.total_gb ?? 0) > 0.1
            ? <RingGauge pct={sys?.swap.percent ?? 0} label="交换" color={CC} size={110} />
            : <RingGauge pct={sys?.memory.percent ?? 0} label="压力" color={CC} size={110} />
          }
        </div>

        {/* 内存分项 */}
        <div className="space-y-1">
          {[
            { label: "App 内存", gb: sys?.memory.used_gb    ?? 0, color: CC  },
            { label: "联动内存", gb: sys?.memory.buffers_gb ?? 0, color: CR  },
            { label: "已压缩",   gb: sys?.memory.cached_gb  ?? 0, color: CO  },
            { label: "可用",     gb: sys?.memory.free_gb    ?? 0, color: "#6b7280" },
          ].filter(r => r.gb > 0.01).map((r, i) => (
            <div key={i} className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
                <span className="text-gray-300">{r.label}</span>
              </div>
              <span className="text-white font-mono">
                {r.gb >= 1 ? `${r.gb.toFixed(1)} GB` : `${Math.round(r.gb * 1024)} MB`}
              </span>
            </div>
          ))}
        </div>

        {/* 进程列表 */}
        {memProcs.length > 0 && (
          <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 6 }} className="space-y-1">
            <div className="text-xs font-medium mb-1" style={{ color: CC }}>进程</div>
            {memProcs.map(p => (
              <PhoneProc key={p.pid} name={p.name}
                value={p.mem_mb >= 1024 ? `${(p.mem_mb / 1024).toFixed(1)} G` : `${Math.round(p.mem_mb)} M`}
                valueColor={CR} />
            ))}
          </div>
        )}
      </ICard>

      {/* ══ DISK ═════════════════════════════════════════ */}
      <ICard title="磁盘">
        {/* 磁盘信息卡片 */}
        <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-800"
             style={{ background: "rgba(17,17,17,0.5)" }}>
          <div className="relative flex items-center justify-center shrink-0" style={{ width: 40, height: 40 }}>
            <svg width={40} height={40} className="absolute" style={{ transform: "rotate(-90deg)" }}>
              <circle cx={20} cy={20} r={16} fill="none" stroke="#222" strokeWidth={3} />
              <circle cx={20} cy={20} r={16} fill="none" stroke={CR} strokeWidth={3}
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 16}`}
                      strokeDashoffset={`${2 * Math.PI * 16 * (1 - (sys?.disk_space.percent ?? 0) / 100)}`} />
            </svg>
            <span className="text-xs font-bold text-white" style={{ zIndex: 1 }}>
              {Math.round(sys?.disk_space.percent ?? 0)}
            </span>
          </div>
          <div>
            <div className="text-xs text-gray-400">{sys?.disk_device ?? "Disk"}</div>
            <div className="text-sm font-bold text-white">{fmtGb(sys?.disk_space.free_gb ?? null)} 可用</div>
          </div>
        </div>

        {/* 读 / 写速度 */}
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="text-center">
            <div className="text-lg font-bold text-white">{fmtMbps(sys?.disk_io.read_mbps ?? null)}</div>
            <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400">
              <div className="w-2 h-2 rounded-full" style={{ background: CR }} /> 读
            </div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-white">{fmtMbps(sys?.disk_io.write_mbps ?? null)}</div>
            <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400">
              <div className="w-2 h-2 rounded-full" style={{ background: CC }} /> 写
            </div>
          </div>
        </div>

        {/* 历史图 */}
        <div className="rounded-sm overflow-hidden" style={{ background: "#111", height: 50 }}>
          <DualSparkline pts={hist}
            getTop={p => p.disk_r} getBottom={p => p.disk_w}
            colorTop={CR} colorBottom={CC} h={50} />
        </div>

        {/* IOPS + 利用率 */}
        <div className="grid grid-cols-2 gap-x-3 text-xs font-mono" style={{ color: "#636366" }}>
          <div className="flex justify-between"><span>读IOPS</span><span style={{ color: CR }}>{sys?.disk_io.read_iops  ?? "—"}</span></div>
          <div className="flex justify-between"><span>写IOPS</span><span style={{ color: CC }}>{sys?.disk_io.write_iops ?? "—"}</span></div>
          {sys?.disk_io.util_pct != null && (
            <div className="flex justify-between col-span-2">
              <span>利用率</span>
              <span style={{ color: sys.disk_io.util_pct >= 80 ? CR : CGR }}>{sys.disk_io.util_pct}%</span>
            </div>
          )}
        </div>
      </ICard>

      {/* ══ NETWORK ══════════════════════════════════════ */}
      <ICard title="网络">
        {/* 上传 / 下载 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-lg font-bold text-white">{fmtKbps(sys?.network.out_kbps ?? null)}</div>
            <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400">
              <div className="w-2 h-2 rounded-full" style={{ background: CR }} /> 上传
            </div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-white">{fmtKbps(sys?.network.in_kbps ?? null)}</div>
            <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400">
              <div className="w-2 h-2 rounded-full" style={{ background: CC }} /> 下载
            </div>
          </div>
        </div>

        {/* 历史图 */}
        <div className="rounded-sm overflow-hidden" style={{ background: "#111", height: 50 }}>
          <DualSparkline pts={hist}
            getTop={p => p.net_out} getBottom={p => p.net_in}
            colorTop={CR} colorBottom={CC} h={50} />
        </div>

        {/* 网络接口 */}
        {sys && sys.net_interfaces.length > 0 && (
          <div className="space-y-2 pt-1">
            {sys.net_interfaces.slice(0, 2).map((iface, i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Globe size={14} style={{ color: CC }} />
                  <span className="text-sm text-white">{iface.name}</span>
                </div>
                <span className="text-xs text-gray-400">{iface.ip}</span>
              </div>
            ))}
          </div>
        )}

        {/* IP 地址 + TCP 状态 */}
        {sys && (
          <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 8 }} className="space-y-2">
            {(["ESTABLISHED", "LISTEN", "TIME_WAIT"] as const).map(s => {
              const n = sys.network.tcp_states[s] ?? 0;
              if (!n) return null;
              const c   = s === "ESTABLISHED" ? CGR : s === "LISTEN" ? CC : CO;
              const lbl = s === "ESTABLISHED" ? "已建立" : s === "LISTEN" ? "监听" : "等待关闭";
              return (
                <div key={s} className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: c }} />
                    <span className="text-sm text-gray-400">{lbl}</span>
                  </div>
                  <span className="text-sm font-mono" style={{ color: c }}>{n}</span>
                </div>
              );
            })}
            <div className="flex justify-between text-xs font-mono" style={{ color: "#636366" }}>
              <span>↑ {fmtSentRecv(sys.network.sent_mb)}</span>
              <span>↓ {fmtSentRecv(sys.network.recv_mb)}</span>
            </div>
          </div>
        )}
      </ICard>

      {/* ══ SENSORS ══════════════════════════════════════ */}
      <ICard title="传感器">
        {/* 三个环形仪表并排 */}
        <div className="flex justify-between items-center px-1">
          <RingGauge
            pct={cpuTemp ? Math.min(100, (cpuTemp.current / 100) * 100) : 0}
            label="CPU" size={90}
            color={cpuTemp ? tColor(cpuTemp.current) : "#1c1c1e"}
            valueText={cpuTemp ? `${cpuTemp.current}°` : "—"}
          />
          <RingGauge
            pct={nvmeTemp ? Math.min(100, (nvmeTemp.current / 89.8) * 100) : 0}
            label="NVMe" size={90} color={CC}
            valueText={nvmeTemp ? `${nvmeTemp.current}°` : "—"}
          />
          <RingGauge
            pct={fanInfo ? Math.min(100, fanInfo.rpm / 6000 * 100) : 0}
            label="FANS" size={90} color={CC}
            valueText={fanInfo
              ? (fanInfo.rpm >= 1000 ? `${(fanInfo.rpm / 1000).toFixed(1)}k` : String(fanInfo.rpm))
              : "—"}
          />
        </div>

        {/* 详细列表 */}
        <div className="space-y-0.5">
          {[
            { label: "CPU封装",  value: cpuTemp  ? String(cpuTemp.current)  : "—", unit: "°"    },
            { label: "NVMe",    value: nvmeTemp ? String(nvmeTemp.current) : "—", unit: "°"    },
            { label: "主板",    value: boardTemp ? String(boardTemp.current) : "—", unit: "°"  },
            { label: "核心峰值", value: coreMax  ? String(coreMax)          : "—", unit: "°"   },
            { label: "核心均值", value: coreAvg  ? String(coreAvg)          : "—", unit: "°"   },
            { label: "风扇",    value: fanInfo  ? fanInfo.rpm.toLocaleString() : "—", unit: "转/分" },
            { label: "频率",    value: sys?.cpu.freq_mhz ? (sys.cpu.freq_mhz / 1000).toFixed(2) : "—", unit: "GHz" },
          ].map((item, i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b last:border-0"
                 style={{ borderColor: "rgba(55,65,81,0.5)" }}>
              <div className="flex flex-col">
                <span className="text-xs" style={{ color: CC }}>{item.label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-mono text-white">{item.value}</span>
                <span className="text-xs text-gray-500">{item.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </ICard>

    </div>
  );
}


// ── Claude Code 专属指标面板 ───────────────────────────────────

const TOOL_ICON: Record<string, string> = {
  Read: "📄", Write: "✏️", Edit: "🔧", Bash: "⚡", Glob: "🔍",
  Grep: "🔎", WebSearch: "🌐", WebFetch: "🌍", Agent: "🤖",
  TodoWrite: "📝", TodoRead: "📋", Task: "🏗️",
};
function toolIcon(name: string) { return TOOL_ICON[name] ?? "⚙️"; }

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtCost(usd: number) {
  if (usd === 0) return "$0.00";
  if (usd < 0.001) return `$${(usd * 1000).toFixed(3)}m`;
  return `$${usd.toFixed(4)}`;
}

function StatRow({ label, value, accent = "text-app-secondary" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[10px] text-app-tertiary">{label}</span>
      <span className={cn("text-[10px] font-mono tabular-nums", accent)}>{value}</span>
    </div>
  );
}

function ClaudeMetricsPanel() {
  const data = useAutoRefresh(() => api.claudeUsage(), 5000);

  if (!data) return (
    <div className="bg-app-secondary border border-app rounded-xl p-4 mb-3 animate-pulse text-center text-app-tertiary text-[11px]">
      加载 Claude 指标...
    </div>
  );

  const { tokens, tools, recent_tools, sessions, performance } = data;
  const totalTokens = tokens.total_input + tokens.total_output;
  const hasData = totalTokens > 0 || tools.length > 0;

  return (
    <div className="bg-app-secondary border border-app rounded-xl overflow-hidden mb-3">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-app">
        <div className="flex items-center gap-2">
          <div className={cn("w-1.5 h-1.5 rounded-full",
            sessions.active > 0 ? "bg-green-400 animate-pulse" : "bg-gray-600")} />
          <span className="text-[11px] font-semibold text-app">Claude Code</span>
          <span className="text-[9px] font-mono text-app-tertiary">Token · 成本 · 工具 · 性能</span>
        </div>
        <div className="flex gap-3 text-[9px] font-mono">
          <span className={cn(sessions.active > 0 ? "text-green-400" : "text-app-tertiary")}>
            {sessions.active} 活跃 / {sessions.total} 总会话
          </span>
          {performance.active_processes > 0 && (
            <span className="text-blue-400">{performance.active_processes} 进程运行中</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4">
        {/* ── Token 消耗 ── */}
        <div className="p-4 border-r border-b lg:border-b-0 border-app space-y-2">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-app-tertiary">令牌消耗</p>
          <p className={cn("text-[22px] font-bold tabular-nums leading-none",
            hasData ? "text-app" : "text-app-tertiary")}>
            {fmtTokens(totalTokens)}
            <span className="text-[9px] font-normal text-app-tertiary ml-1">tokens</span>
          </p>
          <div className="space-y-1 pt-1 border-t border-app/50">
            <StatRow label="输入" value={fmtTokens(tokens.total_input)} accent="text-blue-400" />
            <StatRow label="输出" value={fmtTokens(tokens.total_output)} accent="text-green-400" />
            {tokens.total_cache_read > 0 && (
              <StatRow label="缓存命中" value={fmtTokens(tokens.total_cache_read)} accent="text-purple-400" />
            )}
            {tokens.total_cache_write > 0 && (
              <StatRow label="缓存写入" value={fmtTokens(tokens.total_cache_write)} accent="text-app-tertiary" />
            )}
          </div>
          {!hasData && (
            <p className="text-[10px] text-app-tertiary/60 pt-1">运行 Claude Code 后自动统计</p>
          )}
        </div>

        {/* ── 成本追踪 ── */}
        <div className="p-4 border-b lg:border-b-0 border-r-0 lg:border-r border-app space-y-2">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-app-tertiary">成本估算</p>
          <p className={cn("text-[22px] font-bold tabular-nums leading-none",
            tokens.total_cost_usd > 1 ? "text-yellow-400" : "text-app")}>
            {fmtCost(tokens.total_cost_usd)}
          </p>
          {/* 按模型分布 */}
          {tokens.by_model.length > 0 ? (
            <div className="space-y-1.5 pt-1 border-t border-app/50">
              {tokens.by_model.slice(0, 3).map((m) => {
                const shortModel = m.model.replace("claude-", "").replace("-20", " 20");
                const pct = tokens.total_cost_usd > 0 ? Math.round(m.cost / tokens.total_cost_usd * 100) : 0;
                return (
                  <div key={m.model}>
                    <div className="flex items-center justify-between text-[9px] mb-0.5">
                      <span className="text-app-tertiary truncate max-w-[80px]" title={m.model}>{shortModel}</span>
                      <span className="font-mono text-app-secondary">{fmtCost(m.cost)}</span>
                    </div>
                    <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1 pt-1 border-t border-app/50">
              <p className="text-[10px] text-app-tertiary/60">按模型定价自动估算</p>
              <p className="text-[9px] text-app-tertiary/40 font-mono">Sonnet $3/$15 · Haiku $0.8/$4</p>
            </div>
          )}
        </div>

        {/* ── 工具活动 ── */}
        <div className="p-4 border-r border-t lg:border-t-0 border-app space-y-2">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-app-tertiary">工具调用</p>
          {tools.length === 0 ? (
            <p className="text-[10px] text-app-tertiary/60 py-2">无调用记录</p>
          ) : (
            <div className="space-y-1.5">
              {tools.slice(0, 6).map((t) => (
                <div key={t.tool} className="flex items-center gap-1.5">
                  <span className="text-[10px] w-4 shrink-0">{toolIcon(t.tool)}</span>
                  <span className="text-[10px] text-app-secondary flex-1 truncate">{t.tool}</span>
                  <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden shrink-0">
                    <div className="h-full bg-accent/70 rounded-full" style={{ width: `${t.pct}%` }} />
                  </div>
                  <span className="text-[9px] font-mono text-app-tertiary w-[28px] text-right shrink-0">
                    {t.count >= 1000 ? `${(t.count/1000).toFixed(1)}k` : t.count}
                  </span>
                </div>
              ))}
            </div>
          )}
          {/* 最近调用 */}
          {recent_tools.length > 0 && (
            <div className="pt-2 border-t border-app/50 space-y-0.5">
              <p className="text-[9px] text-app-tertiary mb-1">最近</p>
              {recent_tools.slice(0, 3).map((t, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[9px] font-mono opacity-70 hover:opacity-100">
                  <span>{toolIcon(t.tool)}</span>
                  <span className="text-app-secondary">{t.tool}</span>
                  <span className="text-app-tertiary text-[8px]">{t.session}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 性能指标 ── */}
        <div className="p-4 border-t lg:border-t-0 border-app space-y-2">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-app-tertiary">性能</p>
          <div className="space-y-1">
            <StatRow label="调用次数" value={String(performance.call_count)} />
            <StatRow label="TTFT"
              value={performance.avg_ttft_ms != null ? `${performance.avg_ttft_ms} ms` : "—"}
              accent={performance.avg_ttft_ms != null && performance.avg_ttft_ms < 1000 ? "text-green-400" : "text-app-secondary"}
            />
            <StatRow label="平均时长"
              value={performance.avg_duration_s != null ? `${performance.avg_duration_s} s` : "—"}
            />
            <StatRow label="字符/秒"
              value={performance.avg_chars_per_sec != null ? `${performance.avg_chars_per_sec}` : "—"}
            />
          </div>
          {/* TTFT 小型柱状图 */}
          {performance.recent_ttfts_ms.length > 0 && (
            <div className="pt-2 border-t border-app/50">
              <p className="text-[9px] text-app-tertiary mb-1.5">TTFT 历史（ms）</p>
              <div className="flex items-end gap-0.5 h-8">
                {performance.recent_ttfts_ms.slice(-10).map((v, i) => {
                  const maxV = Math.max(...performance.recent_ttfts_ms);
                  const h = maxV > 0 ? Math.max(2, Math.round((v / maxV) * 32)) : 4;
                  return (
                    <div key={i} className="flex-1 rounded-sm bg-accent/60 transition-all" style={{ height: `${h}px` }}
                         title={`${v} ms`} />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 指标组件（对照 Agentverse Dashboard 设计）────────────────────

function useMetrics() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [apiLatency, setApiLatency] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    const t0 = performance.now();
    try {
      const m = await api.metrics();
      setApiLatency(Math.round(performance.now() - t0));
      setMetrics(m);
    } catch {
      setApiLatency(null);
    }
  };

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  return { metrics, apiLatency };
}

// KPI 卡片
function KPICard({
  label,
  Icon,
  value,
  sub,
  trend,
}: {
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  value: string;
  sub: string;
  trend?: { text: string; positive: boolean } | null;
}) {
  return (
    <div className="rounded-xl px-4 py-4 flex flex-col gap-3 relative overflow-hidden"
         style={{
           background: "var(--background-secondary)",
           border: "1px solid var(--border)",
           boxShadow: "0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)",
         }}>
      {/* Orion 顶部 accent 渐变线 */}
      <div className="absolute top-0 left-0 right-0"
           style={{ height: 1, background: "linear-gradient(90deg,var(--accent) 0%,transparent 55%)" }} />
      <div className="flex items-center justify-between">
        <span className="text-[10px] tracking-[0.06em] uppercase font-semibold"
              style={{ color: "var(--text-tertiary)" }}>{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
             style={{ background: "rgba(68,119,255,0.12)", border: "1px solid rgba(68,119,255,0.25)" }}>
          <Icon size={13} style={{ color: "var(--accent)" }} />
        </div>
      </div>
      <div>
        <p className="tabular-nums leading-none font-bold"
           style={{ fontSize: 28, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{value}</p>
        {trend ? (
          <p className={cn("text-[10px] mt-2 flex items-center gap-0.5 font-semibold",
            trend.positive ? "text-emerald-400" : "text-red-400")}>
            <span>{trend.positive ? "↗" : "↘"}</span> {trend.text}
          </p>
        ) : (
          <p className="text-[10px] mt-2" style={{ color: "var(--text-tertiary)" }}>{sub}</p>
        )}
      </div>
    </div>
  );
}

// 半圆仪表盘（High Availability Gauge）
function GaugeChart({ pct }: { pct: number }) {
  const cx = 150, cy = 155, r = 110;
  const totalArc = Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const fillOffset = totalArc * (1 - clamped / 100);

  // 指针位置（arc 末端）
  const angle = Math.PI * (1 - clamped / 100);
  const nx = cx + r * Math.cos(angle);
  const ny = cy - r * Math.sin(angle);
  const rotateDeg = 90 - (angle * 180) / Math.PI;

  // 刻度标签位置
  const scaleMarks = [
    { pct: 0, label: "00" },
    { pct: 25, label: "25" },
    { pct: 50, label: "50" },
    { pct: 75, label: "75" },
    { pct: 100, label: "100" },
  ];

  return (
    <svg viewBox="0 0 300 188" className="w-full" style={{ maxHeight: 188 }}>
      {/* 背景弧 */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="#2d3748" strokeWidth="14" strokeLinecap="round"
      />
      {/* 填充弧（amber） */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="#d97706" strokeWidth="14" strokeLinecap="round"
        strokeDasharray={totalArc}
        strokeDashoffset={fillOffset}
      />
      {/* 刻度标签 */}
      {scaleMarks.map(({ pct: p, label }) => {
        const a = Math.PI * (1 - p / 100);
        const lx = cx + (r + 24) * Math.cos(a);
        const ly = cy - (r + 24) * Math.sin(a);
        return (
          <text key={p} x={lx} y={ly + 4} textAnchor="middle" fill="#6b7280" fontSize="10">
            {label}
          </text>
        );
      })}
      {/* 指针 pill */}
      <rect
        x={nx - 13} y={ny - 5} width={26} height={10} rx={5}
        fill="#ea580c"
        transform={`rotate(${rotateDeg}, ${nx}, ${ny})`}
      />
      <circle cx={nx} cy={ny} r={2.5} fill="#fef3c7" />
      {/* 中心数值 */}
      <text x={cx} y={cy - 18} textAnchor="middle" fill="white" fontSize="38" fontWeight="bold"
        style={{ fontFamily: "system-ui, sans-serif" }}>
        {clamped}%
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#9ca3af" fontSize="11">
        {clamped}% 正常运行时间
      </text>
    </svg>
  );
}

// 周处理量柱状图（Real-time Processing）
function WeeklyChart({ data }: {
  data: Array<{ day: string; count: number; success_rate: number; is_today: boolean }>;
}) {
  const W = 340, H = 100, barW = 32, gap = 14;
  const totalW = data.length * (barW + gap) - gap;
  const ox = (W - totalW) / 2;
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const gridRatios = [0, 0.3, 0.6, 0.9];

  return (
    <svg viewBox={`0 0 ${W} ${H + 32}`} className="w-full">
      {/* Y 轴网格线 */}
      {gridRatios.map((ratio) => {
        const y = H - ratio * H;
        return (
          <g key={ratio}>
            <line x1={ox - 4} y1={y} x2={W - ox + 4} y2={y} stroke="#374151" strokeWidth="0.5" />
            <text x={0} y={y + 3.5} fill="#6b7280" fontSize="9">{Math.round(ratio * 100)}%</text>
          </g>
        );
      })}
      {/* 柱状图 */}
      {data.map((d, i) => {
        const x = ox + i * (barW + gap);
        const barH = d.count > 0 ? Math.max((d.count / maxCount) * H, 6) : 2;
        const y = H - barH;
        const color = d.is_today ? "#10b981" : "#374151";
        return (
          <g key={d.day}>
            <rect x={x} y={y} width={barW} height={barH} rx={4} fill={color} />
            {d.count > 0 && (
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fill="#e5e7eb" fontSize="8">
                {d.count}
              </text>
            )}
            <text
              x={x + barW / 2} y={H + 16}
              textAnchor="middle"
              fill={d.is_today ? "#10b981" : "#6b7280"}
              fontSize="10"
              fontWeight={d.is_today ? "600" : "400"}
            >
              {d.day}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ChipTag({ label }: { label: string }) {
  return (
    <span className="text-[9px] border border-app text-app-tertiary px-1.5 py-0.5 rounded-full whitespace-nowrap">
      {label}
    </span>
  );
}

function MetricsPanel() {
  const { metrics, apiLatency } = useMetrics();
  const m = metrics;

  const kpiCards = [
    {
      label: "AI 评分",
      Icon: Star,
      value: m?.kpi.ai_rating != null ? m.kpi.ai_rating.toFixed(2) : "—",
      sub: "综合评分",
      trend: m?.kpi.ai_rating != null
        ? { text: m.kpi.ai_rating >= 4 ? "+优秀" : m.kpi.ai_rating >= 3 ? "良好" : "待改善", positive: m.kpi.ai_rating >= 4 }
        : null,
    },
    {
      label: "交互次数",
      Icon: Activity,
      value: m?.kpi.interactions != null ? String(m.kpi.interactions) : "—",
      sub: "总会话数",
      trend: null,
    },
    {
      label: "响应时间",
      Icon: Zap,
      value: m?.kpi.avg_response_time_s != null
        ? `${m.kpi.avg_response_time_s}s`
        : apiLatency != null ? `${(apiLatency / 1000).toFixed(2)}s` : "—",
      sub: "平均延迟",
      trend: null,
    },
    {
      label: "在线率",
      Icon: Shield,
      value: m?.kpi.uptime_pct != null ? `${m.kpi.uptime_pct}%` : "—",
      sub: "可用性",
      trend: null,
    },
  ];

  const DAY_CN: Record<string, string> = {
    Sun: "周日", Mon: "周一", Tue: "周二", Wed: "周三",
    Thu: "周四", Fri: "周五", Sat: "周六",
  };
  const weeklyData = (m?.weekly ?? Array.from({ length: 7 }, (_, i) => ({
    day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i],
    count: 0,
    success_rate: 0,
    is_today: new Date().getDay() === i,
  }))).map((d) => ({ ...d, day: DAY_CN[d.day] ?? d.day }));

  return (
    <div className="space-y-3 mb-6">
      {/* KPI 卡片行 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiCards.map(card => (
          <KPICard key={card.label} {...card} />
        ))}
      </div>

      {/* Gauge + Weekly 图表行 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* High Availability */}
        <div className="rounded-xl p-5 relative overflow-hidden"
             style={{
               background: "var(--background-secondary)",
               border: "1px solid var(--border)",
               boxShadow: "0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)",
             }}>
          <div className="absolute top-0 left-0 right-0"
               style={{ height: 1, background: "linear-gradient(90deg,var(--accent) 0%,transparent 55%)" }} />
          <h3 className="text-[13px] font-semibold mb-4" style={{ color: "var(--text-primary)" }}>高可用性</h3>
          <GaugeChart pct={m?.gauge.availability_pct ?? 0} />
        </div>

        {/* Real-time Processing */}
        <div className="rounded-xl p-5 relative overflow-hidden"
             style={{
               background: "var(--background-secondary)",
               border: "1px solid var(--border)",
               boxShadow: "0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)",
             }}>
          <div className="absolute top-0 left-0 right-0"
               style={{ height: 1, background: "linear-gradient(90deg,var(--accent) 0%,transparent 55%)" }} />
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>实时处理</h3>
            <div className="flex items-center gap-1">
              <ChipTag label="Claude Code" />
              <ChipTag label="实时监控" />
              <ChipTag label="流水线" />
            </div>
          </div>
          <WeeklyChart data={weeklyData} />
        </div>
      </div>
    </div>
  );
}

// ── 原有组件 ──────────────────────────────────────────────────

const STAGE_COLORS: Record<string, "default" | "success" | "warning" | "danger" | "info" | "accent"> = {
  input: "default",
  analysis: "warning",
  prd: "warning",
  ui: "accent",
  plan: "accent",
  dev: "info",
  test: "warning",
  deploy: "success",
  monitor: "success",
  done: "success",
};

const STAGE_LABEL: Record<string, string> = {
  input: "需求", analysis: "分析", prd: "PRD", ui: "UI",
  plan: "方案", dev: "开发", test: "测试", deploy: "发布", monitor: "监控", done: "完成",
};

const STATUS_COLORS: Record<string, "default" | "success" | "warning" | "danger" | "info" | "accent"> = {
  pending: "default",
  running: "info",
  waiting_review: "warning",
  approved: "accent",
  rejected: "danger",
  done: "success",
  failed: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "待处理",
  running: "运行中",
  waiting_review: "待审批",
  approved: "已批准",
  rejected: "已驳回",
  done: "已完成",
  failed: "失败",
};

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-gray-500",
    running: "bg-blue-400 animate-pulse",
    waiting_review: "bg-yellow-400",
    approved: "bg-accent",
    rejected: "bg-red-400",
    done: "bg-green-400",
    failed: "bg-red-400",
  };
  return <span className={cn("w-2 h-2 rounded-full shrink-0", colors[status] || "bg-gray-500")} />;
}

function NewTaskButton({ projectId, onCreated }: { projectId: number; onCreated: (t: Task) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setLoading(true);
    try {
      const task = await api.tasks.create(projectId, { title: title.trim(), description: desc.trim() });
      onCreated(task);
      setTitle(""); setDesc(""); setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ 新建任务</Button>
      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-app-secondary border border-app rounded-xl p-5 w-96 space-y-3 shadow-2xl">
            <h2 className="text-sm font-semibold text-app">新建任务</h2>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="任务标题"
              className="w-full bg-app-tertiary border border-app rounded-md px-3 py-1.5 text-xs text-app placeholder:text-app-tertiary outline-none focus:border-accent"
            />
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="需求描述（可选）"
              rows={3}
              className="w-full bg-app-tertiary border border-app rounded-md px-3 py-1.5 text-xs text-app placeholder:text-app-tertiary outline-none focus:border-accent resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setOpen(false)} className="text-xs text-app-tertiary hover:text-app px-3 py-1.5">取消</button>
              <button onClick={handleCreate} disabled={!title.trim() || loading}
                className="text-xs bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-md disabled:opacity-40">
                {loading ? "创建中..." : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ProjectCard({ project, onSelect, onOpenTask }: { project: Project; onSelect: () => void; onOpenTask: (id: number) => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  useEffect(() => {
    api.projects.tasks(project.id).then(setTasks).catch(() => {});
  }, [project.id]);

  const runningCount = tasks.filter(t => t.status === "running").length;

  return (
    <div
      onClick={onSelect}
      className="rounded-xl p-4 cursor-pointer transition-all space-y-2 relative overflow-hidden group"
      style={{
        background: "var(--background-secondary)",
        border: "1px solid var(--border)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(68,119,255,0.4)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-accent/20 flex items-center justify-center text-accent text-[10px] font-bold">
            {project.name[0].toUpperCase()}
          </div>
          <span className="text-xs font-semibold text-app">{project.name}</span>
        </div>
        {runningCount > 0 && (
          <Badge variant="info">{runningCount} 运行中</Badge>
        )}
      </div>
      <p className="text-app-tertiary text-[10px]">{tasks.length} 个任务</p>
      <div className="flex flex-wrap gap-1 pt-1">
        {tasks.slice(0, 3).map(t => (
          <button
            key={t.id}
            onClick={(e) => { e.stopPropagation(); onOpenTask(t.id); }}
            className="text-[10px] text-app-secondary bg-app-tertiary hover:bg-app-secondary px-1.5 py-0.5 rounded transition-colors"
          >
            {t.title.slice(0, 20)}{t.title.length > 20 ? "..." : ""}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard({ projectId, projects, projectsLoaded, onOpenTask, onSelectProject, liveEvents, wsStatus }: DashboardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);

  useEffect(() => {
    if (projectId) {
      api.projects.tasks(projectId).then(setTasks).catch(() => {});
    } else {
      setTasks([]);
    }
  }, [projectId]);

  const activeProject = projects.find((p) => p.id === projectId);

  if (!projectsLoaded) return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-app-tertiary text-xs animate-pulse">加载中...</p>
    </div>
  );

  // No project selected → overview
  if (!projectId) return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="mb-4">
        <h1 className="text-base font-semibold text-app">概览</h1>
        <p className="text-app-tertiary text-xs mt-0.5">{projects.length} 个项目</p>
      </div>
      <ClaudeMetricsPanel />
      <MetricsPanel />
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 space-y-2">
          <p className="text-app-tertiary text-sm">暂无项目</p>
          <p className="text-app-tertiary text-xs">点击侧边栏的 + 创建项目</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} onSelect={() => onSelectProject(p.id)} onOpenTask={onOpenTask} />
          ))}
        </div>
      )}
    </div>
  );

  // Project selected → task list
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Project header */}
      <div className="px-5 py-3 border-b border-app flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded bg-accent/20 flex items-center justify-center text-accent text-[10px] font-bold">
            {activeProject?.name[0].toUpperCase()}
          </div>
          <h1 className="text-sm font-semibold text-app">{activeProject?.name}</h1>
          <Badge variant="default">{tasks.length} 个任务</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setKnowledgeOpen(true)}>知识库</Button>
          <NewTaskButton projectId={projectId} onCreated={(t) => { setTasks((p) => [t, ...p]); onOpenTask(t.id); }} />
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 space-y-2">
            <p className="text-app-tertiary text-xs">暂无任务</p>
          </div>
        ) : (
          tasks.map((t) => (
            <button
              key={t.id}
              onClick={() => onOpenTask(t.id)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-app-secondary transition-colors text-left group"
            >
              <StatusDot status={t.status} />
              <span className="flex-1 text-xs text-app truncate">{t.title}</span>
              <Badge variant={STAGE_COLORS[t.stage] ?? "default"}>
                {STAGE_LABEL[t.stage] ?? t.stage}
              </Badge>
              <Badge variant={STATUS_COLORS[t.status] ?? "default"}>
                {STATUS_LABEL[t.status] ?? t.status}
              </Badge>
            </button>
          ))
        )}
      </div>

      {/* Knowledge Panel */}
      {knowledgeOpen && (
        <KnowledgePanel projectId={projectId} onClose={() => setKnowledgeOpen(false)} />
      )}
    </div>
  );
}
