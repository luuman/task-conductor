// src/modules/perf/cards/NetCard.tsx
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import type { PerfData } from "../types";
import { ICard, DualSparkline, fmtKbps, fmtSentRecv, CGR, CO } from "./shared";

interface NetCardProps extends PerfData {
  colors?:    Record<string, string>;
  showTitle?: boolean;
}

export function NetCard({ sys, hist, colors = {}, showTitle }: NetCardProps) {
  const { t } = useTranslation();
  const cOut = colors.out ?? "#FF2D55";
  const cIn  = colors.in  ?? "#007AFF";

  return (
    <ICard title={t('perf.metricLabel.net')} showTitle={showTitle}>
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <div className="text-lg font-bold text-white">{fmtKbps(sys?.network.out_kbps)}</div>
          <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400">
            <div className="w-2 h-2 rounded-full" style={{ background: cOut }} /> {t('perf.net.upload')}
          </div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-white">{fmtKbps(sys?.network.in_kbps)}</div>
          <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400">
            <div className="w-2 h-2 rounded-full" style={{ background: cIn }} /> {t('perf.net.download')}
          </div>
        </div>
      </div>

      <div className="rounded-sm overflow-hidden" style={{ background: "#111", height: 50 }}>
        <DualSparkline pts={hist} getTop={p => p.net_out} getBottom={p => p.net_in}
          colorTop={cOut} colorBottom={cIn} h={50} />
      </div>

      {sys && sys.net_interfaces.length > 0 && (
        <div className="space-y-2 pt-1">
          {sys.net_interfaces.slice(0, 2).map((iface, i) => (
            <div key={i} className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Globe size={14} style={{ color: cIn }} />
                <span className="text-sm text-white">{iface.name}</span>
              </div>
              <span className="text-xs text-gray-400">{iface.ip}</span>
            </div>
          ))}
        </div>
      )}

      {sys && (
        <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 8 }} className="space-y-2">
          {(["ESTABLISHED", "LISTEN", "TIME_WAIT"] as const).map(s => {
            const n = sys.network.tcp_states[s] ?? 0;
            if (!n) return null;
            const c   = s === "ESTABLISHED" ? CGR : s === "LISTEN" ? cIn : CO;
            const lbl = s === "ESTABLISHED" ? t('perf.net.established') : s === "LISTEN" ? t('perf.net.listen') : t('perf.net.timeWait');
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
  );
}
