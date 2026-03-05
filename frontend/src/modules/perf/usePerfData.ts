import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import type { PerfData, HistPt } from "./types";
import { ZERO_PT, HIST_LEN } from "./types";

export function usePerfData(intervalMs = 4000): PerfData {
  const [sys, setSys]   = useState<PerfData["sys"]>(null);
  const [procs, setProcs] = useState<PerfData["procs"]>(null);
  const histRef = useRef<HistPt[]>([]);
  const [hist, setHist] = useState<HistPt[]>([]);

  useEffect(() => {
    let alive = true;
    const fetchAll = async () => {
      try {
        const s = await api.system();
        if (!alive) return;
        setSys(s);
        const pt: HistPt = {
          cpu:       s.cpu.percent,
          cpu_user:  s.cpu.user_pct   ?? 0,
          cpu_sys:   s.cpu.system_pct ?? 0,
          cpu_iowait:s.cpu.iowait_pct ?? 0,
          disk_r:    s.disk_io.read_mbps  ?? 0,
          disk_w:    s.disk_io.write_mbps ?? 0,
          net_in:    (s.network.in_kbps  ?? 0) / 1024,
          net_out:   (s.network.out_kbps ?? 0) / 1024,
          mem:       s.memory.percent,
        };
        histRef.current = [...histRef.current, pt].slice(-HIST_LEN);
        setHist([...histRef.current]);
      } catch { /* ignore */ }
      try {
        const p = await api.processes();
        if (!alive) return;
        setProcs(p);
      } catch { /* ignore */ }
    };
    fetchAll();
    const id = setInterval(fetchAll, intervalMs);
    return () => { alive = false; clearInterval(id); };
  }, [intervalMs]);

  void ZERO_PT; // keep import used
  return { sys, hist, procs };
}
