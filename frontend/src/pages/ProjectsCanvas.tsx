// frontend/src/pages/ProjectsCanvas.tsx
// Packed-bubble chart — Dribbble reference (flat, tight-packed, color-clustered)
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { api, type Project, type Task } from "../lib/api";

// ── Types ──────────────────────────────────────────────────────────
type VisualState = "running" | "failed" | "review" | "queued" | "done" | "idle";

type ProjectStats = {
  project: Project;
  total: number; running: number; done: number;
  failed: number; queued: number; pendingReview: number;
  activeStage: string | null;
  weight: number;
};

type BubbleData = { x: number; y: number; r: number; stats: ProjectStats; decorative?: boolean };

// ── Status palette ─────────────────────────────────────────────────
const STATE_META: Record<VisualState, { base: string; text: string }> = {
  running: { base: "#22c55e", text: "#fff" },
  failed:  { base: "#ef4444", text: "#fff" },
  review:  { base: "#f59e0b", text: "#fff" },
  queued:  { base: "#7b9ed9", text: "#fff" },
  done:    { base: "#4477ff", text: "#fff" },
  idle:    { base: "#3c3c5c", text: "#7878a8" },
};

function getStateLabel(t: (key: string) => string): Record<VisualState, string> {
  return {
    running: t('projectsCanvas.stateMeta.running'),
    failed: t('projectsCanvas.stateMeta.error'),
    review: t('projectsCanvas.stateMeta.approval'),
    queued: t('projectsCanvas.stateMeta.queued'),
    done: t('projectsCanvas.stateMeta.done'),
    idle: t('projectsCanvas.stateMeta.idle'),
  };
}

// Softer color variants for visual richness
const STATE_VARIANTS: Record<VisualState, string[]> = {
  running: ["#4ade80","#22c55e","#86efac","#16a34a","#a7f3d0"],
  failed:  ["#f87171","#ef4444","#fca5a5","#dc2626","#fecaca"],
  review:  ["#fbbf24","#f59e0b","#fcd34d","#d97706","#fde68a"],
  queued:  ["#93b5ea","#7b9ed9","#a5c4f0","#6b8ec9","#bfdbfe"],
  done:    ["#5588ff","#4477ff","#6699ff","#3366ee","#93b5ff"],
  idle:    ["#4a4a6c","#3c3c5c","#56567c","#32324c","#5e5e80"],
};

function getCanvasStageLabel(t: (key: string) => string): Record<string, string> {
  return {
    input: t('projectsCanvas.stageLabel.input'), analysis: t('projectsCanvas.stageLabel.analysis'),
    prd: t('projectsCanvas.stageLabel.prd'), ui: t('projectsCanvas.stageLabel.ui'),
    plan: t('projectsCanvas.stageLabel.plan'), dev: t('projectsCanvas.stageLabel.dev'),
    test: t('projectsCanvas.stageLabel.test'), deploy: t('projectsCanvas.stageLabel.deploy'),
    monitor: t('projectsCanvas.stageLabel.monitor'), done: t('projectsCanvas.stageLabel.done'),
  };
}

// State ordering for spatial clustering (same state → same region)
const STATE_ORDER: VisualState[] = ["failed", "review", "running", "queued", "done", "idle"];

const MIN_R = 12, MAX_R = 80;

// ── Helpers ────────────────────────────────────────────────────────
function resolveState(s: ProjectStats): VisualState {
  if (s.failed > 0)        return "failed";
  if (s.running > 0)       return "running";
  if (s.pendingReview > 0) return "review";
  if (s.queued > 0)        return "queued";
  if (s.done > 0 && s.done === s.total && s.total > 0) return "done";
  return "idle";
}

function bubbleRadius(weight: number, maxW: number): number {
  if (maxW <= 0) return (MIN_R + MAX_R) / 2;
  return MIN_R + Math.sqrt(weight / maxW) * (MAX_R - MIN_R);
}

function bubbleColor(state: VisualState, idx: number): string {
  const v = STATE_VARIANTS[state];
  return v[idx % v.length];
}

