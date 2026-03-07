// src/modules/perf/cards/CpuCard.tsx
import { useTranslation } from "react-i18next";
import type { PerfData } from "../types";
import { ICard, DualSparkline, PhoneProc, CO } from "./shared";

interface CpuCardProps extends PerfData {
  colors?:    Record<string, string>;
  settings?:  Record<string, string>;
  showTitle?: boolean;
}

export function CpuCard({ sys, hist, procs, colors = {}, settings = {}, showTitle }: CpuCardProps) {
  const { t } = useTranslation();
  const cUser = colors.user      ?? "#FF2D55";
  const cSys  = colors.sys       ?? "#007AFF";
  const procCount = Number(settings.procCount ?? 3);

  const cpuProcs = procs?.by_cpu.slice(0, procCount) ?? [];
  const temps    = sys?.sensors?.temperatures ?? [];
  const cpuTemp  = temps.find(t =>
    t.sensor.toLowerCase().includes("coretemp") ||
    t.sensor.toLowerCase().includes("k10temp")  ||
    t.label.toLowerCase().includes("tdie")) ?? temps[0] ?? null;

  return (
    <ICard title="CPU" showTitle={showTitle} right={
      <span className="text-xs font-mono text-white">
        {cpuTemp ? `${cpuTemp.current}°` : "—"}
      </span>
    }>
      <div className="rounded-sm overflow-hidden" style={{ background: "#111", height: 50 }}>
        <DualSparkline pts={hist} getTop={p => p.cpu_user} getBottom={p => p.cpu_sys}
          colorTop={cUser} colorBottom={cSys} h={50} />
      </div>

      <div className="flex justify-between text-[10px] font-medium">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full" style={{ background: cUser }} />
          <span className="text-gray-400">{t('perf.cpu.user')}</span>
          <span className="text-white ml-1">{(sys?.cpu.user_pct ?? 0).toFixed(1)}%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full" style={{ background: cSys }} />
          <span className="text-gray-400">{t('perf.cpu.system')}</span>
          <span className="text-white ml-1">{(sys?.cpu.system_pct ?? 0).toFixed(1)}%</span>
        </div>
      </div>

      {sys?.cpu.per_core && sys.cpu.per_core.length > 0 && (() => {
        const cols = sys.cpu.per_core.length <= 8 ? sys.cpu.per_core.length : 8;
        const sz = 22, r = 8, sw = 2.5, circ = 2 * Math.PI * r;
        return (
          <div className="grid gap-1 py-1"
               style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {sys.cpu.per_core.map((pct, i) => {
              const c = pct >= 80 ? cUser : pct >= 45 ? CO : cSys;
              const offset = circ * (1 - Math.max(0, Math.min(100, pct)) / 100);
              return (
                <div key={i} className="flex items-center justify-center">
                  <svg width={sz} height={sz} style={{ display: "block" }}>
                    {/* track */}
                    <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke="#2a2a2a" strokeWidth={sw} />
                    {/* arc — starts at 12 o'clock */}
                    <circle
                      cx={sz/2} cy={sz/2} r={r} fill="none"
                      stroke={c} strokeWidth={sw} strokeLinecap="round"
                      strokeDasharray={circ}
                      strokeDashoffset={offset}
                      style={{ transform: "rotate(-90deg)", transformOrigin: `${sz/2}px ${sz/2}px` }}
                    />
                  </svg>
                </div>
              );
            })}
          </div>
        );
      })()}

      {sys && (
        <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 6 }} className="space-y-1.5">
          {/* Load average */}
          <div className="flex justify-between items-baseline text-[10px] font-medium">
            <span className="text-gray-400">{t('perf.cpu.loadAvg')}</span>
            <span className="font-mono tabular-nums" style={{ color: cSys }}>
              {sys.cpu.load_avg
                ? `${sys.cpu.load_avg["1m"]} · ${sys.cpu.load_avg["5m"]} · ${sys.cpu.load_avg["15m"]}`
                : "—"}
            </span>
          </div>
          {/* Context switches/sec */}
          <div className="flex justify-between items-baseline text-[10px] font-medium">
            <span className="text-gray-400">{t('perf.cpu.ctxSwitch')}</span>
            <span className="font-mono tabular-nums" style={{ color: cSys }}>
              {sys.cpu.ctx_switches_per_sec != null
                ? sys.cpu.ctx_switches_per_sec >= 1000
                  ? `${(sys.cpu.ctx_switches_per_sec / 1000).toFixed(1)}k`
                  : String(sys.cpu.ctx_switches_per_sec)
                : "—"}
            </span>
          </div>
        </div>
      )}

      {cpuProcs.length > 0 && (
        <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 6 }} className="space-y-1">
          <div className="text-xs font-medium mb-1" style={{ color: cSys }}>{t('perf.cpu.processes')}</div>
          {cpuProcs.map(p => (
            <PhoneProc key={p.pid} name={p.name} value={`${p.cpu_pct}%`} valueColor={cSys} />
          ))}
        </div>
      )}

      {sys && (
        <div className="flex justify-between items-center text-[11px] font-medium uppercase tracking-wider"
             style={{ borderTop: "1px solid #1a1a1a", paddingTop: 8, color: "#636366" }}>
          <span style={{ color: cSys }}>{t('perf.cpu.uptime')}</span>
          <span className="text-white">
            {sys.uptime_hours >= 24
              ? `${Math.floor(sys.uptime_hours / 24)} ${t('perf.cpu.days')} ${(sys.uptime_hours % 24).toFixed(0)} ${t('perf.cpu.hours')}`
              : `${sys.uptime_hours.toFixed(1)} ${t('perf.cpu.hours')}`}
          </span>
        </div>
      )}
    </ICard>
  );
}
