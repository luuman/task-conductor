// src/modules/perf/settings/PerfSettings.tsx
import { useState } from "react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, Cpu, Database, Wifi, HardDrive, Thermometer } from "lucide-react";
import { usePerfConfig } from "../usePerfConfig";
import { usePerfData } from "../usePerfData";
import { METRIC_LABEL, METRIC_COLORS, METRIC_SETTINGS } from "../types";
import type { MetricConfig, MetricId } from "../types";
import type { SystemMetrics } from "../../../lib/api";
import { CpuCard }     from "../cards/CpuCard";
import { MemCard }     from "../cards/MemCard";
import { NetCard }     from "../cards/NetCard";
import { DiskCard }    from "../cards/DiskCard";
import { SensorsCard } from "../cards/SensorsCard";

// ── Icons per metric ──────────────────────────────────────────────────────────
const METRIC_ICONS: Record<MetricId, React.ElementType> = {
  cpu:     Cpu,
  mem:     Database,
  net:     Wifi,
  disk:    HardDrive,
  sensors: Thermometer,
};

// ── Icon-only sortable tab (Col 1) ────────────────────────────────────────────
function IconTab({
  item, isSelected, onSelect,
}: {
  item: MetricConfig;
  isSelected: boolean;
  onSelect: (id: MetricId) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const Icon = METRIC_ICONS[item.id];

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
        borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
        background: isSelected ? "var(--accent-subtle)" : "transparent",
        cursor: "grab",
      }}
      className="flex items-center justify-center py-3 select-none"
      title={METRIC_LABEL[item.id]}
      onClick={() => onSelect(item.id)}
    >
      <Icon
        size={15}
        strokeWidth={isSelected ? 2 : 1.6}
        style={{
          color: isSelected
            ? "var(--accent)"
            : item.enabled
            ? "var(--text-secondary)"
            : "var(--text-tertiary)",
        }}
      />
    </div>
  );
}

// ── Bar tile preview (2 lines, matches bottom bar) ────────────────────────────
function BarTile({ id, sys }: { id: MetricId; sys: SystemMetrics | null }) {
  const temps   = sys?.sensors?.temperatures ?? [];
  const cpuTemp = temps.find(t =>
    t.sensor.toLowerCase().includes("coretemp") ||
    t.sensor.toLowerCase().includes("k10temp")) ?? temps[0];

  function fmtK(v: number | null | undefined) {
    if (v == null) return "—";
    if (v >= 1024 * 1024) return `${Math.round(v / 1024 / 1024)} GB/s`;
    if (v >= 1024)        return `${Math.round(v / 1024)} MB/s`;
    return `${Math.round(v)} KB/s`;
  }
  const lines: [string, string] = (() => {
    switch (id) {
      case "cpu":     return ["CPU",             sys ? `${Math.round(sys.cpu.percent)}%` : "—"];
      case "mem":     return ["MEM",             sys ? `${Math.round(sys.memory.percent)}%` : "—"];
      case "net":     return [`↑ ${fmtK(sys?.network.out_kbps)}`, `↓ ${fmtK(sys?.network.in_kbps)}`];
      case "disk":    return ["DISK",            sys?.disk_space.percent != null ? `${Math.round(sys.disk_space.percent)}%` : "—"];
      case "sensors": return ["TEMP",            cpuTemp ? `${cpuTemp.current}°` : "—"];
    }
  })();

  return (
    <div className="flex flex-col items-start gap-[3px]">
      <span className="font-mono tabular-nums text-[9.5px] text-white leading-none">{lines[0]}</span>
      <span className="font-mono tabular-nums text-[9.5px] text-white leading-none">{lines[1]}</span>
    </div>
  );
}

// ── Card preview + bar preview (Col 2) ───────────────────────────────────────
function CardPreview({
  mc, onToggle,
}: {
  mc: MetricConfig;
  onToggle: () => void;
}) {
  const { sys, hist, procs } = usePerfData();
  const Icon  = METRIC_ICONS[mc.id];
  const data  = { sys, hist, procs };
  const colors   = mc.colors;
  const settings = mc.settings;

  const card = (() => {
    switch (mc.id) {
      case "cpu":     return <CpuCard     {...data} colors={colors} settings={settings} />;
      case "mem":     return <MemCard     {...data} colors={colors} />;
      case "net":     return <NetCard     {...data} colors={colors} />;
      case "disk":    return <DiskCard    {...data} colors={colors} />;
      case "sensors": return <SensorsCard {...data} colors={colors} />;
    }
  })();

  return (
    <div className="flex flex-col h-full">
      {/* ── Header: icon + name + toggle ── */}
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <Icon size={13} style={{ color: mc.enabled ? "var(--accent)" : "var(--text-tertiary)" }} strokeWidth={2} />
        <span className="flex-1 text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
          {METRIC_LABEL[mc.id]}
        </span>
        {/* toggle */}
        <button
          onClick={onToggle}
          className="relative shrink-0 rounded-full overflow-hidden transition-colors"
          style={{
            width: 36, height: 20,
            background: mc.enabled ? "var(--accent)" : "var(--background-tertiary)",
          }}
        >
          <span
            className="absolute top-[3px] left-0 w-[14px] h-[14px] rounded-full bg-white shadow transition-transform duration-200"
            style={{ transform: mc.enabled ? "translateX(19px)" : "translateX(3px)" }}
          />
        </button>
      </div>

      {/* ── Card on dark background ── */}
      <div
        className="flex-1 overflow-y-auto p-4"
        style={{ background: "#0a0a0a" }}
      >
        <div style={{ maxWidth: 280, margin: "0 auto" }}>
          {card}
        </div>
      </div>

      {/* ── Mini bottom bar tile ── */}
      <div
        className="shrink-0 flex items-center px-4"
        style={{
          height: 34,
          background: "#080808",
          borderTop: "1px solid #1e1e1e",
        }}
      >
        <BarTile id={mc.id} sys={sys} />
      </div>
    </div>
  );
}

