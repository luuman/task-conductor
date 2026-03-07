// frontend/src/components/PerfBar.tsx
// iStatMenus menu-bar 风格的紧凑性能底栏
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cpu, Database, Wifi, HardDrive, Zap } from "lucide-react";
import { api, type SystemMetrics } from "../lib/api";

const CC = "#007AFF";   // iOS 蓝 — user / download / read
const CR = "#FF2D55";   // iOS 粉红 — sys / upload / write
const CG = "#1a1a1a";   // bar track

interface MiniHist { cpu: number; net_in: number; net_out: number; disk_r: number; disk_w: number; }
const MINI_LEN = 20;

/** 极小 sparkline，内联 SVG */
function TinyLine({ vals, color, w = 32, h = 13 }: { vals: number[]; color: string; w?: number; h?: number }) {
  const max = Math.max(...vals, 0.001);
  const bW = 2, gap = 1, total = MINI_LEN;
  const W = total * (bW + gap) - gap;
  const padded = [...Array(Math.max(0, total - vals.length)).fill(0), ...vals.slice(-total)];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none"
         className="inline-block align-middle shrink-0">
      {padded.map((v, i) => {
        const barH = Math.max(1, (v / max) * h);
        return <rect key={i} x={i * (bW + gap)} y={h - barH} width={bW} height={barH} fill={color} fillOpacity={0.85} />;
      })}
    </svg>
  );
}

function fmtKbps(k: number | null | undefined) {
  if (k == null) return "—";
  if (k >= 1024 * 1024) return `${(k / 1024 / 1024).toFixed(1)} GB/s`;
  if (k >= 1024)        return `${(k / 1024).toFixed(1)} MB/s`;
  return `${Math.round(k)} KB/s`;
}

function fmtMbps(m: number | null | undefined) {
  if (m == null) return "—";
  if (m >= 1024) return `${(m / 1024).toFixed(1)} GB/s`;
  if (m < 0.1)   return `${Math.round(m * 1024)} KB/s`;
  return `${m.toFixed(1)} MB/s`;
}

/** 竖线分隔符 */
function Sep() {
  return <div className="w-px h-3.5 bg-[#1a1a1a] shrink-0" />;
}

interface PerfBarProps {
  connectionStatus?: "connected" | "disconnected" | "connecting";
  onDisconnect?: () => void;
}

