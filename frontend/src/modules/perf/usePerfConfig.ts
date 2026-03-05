import { useState, useCallback, useEffect } from "react";
import type { PerfConfig, MetricConfig, MetricId } from "./types";
import { DEFAULT_CONFIG, defaultMetricConfig } from "./types";

const STORAGE_KEY = "tc_perf_config";

function migrate(raw: Record<string, unknown>): MetricConfig {
  const id  = raw.id as MetricId;
  const def = defaultMetricConfig(id);
  return {
    id,
    enabled:  typeof raw.enabled === "boolean" ? raw.enabled : true,
    colors:   { ...def.colors,   ...(raw.colors   as Record<string, string> | undefined ?? {}) },
    settings: { ...def.settings, ...(raw.settings as Record<string, string> | undefined ?? {}) },
  };
}

function load(): PerfConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { metrics: Record<string, unknown>[] };
      const migrated = parsed.metrics.map(migrate);
      const ids = migrated.map(m => m.id);
      const missing = DEFAULT_CONFIG.metrics.filter(m => !ids.includes(m.id));
      return { metrics: [...migrated, ...missing] };
    }
  } catch { /* ignore */ }
  return DEFAULT_CONFIG;
}

function persist(c: PerfConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch { /* ignore */ }
}

// ── Module-level shared store（所有 usePerfConfig 共享同一份状态）──────────────
type Listener = (c: PerfConfig) => void;
const _listeners = new Set<Listener>();
let _current: PerfConfig = load();

function _dispatch(next: PerfConfig) {
  _current = next;
  persist(next);
  _listeners.forEach(l => l(next));
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function usePerfConfig() {
  const [config, setLocal] = useState<PerfConfig>(() => _current);

  useEffect(() => {
    // 挂载时同步最新状态，然后订阅后续变化
    setLocal(_current);
    _listeners.add(setLocal);
    return () => { _listeners.delete(setLocal); };
  }, []);

  const update = useCallback((next: PerfConfig) => {
    _dispatch(next);
  }, []);

  const toggle = useCallback((id: string) => {
    _dispatch({
      metrics: _current.metrics.map(m =>
        m.id === id ? { ...m, enabled: !m.enabled } : m
      ),
    });
  }, []);

  const updateMetric = useCallback((id: string, patch: {
    colors?:   Record<string, string>;
    settings?: Record<string, string>;
  }) => {
    _dispatch({
      metrics: _current.metrics.map(m => m.id !== id ? m : {
        ...m,
        colors:   patch.colors   ? { ...m.colors,   ...patch.colors   } : m.colors,
        settings: patch.settings ? { ...m.settings, ...patch.settings } : m.settings,
      }),
    });
  }, []);

  return { config, update, toggle, updateMetric };
}