// ── Force-directed packing with color clustering ──────────────────
function packBubbles(stats: ProjectStats[]): BubbleData[] {
  if (stats.length === 0) return [];

  // Sort by state group first, then by weight within group
  const sorted = [...stats].sort((a, b) => {
    const sa = STATE_ORDER.indexOf(resolveState(a));
    const sb = STATE_ORDER.indexOf(resolveState(b));
    if (sa !== sb) return sa - sb;
    return b.weight - a.weight;
  });
  const maxW = Math.max(...sorted.map(s => s.weight));

  // Place items using golden angle, with state-based angular offset
  const stateAngles: Record<string, number> = {};
  let angleIdx = 0;
  const sectorSize = (2 * Math.PI) / STATE_ORDER.length;

  const items: BubbleData[] = sorted.map((s, i) => {
    const state = resolveState(s);
    if (!(state in stateAngles)) {
      stateAngles[state] = angleIdx * sectorSize;
      angleIdx++;
    }
    const r = bubbleRadius(s.weight, maxW);
    const baseAngle = stateAngles[state];
    const jitter = (i * 2.39996) * 0.35; // golden angle, dampened
    const angle = baseAngle + jitter;
    const dist = Math.sqrt(i + 1) * r * 0.9;
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      r, stats: s,
    };
  });

  // Add decorative small dots around each state cluster
  const decorDots: BubbleData[] = [];
  const dummyStats: ProjectStats = {
    project: { id: -1, name: "" } as Project,
    total: 0, running: 0, done: 0, failed: 0, queued: 0, pendingReview: 0,
    activeStage: null, weight: 0,
  };

  // For each state group, add 2-4 tiny dots nearby
  const stateItems: Record<string, BubbleData[]> = {};
  items.forEach(item => {
    const st = resolveState(item.stats);
    if (!stateItems[st]) stateItems[st] = [];
    stateItems[st].push(item);
  });

  Object.entries(stateItems).forEach(([_state, group]) => {
    if (group.length === 0) return;
    // Find centroid of group
    const cx = group.reduce((a, b) => a + b.x, 0) / group.length;
    const cy = group.reduce((a, b) => a + b.y, 0) / group.length;
    const maxR = Math.max(...group.map(g => g.r));
    const dotCount = Math.min(4, Math.max(2, group.length));
    for (let d = 0; d < dotCount; d++) {
      const angle = (d / dotCount) * Math.PI * 2 + Math.random() * 0.5;
      const dist = maxR * 1.8 + Math.random() * maxR * 0.8;
      const dotR = 3 + Math.random() * 6;
      decorDots.push({
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        r: dotR,
        stats: { ...dummyStats, project: { ...dummyStats.project, id: -(decorDots.length + 100) } },
        decorative: true,
      });
    }
  });

  const all = [...items, ...decorDots];

  // Collision resolution — tight packing
  const GAP = 3;
  for (let iter = 0; iter < 250; iter++) {
    const damp = 0.7 + 0.3 * (1 - iter / 250);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const dx   = all[j].x - all[i].x;
        const dy   = all[j].y - all[i].y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const min  = all[i].r + all[j].r + GAP;
        if (dist < min) {
          const f = (min - dist) / dist * 0.5 * damp;
          all[i].x -= dx * f; all[i].y -= dy * f;
          all[j].x += dx * f; all[j].y += dy * f;
        }
      }
      // Stronger gravity toward center for compact cluster
      all[i].x *= 1 - 0.012 * damp;
      all[i].y *= 1 - 0.012 * damp;
    }
  }
  return all;
}

