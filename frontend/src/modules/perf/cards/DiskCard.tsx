// src/modules/perf/cards/DiskCard.tsx
import { useTranslation } from "react-i18next";
import type { PerfData } from "../types";
import { ICard, DualSparkline, fmtGb, fmtMbps, CGR } from "./shared";

interface DiskCardProps extends PerfData {
  colors?:    Record<string, string>;
  showTitle?: boolean;
}

export function DiskCard({ sys, hist, colors = {}, showTitle }: DiskCardProps) {
  const { t } = useTranslation();
  const cRead  = colors.read  ?? "#FF2D55";
  const cWrite = colors.write ?? "#007AFF";

  return (
    <ICard title={t('perf.metricLabel.disk')} showTitle={showTitle}>
      <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-800"
           style={{ background: "rgba(17,17,17,0.5)" }}>
        <div className="relative flex items-center justify-center shrink-0" style={{ width: 40, height: 40 }}>
          <svg width={40} height={40} className="absolute" style={{ transform: "rotate(-90deg)" }}>
            <circle cx={20} cy={20} r={16} fill="none" stroke="#222" strokeWidth={3} />
            <circle cx={20} cy={20} r={16} fill="none" stroke={cRead} strokeWidth={3}
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
          <div className="text-sm font-bold text-white">{fmtGb(sys?.disk_space.free_gb)} {t('perf.disk.available')}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 py-2">
        <div className="text-center">
          <div className="text-lg font-bold text-white">{fmtMbps(sys?.disk_io.read_mbps)}</div>
          <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400">
            <div className="w-2 h-2 rounded-full" style={{ background: cRead }} /> {t('perf.disk.read')}
          </div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-white">{fmtMbps(sys?.disk_io.write_mbps)}</div>
          <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400">
            <div className="w-2 h-2 rounded-full" style={{ background: cWrite }} /> {t('perf.disk.write')}
          </div>
        </div>
      </div>

      <div className="rounded-sm overflow-hidden" style={{ background: "#111", height: 50 }}>
        <DualSparkline pts={hist} getTop={p => p.disk_r} getBottom={p => p.disk_w}
          colorTop={cRead} colorBottom={cWrite} h={50} />
      </div>

      <div className="grid grid-cols-2 gap-x-3 text-xs font-mono" style={{ color: "#636366" }}>
        <div className="flex justify-between"><span>读IOPS</span><span style={{ color: cRead }}>{sys?.disk_io.read_iops  ?? "—"}</span></div>
        <div className="flex justify-between"><span>写IOPS</span><span style={{ color: cWrite }}>{sys?.disk_io.write_iops ?? "—"}</span></div>
        {sys?.disk_io.util_pct != null && (
          <div className="flex justify-between col-span-2">
            <span>利用率</span>
            <span style={{ color: sys.disk_io.util_pct >= 80 ? cRead : CGR }}>{sys.disk_io.util_pct}%</span>
          </div>
        )}
      </div>
    </ICard>
  );
}
