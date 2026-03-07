// src/modules/perf/bar/PerfBottomBar.tsx
import { useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Zap } from "lucide-react";
import { usePerfData } from "../usePerfData";
import { usePerfConfig } from "../usePerfConfig";
import type { MetricId } from "../types";
import { CpuCard } from "../cards/CpuCard";
import { MemCard } from "../cards/MemCard";
import { DiskCard } from "../cards/DiskCard";
import { NetCard } from "../cards/NetCard";
import { SensorsCard } from "../cards/SensorsCard";
// ── 底栏专用格式化（无小数）────────────────────────────────────────────────
function barKbps(k: number | null | undefined) {
  if (k == null) return "—";
  if (k >= 1024 * 1024) return `${Math.round(k / 1024 / 1024)} GB/s`;
  if (k >= 1024)        return `${Math.round(k / 1024)} MB/s`;
  return `${Math.round(k)} KB/s`;
}
interface PerfBottomBarProps {
  connectionStatus?: "connected" | "disconnected" | "connecting";
}

const BAR_H = 34; // px — 两行文字的底栏高度

/** 每个 tile 的两行内容 */
function TileLines({ id, sys }: {
  id: MetricId;
  sys: ReturnType<typeof usePerfData>["sys"];
}) {
  const temps   = sys?.sensors?.temperatures ?? [];
  const cpuTemp = temps.find(t =>
    t.sensor.toLowerCase().includes("coretemp") ||
    t.sensor.toLowerCase().includes("k10temp")) ?? temps[0];

  const row = (a: string, b: string) => (
    <>
      <span className="font-mono tabular-nums leading-none text-[9.5px] text-white">{a}</span>
      <span className="font-mono tabular-nums leading-none text-[9.5px] text-white">{b}</span>
    </>
  );

  switch (id) {
    case "cpu":
      return row("CPU", sys ? `${Math.round(sys.cpu.percent)}%` : "—");
    case "mem":
      return row("MEM", sys ? `${Math.round(sys.memory.percent)}%` : "—");
    case "net":
      return row(`↑ ${barKbps(sys?.network.out_kbps)}`, `↓ ${barKbps(sys?.network.in_kbps)}`);
    case "disk":
      return row("DISK", sys?.disk_space.percent != null ? `${Math.round(sys.disk_space.percent)}%` : "—");
    case "sensors":
      return row("TEMP", cpuTemp ? `${cpuTemp.current}°` : "—");
    default:
      return null;
  }
}

export function PerfBottomBar({ connectionStatus }: PerfBottomBarProps) {
  const { t } = useTranslation();
  const { sys, hist, procs } = usePerfData();
  const { config } = usePerfConfig();
  const [activeMetric, setActiveMetric] = useState<MetricId | null>(null);
  const [popoverLeft, setPopoverLeft] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);

  const enabledMetrics = config.metrics.filter(m => m.enabled);

  const isConnected  = connectionStatus === "connected";
  const isConnecting = connectionStatus === "connecting";
  const connColor = isConnected ? "#22c55e" : isConnecting ? "#f59e0b" : "#636366";
  const connText  = isConnected ? t('perfBar.connected') : isConnecting ? t('perfBar.connecting') : t('perfBar.disconnected');

  // close on outside click
  useEffect(() => {
    if (!activeMetric) return;
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setActiveMetric(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activeMetric]);

  const handleTileClick = (id: MetricId, btn: HTMLButtonElement) => {
    if (activeMetric === id) { setActiveMetric(null); return; }
    const rect = btn.getBoundingClientRect();
    const cardWidth = 280;
    const left = Math.max(8, Math.min(
      rect.left + rect.width / 2 - cardWidth / 2,
      window.innerWidth - cardWidth - 8,
    ));
    setPopoverLeft(left);
    setActiveMetric(id);
  };

  const renderCard = (id: MetricId) => {
    const mc       = config.metrics.find(m => m.id === id);
    const colors   = mc?.colors   ?? {};
    const settings = mc?.settings ?? {};
    const data = { sys, hist, procs };
    switch (id) {
      case "cpu":     return <CpuCard {...data} colors={colors} settings={settings} showTitle={false} />;
      case "mem":     return <MemCard {...data} colors={colors} showTitle={false} />;
      case "disk":    return <DiskCard {...data} colors={colors} showTitle={false} />;
      case "net":     return <NetCard {...data} colors={colors} showTitle={false} />;
      case "sensors": return <SensorsCard {...data} colors={colors} showTitle={false} />;
    }
  };

  return (
    <div ref={barRef} className="relative shrink-0">
      {/* Popover */}
      {activeMetric && (
        <div className="fixed z-50" style={{ bottom: BAR_H + 4, left: popoverLeft, width: 280 }}>
          {renderCard(activeMetric)}
        </div>
      )}

      {/* Bottom bar */}
      <div
        className="flex items-center px-2 select-none"
        style={{ height: BAR_H, background: "#080808", borderTop: "1px solid #1e1e1e" }}
      >
        {enabledMetrics.map((m) => {
          const isActive = activeMetric === m.id;
          return (
            <div key={m.id} className="flex items-center">
              <button
                onClick={e => handleTileClick(m.id, e.currentTarget)}
                className="flex flex-col items-start gap-[3px] rounded px-2 py-1 transition-colors"
                style={{
                  background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
                  outline: "none",
                }}
              >
                <TileLines id={m.id} sys={sys} />
              </button>
            </div>
          );
        })}

        <div className="flex-1" />

        {/* Connection status */}
        {connectionStatus !== undefined && (
          <>
            <div className="flex flex-col items-end gap-[3px]">
              <div className="flex items-center gap-1">
                <Zap size={12} style={{ color: connColor }} />
                <span className="text-[10px] font-mono" style={{ color: connColor }}>{connText}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
