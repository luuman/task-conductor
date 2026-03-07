import type { SystemMetrics, ProcessInfo } from "../../lib/api";

export type MetricId = "cpu" | "mem" | "net" | "disk" | "sensors";

// ── Color / setting metadata ────────────────────────────────────────────────
export interface ColorMeta   { key: string; label: string; default: string }
export interface SettingMeta {
  key:     string;
  label:   string;
  options: { value: string; label: string }[];
}

export const METRIC_COLORS: Record<MetricId, ColorMeta[]> = {
  cpu: [
    { key: "user",      label: "perf.metricColors.cpu.user",      default: "#FF2D55" },
    { key: "sys",       label: "perf.metricColors.cpu.sys",       default: "#007AFF" },
    { key: "efficient", label: "perf.metricColors.cpu.efficient", default: "#FF2D55" },
    { key: "perf",      label: "perf.metricColors.cpu.perf",      default: "#007AFF" },
  ],
  mem: [
    { key: "used",   label: "perf.metricColors.mem.used",   default: "#FF2D55" },
    { key: "cached", label: "perf.metricColors.mem.cached", default: "#007AFF" },
  ],
  net: [
    { key: "out", label: "perf.metricColors.net.out", default: "#FF2D55" },
    { key: "in",  label: "perf.metricColors.net.in",  default: "#007AFF" },
  ],
  disk: [
    { key: "read",  label: "perf.metricColors.disk.read",  default: "#FF2D55" },
    { key: "write", label: "perf.metricColors.disk.write", default: "#007AFF" },
  ],
  sensors: [
    { key: "cpu",   label: "perf.metricColors.sensors.cpu",   default: "#007AFF" },
    { key: "nvme",  label: "perf.metricColors.sensors.nvme",  default: "#FF9F0A" },
    { key: "board", label: "perf.metricColors.sensors.board", default: "#BF5AF2" },
  ],
};

export const METRIC_SETTINGS: Record<MetricId, SettingMeta[]> = {
  cpu: [
    {
      key: "procFormat", label: "进程格式",
      options: [
        { value: "percent",  label: "0-100%" },
        { value: "absolute", label: "绝对值" },
      ],
    },
    {
      key: "procCount", label: "进程数量",
      options: [
        { value: "3",  label: "3"  },
        { value: "5",  label: "5"  },
        { value: "10", label: "10" },
      ],
    },
  ],
  mem: [],
  net: [
    {
      key: "unit", label: "速率单位",
      options: [
        { value: "auto", label: "自动"   },
        { value: "mbps", label: "MB/s"  },
        { value: "kbps", label: "KB/s"  },
      ],
    },
  ],
  disk: [
    {
      key: "unit", label: "速率单位",
      options: [
        { value: "auto", label: "自动"   },
        { value: "mbps", label: "MB/s"  },
        { value: "kbps", label: "KB/s"  },
      ],
    },
  ],
  sensors: [],
};

// ── Config types ────────────────────────────────────────────────────────────
export interface MetricConfig {
  id:       MetricId;
  enabled:  boolean;
  colors:   Record<string, string>;
  settings: Record<string, string>;
}

export interface PerfConfig {
  metrics: MetricConfig[];
}

// ── Defaults ─────────────────────────────────────────────────────────────────
export function defaultMetricConfig(id: MetricId): MetricConfig {
  return {
    id,
    enabled:  true,
    colors:   Object.fromEntries(METRIC_COLORS[id].map(c => [c.key, c.default])),
    settings: Object.fromEntries(METRIC_SETTINGS[id].map(s => [s.key, s.options[0].value])),
  };
}

export const DEFAULT_CONFIG: PerfConfig = {
  metrics: (["cpu", "mem", "net", "disk", "sensors"] as MetricId[]).map(defaultMetricConfig),
};

export const METRIC_LABEL: Record<MetricId, string> = {
  cpu: "CPU", mem: "内存", net: "网络", disk: "磁盘", sensors: "传感器",
};

// ── Data types ───────────────────────────────────────────────────────────────
export interface HistPt {
  cpu: number; cpu_user: number; cpu_sys: number; cpu_iowait: number;
  disk_r: number; disk_w: number;
  net_in: number; net_out: number;
  mem: number;
}

export interface PerfData {
  sys:   SystemMetrics | null;
  hist:  HistPt[];
  procs: { by_cpu: ProcessInfo[]; by_mem: ProcessInfo[] } | null;
}

export const ZERO_PT: HistPt = {
  cpu: 0, cpu_user: 0, cpu_sys: 0, cpu_iowait: 0,
  disk_r: 0, disk_w: 0, net_in: 0, net_out: 0, mem: 0,
};

export const HIST_LEN = 60;