// ── Statistics Panel (left side) ───────────────────────────────────
function StatsPanel({ allStats, colorMap, onSelect }: {
  allStats: ProjectStats[];
  colorMap: Record<number, string>;
  onSelect: (id: number) => void;
}) {
  const { t } = useTranslation();
  const stateLabel = getStateLabel(t);
  const totalTasks = allStats.reduce((a, s) => a + s.total, 0);
  const totalRunning = allStats.reduce((a, s) => a + s.running, 0);
  const totalDone = allStats.reduce((a, s) => a + s.done, 0);
  const totalFailed = allStats.reduce((a, s) => a + s.failed, 0);

  // Donut chart
  const segments = [
    { label: stateLabel.running, count: totalRunning, color: "#22c55e" },
    { label: stateLabel.done, count: totalDone, color: "#4477ff" },
    { label: stateLabel.failed, count: totalFailed, color: "#ef4444" },
    { label: stateLabel.idle, count: Math.max(0, totalTasks - totalRunning - totalDone - totalFailed), color: "#3c3c5c" },
  ].filter(s => s.count > 0);
  const total = Math.max(1, segments.reduce((a, s) => a + s.count, 0));

  const donutR = 36, donutW = 7;
  let cumAngle = -Math.PI / 2;
  const arcs = segments.map(seg => {
    const frac = seg.count / total;
    const startAngle = cumAngle;
    cumAngle += frac * 2 * Math.PI;
    const endAngle = cumAngle;
    const gap = 0.03;
    const sa = startAngle + gap;
    const ea = endAngle - gap;
    const largeArc = ea - sa > Math.PI ? 1 : 0;
    return {
      ...seg,
      d: `M ${50 + donutR * Math.cos(sa)} ${50 + donutR * Math.sin(sa)} A ${donutR} ${donutR} 0 ${largeArc} 1 ${50 + donutR * Math.cos(ea)} ${50 + donutR * Math.sin(ea)}`,
    };
  });

  const sorted = [...allStats].sort((a, b) => b.weight - a.weight);

  return (
    <div style={{
      width: 220, flexShrink: 0, display: "flex", flexDirection: "column",
      borderRight: "1px solid var(--border)",
      background: "var(--background-secondary)",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "14px 16px 10px", borderBottom: "1px solid var(--border)",
        fontSize: 14, fontWeight: 700, color: "var(--text-primary)",
        letterSpacing: "-0.01em",
      }}>
        Statistics
      </div>

      <div style={{ padding: "16px 16px 8px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <svg viewBox="0 0 100 100" width={100} height={100}>
          {arcs.map((arc, i) => (
            <path key={i} d={arc.d} fill="none" stroke={arc.color}
              strokeWidth={donutW} strokeLinecap="round" />
          ))}
          <text x={50} y={47} textAnchor="middle" fill="var(--text-primary)"
            fontSize={18} fontWeight={800} fontFamily="system-ui">
            {totalTasks}
          </text>
          <text x={50} y={62} textAnchor="middle" fill="var(--text-tertiary)"
            fontSize={8} fontFamily="system-ui">
            Total Tasks
          </text>
        </svg>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", marginTop: 10, justifyContent: "center" }}>
          {segments.map(seg => (
            <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: seg.color, flexShrink: 0 }} />
              <span style={{ color: "var(--text-secondary)" }}>{seg.label}</span>
              <span style={{ color: "var(--text-tertiary)", fontWeight: 600, fontFamily: "monospace" }}>{seg.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ margin: "6px 16px", borderTop: "1px solid var(--border-subtle)" }} />

      <div style={{
        padding: "4px 8px", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
        textTransform: "uppercase", color: "var(--text-tertiary)",
        marginBottom: 2,
      }}>
        {t('projectsCanvas.statsPanel.projectRanking')}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "0 8px 12px" }}>
        {sorted.map((s, i) => {
          const state = resolveState(s);
          const meta = STATE_META[state];
          const color = colorMap[s.project.id] ?? meta.base;
          const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
          return (
            <button key={s.project.id} onClick={() => onSelect(s.project.id)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "7px 8px", borderRadius: 8, border: "none", cursor: "pointer",
                background: "transparent", textAlign: "left",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--background-tertiary)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{
                width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 700, fontFamily: "monospace",
                background: i < 3 ? `${color}22` : "var(--background-tertiary)",
                color: i < 3 ? color : "var(--text-tertiary)",
              }}>
                {i + 1}
              </span>
              <div style={{
                width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                background: color,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: "var(--text-primary)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {s.project.name}
                </div>
                {s.total > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <div style={{
                      flex: 1, height: 2, background: "var(--border)",
                      borderRadius: 1, overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%", width: `${pct}%`,
                        background: color, borderRadius: 1,
                        transition: "width 0.3s",
                      }} />
                    </div>
                    <span style={{ fontSize: 9, fontFamily: "monospace", color: "var(--text-tertiary)", flexShrink: 0 }}>
                      {pct}%
                    </span>
                  </div>
                )}
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, fontFamily: "monospace", color: "var(--text-tertiary)", flexShrink: 0 }}>
                {s.total}
              </span>
            </button>
          );
        })}
        {sorted.length === 0 && (
          <div style={{ padding: "20px 0", textAlign: "center", fontSize: 11, color: "var(--text-tertiary)" }}>
            {t('projectsCanvas.statsPanel.noProjects')}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tooltip ────────────────────────────────────────────────────────
function Tooltip({ stats, state, color, mouse }: {
  stats: ProjectStats; state: VisualState; color: string; mouse: { x: number; y: number };
}) {
  const { t } = useTranslation();
  const stateLabel = getStateLabel(t);
  const STAGE_LABEL = getCanvasStageLabel(t);
  const meta = STATE_META[state];
  const pct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  return (
    <div style={{
      position: "fixed", left: mouse.x + 16, top: mouse.y - 12,
      width: 200, zIndex: 1000, pointerEvents: "none",
      background: "var(--background-secondary)",
      borderRadius: 10,
      padding: "10px 12px",
      boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px var(--border)`,
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 24, height: 24, borderRadius: "50%", background: color, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 800, color: "#fff",
        }}>
          {stats.project.name[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {stats.project.name}
          </div>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 700, color: meta.base,
          background: `${meta.base}18`, borderRadius: 4, padding: "2px 6px",
        }}>
          {stateLabel[state]}
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {([
          [t('projectsCanvas.tooltip.tasks'), stats.total, "var(--text-secondary)"],
          [t('projectsCanvas.tooltip.running'), stats.running, "#22c55e"],
          [t('projectsCanvas.tooltip.done'), stats.done, "#4477ff"],
          [t('projectsCanvas.tooltip.error'), stats.failed, "#ef4444"],
        ] as [string, number, string][]).map(([k, v, c]) => (
          <div key={k} style={{
            flex: 1, textAlign: "center",
            background: "var(--background-tertiary)", borderRadius: 6, padding: "4px 2px",
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: v > 0 ? c : "var(--text-tertiary)" }}>{v}</div>
            <div style={{ fontSize: 7, color: "var(--text-tertiary)", letterSpacing: "0.04em" }}>{k}</div>
          </div>
        ))}
      </div>

      {stats.activeStage && (
        <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 6 }}>
          {t('projectsCanvas.tooltip.currentStage')}{'：'}<span style={{ color: meta.base, fontWeight: 600 }}>
            {STAGE_LABEL[stats.activeStage] ?? stats.activeStage}
          </span>
        </div>
      )}

      {stats.total > 0 && (
        <>
          <div style={{ height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${pct}%`, borderRadius: 2,
              background: color,
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginTop: 3, color: "var(--text-tertiary)" }}>
            <span>完成进度</span><span style={{ color: meta.base, fontWeight: 600 }}>{pct}%</span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Bottom Metrics Bar ─────────────────────────────────────────────
function BottomMetrics({ allStats }: { allStats: ProjectStats[] }) {
  const totalProjects = allStats.length;
  const totalTasks = allStats.reduce((a, s) => a + s.total, 0);
  const totalRunning = allStats.reduce((a, s) => a + s.running, 0);
  const totalDone = allStats.reduce((a, s) => a + s.done, 0);
  const totalFailed = allStats.reduce((a, s) => a + s.failed, 0);

  const items = [
    { label: "PROJECTS", value: totalProjects, color: "var(--accent)" },
    { label: "TOTAL TASKS", value: totalTasks, color: "var(--text-primary)" },
    { label: "RUNNING", value: totalRunning, color: "#22c55e" },
    { label: "COMPLETED", value: totalDone, color: "#4477ff" },
    { label: "FAILED", value: totalFailed, color: "#ef4444" },
  ];

  return (
    <div style={{
      display: "flex", justifyContent: "center", gap: 48,
      padding: "12px 24px",
      borderTop: "1px solid var(--border)",
      background: "var(--background-secondary)",
      flexShrink: 0,
    }}>
      {items.map(item => (
        <div key={item.label} style={{ textAlign: "center" }}>
          <div style={{
            fontSize: 24, fontWeight: 800, color: item.color,
            fontFamily: "system-ui", letterSpacing: "-0.02em",
            lineHeight: 1,
          }}>
            {item.value.toLocaleString()}
          </div>
          <div style={{
            fontSize: 8, fontWeight: 600, letterSpacing: "0.12em",
            color: "var(--text-tertiary)", marginTop: 4,
            textTransform: "uppercase",
          }}>
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────
interface ProjectsCanvasProps {
  projects: Project[];
  onSelectProject: (id: number) => void;
  onOpenTask: (id: number) => void;
}

export default function ProjectsCanvas({
  projects, onSelectProject, onOpenTask: _onOpenTask,
}: ProjectsCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef  = useRef<SVGSVGElement>(null);
  const [tasksMap, setTasksMap] = useState<Record<number, Task[]>>({});
  const [loading, setLoading]   = useState(true);

  const [scale, setScale]   = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPt   = useRef({ x: 0, y: 0 });

  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mousePos, setMousePos]   = useState({ x: 0, y: 0 });

  // Fetch tasks
  useEffect(() => {
    if (projects.length === 0) { setLoading(false); return; }
    let dead = false; setLoading(true);
    Promise.all(projects.map(p =>
      api.projects.tasks(p.id).then(t => ({ id: p.id, tasks: t }))
        .catch(() => ({ id: p.id, tasks: [] as Task[] }))
    )).then(res => {
      if (dead) return;
      const m: Record<number, Task[]> = {};
      res.forEach(({ id, tasks }) => { m[id] = tasks; });
      setTasksMap(m); setLoading(false);
    });
    return () => { dead = true; };
  }, [projects]);

  // Build stats + assign colors
  const { allStats, colorMap } = useMemo(() => {
    const stagePri = ["deploy","monitor","dev","test","plan","ui","prd","analysis","input"];
    const stateCount: Record<string, number> = {};
    const cmap: Record<number, string> = {};

    const stats = projects.map(p => {
      const tasks = tasksMap[p.id] ?? [];
      const running = tasks.filter(t => t.status === "running").length;
      const done    = tasks.filter(t => t.status === "done").length;
      const failed  = tasks.filter(t => t.status === "failed").length;
      const queued  = tasks.filter(t => t.status === "queued").length;
      const pendingReview = tasks.filter(t => t.status === "waiting_review").length;
      const weight  = running * 10 + failed * 8 + pendingReview * 6 + queued * 5 + done + tasks.length * 0.5;
      const active  = tasks.filter(t => t.status === "running" || t.status === "waiting_review");
      let activeStage: string | null = null;
      for (const stage of stagePri)
        if (active.some(t => t.stage === stage)) { activeStage = stage; break; }
      return { project: p, total: tasks.length, running, done, failed, queued,
               pendingReview, activeStage, weight };
    });

    stats.forEach(s => {
      const state = resolveState(s);
      const idx = stateCount[state] ?? 0;
      stateCount[state] = idx + 1;
      cmap[s.project.id] = bubbleColor(state, idx);
    });

    return { allStats: stats, colorMap: cmap };
  }, [projects, tasksMap]);

  const bubbles = useMemo(() => packBubbles(allStats), [allStats]);

  // Assign colors for decorative dots (inherit from nearest state group)
  const decorColorMap = useMemo(() => {
    const dmap: Record<number, string> = {};
    bubbles.forEach(b => {
      if (b.decorative && b.stats.project.id < 0) {
        // Find nearest real bubble
        let nearest: BubbleData | null = null;
        let minDist = Infinity;
        bubbles.forEach(other => {
          if (other.decorative) return;
          const d = Math.hypot(b.x - other.x, b.y - other.y);
          if (d < minDist) { minDist = d; nearest = other; }
        });
        if (nearest) {
          const state = resolveState((nearest as BubbleData).stats);
          const v = STATE_VARIANTS[state];
          dmap[b.stats.project.id] = v[Math.abs(b.stats.project.id) % v.length];
        } else {
          dmap[b.stats.project.id] = "#3c3c5c";
        }
      }
    });
    return dmap;
  }, [bubbles]);

  // Center view on load
  useEffect(() => {
    if (loading || !wrapRef.current) return;
    const { width, height } = wrapRef.current.getBoundingClientRect();
    setOffset({ x: width / 2, y: height / 2 });
  }, [loading]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragging.current = true; lastPt.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    if (!dragging.current) return;
    const dx = e.clientX - lastPt.current.x, dy = e.clientY - lastPt.current.y;
    lastPt.current = { x: e.clientX, y: e.clientY };
    setOffset(o => ({ x: o.x + dx, y: o.y + dy }));
  }, []);
  const onMouseUp = useCallback(() => { dragging.current = false; }, []);
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale(s => Math.min(4, Math.max(0.15, s * (e.deltaY > 0 ? 0.92 : 1.09))));
  }, []);
  const resetView = () => {
    setScale(1);
    if (wrapRef.current) {
      const { width, height } = wrapRef.current.getBoundingClientRect();
      setOffset({ x: width / 2, y: height / 2 });
    }
  };

  const hoveredStats = allStats.find(s => s.project.id === hoveredId);

  return (
    <div style={{
      display: "flex", height: "100%",
      background: "var(--background)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <StatsPanel allStats={allStats} colorMap={colorMap} onSelect={onSelectProject} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
          padding: "8px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--background-secondary)",
        }}>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
            color: "var(--accent)", background: "var(--accent-subtle)",
            borderRadius: 4, padding: "3px 8px",
          }}>
            Bubble Chart
          </span>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {loading ? "加载中..." : `${projects.length} 项目 · 滚轮缩放 · 拖拽平移 · 点击操作`}
          </span>

          <div style={{ flex: 1 }} />

          {(Object.entries(STATE_META) as [VisualState, typeof STATE_META[VisualState]][])
            .filter(([k]) => k !== "idle")
            .map(([k, v]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--text-tertiary)" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: v.base, flexShrink: 0 }} />
              {v.label}
            </div>
          ))}

          <button onClick={resetView} style={{
            marginLeft: 6, fontSize: 10, color: "var(--text-secondary)",
            background: "var(--background-tertiary)",
            border: "1px solid var(--border)", borderRadius: 6,
            padding: "4px 10px", cursor: "pointer",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--border)")}
          onMouseLeave={e => (e.currentTarget.style.background = "var(--background-tertiary)")}
          >
            复位
          </button>
        </div>

        {/* Canvas */}
        <div ref={wrapRef} style={{ flex: 1, position: "relative", overflow: "hidden", cursor: "grab" }}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove}
          onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
          onWheel={onWheel}
        >
          <svg ref={svgRef} width="100%" height="100%" style={{ display: "block" }}>
            <rect width="100%" height="100%" fill="var(--background)"
              onClick={() => setSelectedId(null)} />

            <g transform={`translate(${offset.x},${offset.y}) scale(${scale})`}>
              {!loading && bubbles.map(({ x, y, r, stats, decorative }) => {
                if (decorative) {
                  const dColor = decorColorMap[stats.project.id] ?? "#3c3c5c";
                  return (
                    <circle key={stats.project.id} cx={x} cy={y} r={r}
                      fill={dColor} opacity={0.5} />
                  );
                }

                const state = resolveState(stats);
                const color = colorMap[stats.project.id] ?? STATE_META[state].base;
                const meta  = STATE_META[state];
                const isHov = hoveredId === stats.project.id;
                const isSel = selectedId === stats.project.id;
                const hasFocus = hoveredId !== null || selectedId !== null;
                const groupOp = hasFocus && !isHov && !isSel ? 0.35 : 1;

                // Name truncation
                const maxChars = Math.max(3, Math.floor(r / 6));
                const label = stats.project.name.length <= maxChars
                  ? stats.project.name
                  : stats.project.name.substring(0, maxChars - 1) + "…";

                // Status summary
                const statusLine = stats.running > 0
                  ? `${stats.running} 运行中`
                  : stats.pendingReview > 0
                  ? `${stats.pendingReview} 待审批`
                  : stats.failed > 0
                  ? `${stats.failed} 异常`
                  : stats.total > 0
                  ? `${stats.done}/${stats.total} 完成`
                  : "空闲";

                // Action buttons
                const actionBtns = [
                  { label: "进入项目", angle: -60, action: () => onSelectProject(stats.project.id) },
                  { label: "查看任务", angle: 0, action: () => onSelectProject(stats.project.id) },
                  { label: "运行流水线", angle: 60, action: () => onSelectProject(stats.project.id) },
                ];

                return (
                  <g key={stats.project.id}
                    style={{ opacity: groupOp, transition: "opacity 0.25s ease" }}
                  >
                    {/* Flat circle — no shadow, no sheen */}
                    <circle cx={x} cy={y} r={isSel ? r + 2 : r} fill={color}
                      style={{ transition: "r 0.2s" }}
                    />

                    {/* ── Content inside bubble ── */}
                    {r >= 28 && (
                      <>
                        <text x={x} y={r >= 50 ? y - r * 0.15 : y + 1}
                          textAnchor="middle" dominantBaseline="middle"
                          fill={meta.text} fillOpacity={0.95}
                          fontSize={r >= 70 ? 13 : r >= 50 ? 11 : r >= 38 ? 9 : 7.5}
                          fontWeight={700}
                          fontFamily="system-ui, -apple-system, sans-serif"
                          style={{ userSelect: "none", pointerEvents: "none" }}
                        >
                          {label}
                        </text>

                        {r >= 50 && (
                          <text x={x} y={y + r * 0.15}
                            textAnchor="middle" dominantBaseline="middle"
                            fill={meta.text} fillOpacity={0.45}
                            fontSize={r >= 60 ? 9 : 7.5}
                            fontFamily="system-ui"
                            style={{ userSelect: "none", pointerEvents: "none" }}
                          >
                            {statusLine}
                          </text>
                        )}
                      </>
                    )}

                    {/* Hit area */}
                    <circle cx={x} cy={y} r={r} fill="transparent"
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() => setHoveredId(stats.project.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(prev => prev === stats.project.id ? null : stats.project.id);
                      }}
                    />

                    {/* ── Action buttons (radiate out on click) ── */}
                    {isSel && actionBtns.map((btn, bi) => {
                      const rad = (btn.angle * Math.PI) / 180;
                      const dist = r + 32;
                      const bx = x + Math.cos(rad) * dist;
                      const by = y + Math.sin(rad) * dist;
                      const btnW = 56, btnH = 20;
                      return (
                        <g key={bi} style={{ cursor: "pointer" }}
                          onClick={(e) => { e.stopPropagation(); btn.action(); }}
                        >
                          <rect x={bx - btnW / 2} y={by - btnH / 2}
                            width={btnW} height={btnH} rx={10}
                            fill="var(--background-secondary)"
                            stroke={color} strokeWidth={1.2} strokeOpacity={0.5}
                          />
                          <text x={bx} y={by + 0.5}
                            textAnchor="middle" dominantBaseline="middle"
                            fill={color} fontSize={8} fontWeight={600}
                            fontFamily="system-ui"
                            style={{ userSelect: "none" }}
                          >
                            {btn.label}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Empty state */}
          {!loading && projects.length === 0 && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ textAlign: "center", color: "var(--text-tertiary)" }}>
                <div style={{ fontSize: 48, marginBottom: 10, opacity: 0.15 }}>◉</div>
                <div style={{ fontSize: 13 }}>暂无项目，请先创建项目</div>
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ display: "flex", gap: 7 }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 8, height: 8, borderRadius: "50%", background: "var(--accent)",
                    animation: `dotPulse 1.2s ease-in-out ${i * 0.22}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* Tooltip */}
          {hoveredId && hoveredStats && !selectedId && (
            <Tooltip
              stats={hoveredStats}
              state={resolveState(hoveredStats)}
              color={colorMap[hoveredStats.project.id] ?? "#4477ff"}
              mouse={mousePos}
            />
          )}

          {/* Zoom badge */}
          <div style={{
            position: "absolute", bottom: 12, right: 12, fontSize: 10,
            color: "var(--text-tertiary)",
            background: "var(--background-secondary)",
            borderRadius: 5, padding: "3px 8px",
            border: "1px solid var(--border)",
          }}>
            {Math.round(scale * 100)}%
          </div>
        </div>

        <BottomMetrics allStats={allStats} />
      </div>
    </div>
  );
}