// ── Full-width color bar row ──────────────────────────────────────────────────
function ColorRow({
  label, colorKey, value, onChange,
}: {
  label: string;
  colorKey: string;
  value: string;
  onChange: (key: string, val: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-[7px]">
      <span className="text-[12px] shrink-0" style={{ color: "var(--text-secondary)", width: 68 }}>
        {label}
      </span>
      <label className="flex-1 relative cursor-pointer" style={{ height: 22, display: "block" }}>
        <div
          className="absolute inset-0 rounded-md"
          style={{ background: value, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }}
        />
        <input
          type="color"
          value={value}
          onChange={e => onChange(colorKey, e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer"
          style={{ width: "100%", height: "100%" }}
        />
      </label>
    </div>
  );
}

// ── Dropdown setting row ──────────────────────────────────────────────────────
function SettingRow({
  label, optionKey, value, options, onChange,
}: {
  label: string;
  optionKey: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (key: string, val: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-[7px]">
      <span className="text-[12px] shrink-0" style={{ color: "var(--text-secondary)", width: 68 }}>
        {label}
      </span>
      <div className="flex-1 relative">
        <select
          value={value}
          onChange={e => onChange(optionKey, e.target.value)}
          className="w-full appearance-none pr-7 pl-2 py-[3px] rounded-md text-[12px] outline-none cursor-pointer"
          style={{
            background: "var(--background-tertiary)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                     style={{ color: "var(--text-tertiary)" }} />
      </div>
    </div>
  );
}

function SectionHead({ label }: { label: string }) {
  return (
    <div className="px-4 pt-4 pb-1.5">
      <span className="text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>{label}</span>
    </div>
  );
}

// ── Config panel (Col 3) ─────────────────────────────────────────────────────
function ConfigPanel({
  mc, onColorChange, onSettingChange,
}: {
  mc: MetricConfig;
  onColorChange:   (key: string, val: string) => void;
  onSettingChange: (key: string, val: string) => void;
}) {
  const colorMetas   = METRIC_COLORS[mc.id];
  const settingMetas = METRIC_SETTINGS[mc.id];

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-3">
      {colorMetas.length > 0 && (
        <>
          <SectionHead label="菜单颜色" />
          {colorMetas.map(cm => (
            <ColorRow key={cm.key} label={cm.label} colorKey={cm.key}
              value={mc.colors[cm.key] ?? cm.default} onChange={onColorChange} />
          ))}
        </>
      )}
      {settingMetas.length > 0 && (
        <>
          <SectionHead label="菜单设置" />
          {settingMetas.map(sm => (
            <SettingRow key={sm.key} label={sm.label} optionKey={sm.key}
              value={mc.settings[sm.key] ?? sm.options[0].value}
              options={sm.options} onChange={onSettingChange} />
          ))}
        </>
      )}
      {colorMetas.length === 0 && settingMetas.length === 0 && (
        <div className="px-4 py-10 text-center">
          <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>该指标暂无可配置项</p>
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function PerfSettings() {
  const { config, update, toggle, updateMetric } = usePerfConfig();
  const [selectedId, setSelectedId] = useState<MetricId>("cpu");

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = config.metrics.findIndex(m => m.id === active.id);
      const newIdx = config.metrics.findIndex(m => m.id === over.id);
      update({ metrics: arrayMove(config.metrics, oldIdx, newIdx) });
    }
  };

  const selected = config.metrics.find(m => m.id === selectedId) ?? config.metrics[0];

  return (
    <div className="flex" style={{ minHeight: 360 }}>

      {/* ── Col 1: icon tabs (52px, draggable) ── */}
      <div
        className="shrink-0 py-1"
        style={{ width: 52, borderRight: "1px solid var(--border)" }}
      >
        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={config.metrics.map(m => m.id)} strategy={verticalListSortingStrategy}>
            {config.metrics.map(item => (
              <IconTab
                key={item.id}
                item={item}
                isSelected={item.id === selectedId}
                onSelect={setSelectedId}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {/* ── Col 2: live card + bar preview ── */}
      <div
        className="flex-1 min-w-0"
        style={{ borderRight: "1px solid var(--border)" }}
      >
        {selected && (
          <CardPreview
            mc={selected}
            onToggle={() => toggle(selectedId)}
          />
        )}
      </div>

      {/* ── Col 3: color + setting config (flex-1) ── */}
      <div className="flex-1 min-w-0">
        {selected && (
          <ConfigPanel
            mc={selected}
            onColorChange={(key, val) =>
              updateMetric(selectedId, { colors: { [key]: val } })
            }
            onSettingChange={(key, val) =>
              updateMetric(selectedId, { settings: { [key]: val } })
            }
          />
        )}
      </div>

    </div>
  );
}
