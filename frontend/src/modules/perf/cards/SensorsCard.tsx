// src/modules/perf/cards/SensorsCard.tsx
import type { PerfData } from "../types";
import { ICard, RingGauge, tColor, CC } from "./shared";

interface SensorsCardProps extends PerfData {
  colors?:    Record<string, string>;
  showTitle?: boolean;
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="pt-2 pb-0.5">
      <span className="text-[10px] font-semibold" style={{ color: "var(--accent, #4477ff)" }}>
        {label}
      </span>
    </div>
  );
}

function Row({ name, value, color }: { name: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-[3px]">
      <span className="text-[11px] truncate max-w-[55%]" style={{ color: "#9ca3af" }}>{name}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-mono tabular-nums" style={{ color: "#e5e7eb" }}>{value}</span>
        {color && (
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
        )}
      </div>
    </div>
  );
}

export function SensorsCard({ sys, colors = {}, showTitle }: SensorsCardProps) {
  const cNvme = colors.nvme ?? "#FF9F0A";

  const temps = sys?.sensors?.temperatures ?? [];
  const fans  = sys?.sensors?.fans ?? [];

  // ring gauges
  const cpuTemp   = temps.find(t =>
    t.sensor.toLowerCase().includes("coretemp") ||
    t.sensor.toLowerCase().includes("k10temp")  ||
    t.label.toLowerCase().includes("tdie")
  ) ?? temps.find(t => t.label.toLowerCase().includes("package")) ?? null;

  const nvmeTemp  = temps.find(t =>
    t.sensor.toLowerCase().includes("nvme") && t.label.toLowerCase() === "composite"
  ) ?? temps.find(t => t.sensor.toLowerCase().includes("nvme")) ?? null;

  // display name: prefer label when it differs from sensor (more descriptive)
  function displayName(t: { sensor: string; label: string }) {
    if (!t.label || t.label === t.sensor) return t.sensor;
    return t.label;
  }

  return (
    <ICard title="传感器" showTitle={showTitle}>
      {/* ── Top rings ── */}
      <div className="flex justify-between items-center px-1">
        <RingGauge
          pct={cpuTemp ? Math.min(100, cpuTemp.current) : 0}
          label="CPU" size={90}
          color={cpuTemp ? tColor(cpuTemp.current) : "#1c1c1e"}
          valueText={cpuTemp ? `${cpuTemp.current}°` : "—"}
        />
        <RingGauge
          pct={nvmeTemp ? Math.min(100, (nvmeTemp.current / 89.8) * 100) : 0}
          label="NVMe" size={90} color={cNvme}
          valueText={nvmeTemp ? `${nvmeTemp.current}°` : "—"}
        />
      </div>

      {/* ── 温度 ── */}
      {temps.length > 0 && (
        <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 2 }}>
          <SectionLabel label="温度" />
          {temps.slice(0, 10).map((t, i) => (
            <Row
              key={i}
              name={displayName(t)}
              value={`${t.current}°`}
              color={tColor(t.current)}
            />
          ))}
        </div>
      )}

      {/* ── 风扇 ── */}
      <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 2 }}>
        <SectionLabel label="风扇" />
        {fans.length > 0
          ? fans.map((f, i) => (
              <Row key={i} name={f.label || f.sensor || "风扇"} value={`${f.rpm.toLocaleString()} 转/分`} />
            ))
          : <Row name="风扇" value="—" />
        }
      </div>

      {/* ── 频率 ── */}
      {sys?.cpu.freq_mhz && (
        <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 2 }}>
          <SectionLabel label="频率" />
          <Row
            name="CPU"
            value={`${(sys.cpu.freq_mhz / 1000).toFixed(2)} GHz`}
            color={CC}
          />
        </div>
      )}
    </ICard>
  );
}
