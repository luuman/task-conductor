// src/modules/perf/cards/MemCard.tsx
import { useTranslation } from "react-i18next";
import type { PerfData } from "../types";
import { ICard, RingGauge, PhoneProc } from "./shared";

interface MemCardProps extends PerfData {
  colors?:    Record<string, string>;
  showTitle?: boolean;
}

export function MemCard({ sys, procs, colors = {}, showTitle }: MemCardProps) {
  const { t } = useTranslation();
  const cUsed   = colors.used   ?? "#FF2D55";
  const cCached = colors.cached ?? "#007AFF";

  const memProcs = procs?.by_mem.slice(0, 3) ?? [];

  return (
    <ICard title={t('perf.metricLabel.mem')} showTitle={showTitle}>
      <div className="flex justify-between items-center px-2">
        <RingGauge pct={sys?.memory.percent ?? 0} label={t('perf.mem.memory')} color={cUsed} size={110} />
        {(sys?.swap.total_gb ?? 0) > 0.1
          ? <RingGauge pct={sys?.swap.percent ?? 0} label={t('perf.mem.swap')} color={cCached} size={110} />
          : <RingGauge pct={sys?.memory.percent ?? 0} label={t('perf.mem.pressure')} color={cCached} size={110} />
        }
      </div>

      <div className="space-y-1">
        {[
          { label: "App 内存", gb: sys?.memory.used_gb    ?? 0, color: cCached       },
          { label: "联动内存", gb: sys?.memory.buffers_gb ?? 0, color: cUsed         },
          { label: "已压缩",   gb: sys?.memory.cached_gb  ?? 0, color: "#FF9F0A"     },
          { label: "可用",     gb: sys?.memory.free_gb    ?? 0, color: "#6b7280"     },
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

      {memProcs.length > 0 && (
        <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 6 }} className="space-y-1">
          <div className="text-xs font-medium mb-1" style={{ color: cCached }}>进程</div>
          {memProcs.map(p => (
            <PhoneProc key={p.pid} name={p.name}
              value={p.mem_mb >= 1024 ? `${(p.mem_mb / 1024).toFixed(1)} G` : `${Math.round(p.mem_mb)} M`}
              valueColor={cUsed} />
          ))}
        </div>
      )}
    </ICard>
  );
}