export function PerfBar({ connectionStatus, onDisconnect }: PerfBarProps) {
  const { t } = useTranslation();
  const [sys, setSys]   = useState<SystemMetrics | null>(null);
  const histRef         = useRef<MiniHist[]>([]);
  const [tick, setTick] = useState(0);   // 触发重渲染
  void tick;

  useEffect(() => {
    let alive = true;
    const fetch = async () => {
      try {
        const s = await api.system();
        if (!alive) return;
        setSys(s);
        histRef.current = [
          ...histRef.current,
          {
            cpu:    s.cpu.percent,
            net_in: s.network.in_kbps  ?? 0,
            net_out:s.network.out_kbps ?? 0,
            disk_r: s.disk_io.read_mbps  ?? 0,
            disk_w: s.disk_io.write_mbps ?? 0,
          },
        ].slice(-MINI_LEN);
        setTick(t => t + 1);
      } catch { /* ignore */ }
    };
    fetch();
    const t = setInterval(fetch, 4000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const hist     = histRef.current;
  const cpuColor = !sys ? "#374151" : sys.cpu.percent >= 90 ? CR : sys.cpu.percent >= 70 ? "#f59e0b" : CC;
  const memColor = !sys ? "#374151" : sys.memory.percent >= 90 ? CR : sys.memory.percent >= 75 ? "#f59e0b" : CC;
  const diskUtil = sys?.disk_io.util_pct;
  const hasData  = hist.length > 1;

  const isConnected  = connectionStatus === "connected";
  const isConnecting = connectionStatus === "connecting";
  const connColor = isConnected ? "#22c55e" : isConnecting ? "#f59e0b" : "#636366";
  const connText  = isConnected ? t('perfBar.connected') : isConnecting ? t('perfBar.connecting') : t('perfBar.disconnected');

  return (
    <div
      className="h-7 flex items-center px-4 gap-3.5 shrink-0 select-none"
      style={{ background: "#050505", borderTop: "1px solid #1a1a1a" }}
    >
      {/* ── CPU ─────────────────────────── */}
      <div className="flex items-center gap-1.5">
        <Cpu size={11} color="#636366" className="shrink-0" />
        {hasData && <TinyLine vals={hist.map(p => p.cpu)} color={cpuColor} />}
        <span className="text-[10px] font-mono tabular-nums leading-none" style={{ color: cpuColor }}>
          {sys?.cpu.percent ?? "—"}%
        </span>
        {sys?.cpu.load_avg && (
          <span className="text-[9px] font-mono tabular-nums hidden lg:inline" style={{ color: "#636366" }}>
            {sys.cpu.load_avg["1m"]}
          </span>
        )}
      </div>

      <Sep />

      {/* ── MEM ─────────────────────────── */}
      <div className="flex items-center gap-1.5">
        <Database size={11} color="#636366" className="shrink-0" />
        {sys && (
          <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: CG }}>
            <div className="h-full rounded-full transition-all duration-700"
                 style={{ width: `${sys.memory.percent}%`, background: memColor }} />
          </div>
        )}
        <span className="text-[10px] font-mono tabular-nums leading-none" style={{ color: memColor }}>
          {sys ? `${Math.round(sys.memory.percent)}%` : "—"}
        </span>
        <span className="text-[9px] font-mono hidden xl:inline" style={{ color: "#636366" }}>
          {sys ? `${sys.memory.used_gb.toFixed(1)}/${sys.memory.total_gb.toFixed(0)} GB` : ""}
        </span>
      </div>

      <Sep />

      {/* ── NET ─────────────────────────── */}
      <div className="flex items-center gap-1.5">
        <Wifi size={11} color="#636366" className="shrink-0" />
        {hasData && (
          <TinyLine vals={hist.map(p => p.net_in + p.net_out)} color="#8b5cf6" />
        )}
        <span className="text-[10px] font-mono tabular-nums leading-none" style={{ color: CC }}>
          ↓{fmtKbps(sys?.network.in_kbps)}
        </span>
        <span className="text-[10px] font-mono tabular-nums leading-none" style={{ color: CR }}>
          ↑{fmtKbps(sys?.network.out_kbps)}
        </span>
      </div>

      <Sep />

      {/* ── DISK ────────────────────────── */}
      <div className="flex items-center gap-1.5">
        <HardDrive size={11} color="#636366" className="shrink-0" />
        {hasData && (
          <TinyLine vals={hist.map(p => p.disk_r + p.disk_w)} color="#3b82f6" />
        )}
        <span className="text-[10px] font-mono tabular-nums leading-none" style={{ color: CC }}>
          R {fmtMbps(sys?.disk_io.read_mbps)}
        </span>
        <span className="text-[10px] font-mono tabular-nums leading-none" style={{ color: CR }}>
          W {fmtMbps(sys?.disk_io.write_mbps)}
        </span>
        {diskUtil != null && (
          <span className="text-[9px] font-mono tabular-nums hidden xl:inline"
                style={{ color: diskUtil >= 80 ? CR : "#636366" }}>
            {diskUtil}%
          </span>
        )}
      </div>

      {/* ── spacer ──────────────────────── */}
      <div className="flex-1" />

      {/* ── 系统信息 ────────────────────── */}
      {sys && (
        <span className="text-[9px] font-mono hidden md:inline whitespace-nowrap" style={{ color: "#636366" }}>
          {sys.hostname}
          {" · "}
          {sys.uptime_hours >= 48
            ? `${Math.floor(sys.uptime_hours / 24)}d ${(sys.uptime_hours % 24).toFixed(0)}h`
            : `${sys.uptime_hours.toFixed(1)}h`}
          {" · "}
          {sys.process_count} procs
        </span>
      )}

      {/* ── 连接状态 ────────────────────── */}
      {connectionStatus !== undefined && (
        <>
          <Sep />
          <div className="flex items-center gap-1.5">
            <Zap size={10} style={{ color: connColor }} />
            <span className="text-[10px] font-mono" style={{ color: connColor }}>{connText}</span>
            {onDisconnect && (
              <button
                onClick={onDisconnect}
                className="text-[10px] px-1.5 py-0.5 rounded transition-colors hover:text-red-400 hover:bg-red-400/10"
                style={{ color: "#636366" }}
              >
                {t('perfBar.disconnectedAlt')}
              </button>
            )}
          </div>
        </>
      )}

      {/* live dot */}
      <div className="w-1.5 h-1.5 rounded-full shrink-0"
           style={{ background: sys ? CC : "#374151", boxShadow: sys ? `0 0 4px ${CC}88` : "none" }} />
    </div>
  );
}
