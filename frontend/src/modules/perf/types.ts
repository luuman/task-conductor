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
    { key: "user",      label: "用户",     default: "#FF2D55" },
    { key: "sys",       label: "系统",     default: "#007AFF" },
    { key: "efficient", label: "能效核心", default: "#FF2D55" },
    { key: "perf",      label: "性能核心", default: "#007AFF" },
  ],
  mem: [
    { key: "used",   label: "已用", default: "#FF2D55" },
    { key: "cached", label: "缓存", default: "#007AFF" },
  ],
  net: [
    { key: "out", label: "上传 ↑", default: "#FF2D55" },
    { key: "in",  label: "下载 ↓", default: "#007AFF" },
  ],
  disk: [
    { key: "read",  label: "读取", default: "#FF2D55" },
    { key: "write", label: "写入", default: "#007AFF" },
  ],
  sensors: [
    { key: "cpu",   label: "CPU 温度",  default: "#007AFF" },
    { key: "nvme",  label: "NVMe 温度", default: "#FF9F0A" },
    { key: "board", label: "主板温度",  default: "#BF5AF2" },
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
