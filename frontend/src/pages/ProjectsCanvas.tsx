// frontend/src/pages/ProjectsCanvas.tsx
// Packed-bubble chart — Dribbble reference + Orion dark theme
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
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

type BubbleData = { x: number; y: number; r: number; stats: ProjectStats };

// ── Status palette ─────────────────────────────────────────────────
const STATE_META: Record<VisualState, { base: string; glow: string; text: string; label: string }> = {
  running: { base: "#22c55e", glow: "#22c55e60", text: "#fff", label: "运行中" },
  failed:  { base: "#ef4444", glow: "#ef444460", text: "#fff", label: "异常"   },
  review:  { base: "#f59e0b", glow: "#f59e0b40", text: "#fff", label: "待审批" },
  queued:  { base: "#7b9ed9", glow: "#7b9ed940", text: "#fff", label: "排队中" },
  done:    { base: "#4477ff", glow: "#4477ff40", text: "#fff", label: "已完成" },
  idle:    { base: "#3c3c5c", glow: "#3c3c5c20", text: "#7878a8", label: "空闲" },
};

// Color variants within each state group
const STATE_VARIANTS: Record<VisualState, string[]> = {
  running: ["#22c55e","#16a34a","#4ade80","#15803d","#86efac"],
  failed:  ["#ef4444","#dc2626","#f87171","#b91c1c","#fca5a5"],
  review:  ["#f59e0b","#d97706","#fbbf24","#b45309","#fcd34d"],
  queued:  ["#7b9ed9","#6b8ec9","#93b5ea","#5b7ec0","#a5c4f0"],
  done:    ["#4477ff","#3366ee","#5588ff","#2255dd","#6699ff"],
  idle:    ["#3c3c5c","#32324c","#4a4a6c","#28283c","#56567c"],
};

const STAGE_LABEL: Record<string, string> = {
  input:"需求", analysis:"分析", prd:"PRD", ui:"UI",
  plan:"方案", dev:"开发", test:"测试", deploy:"部署",
  monitor:"监控", done:"完成",
};

const MIN_R = 36, MAX_R = 100;

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

// ── Force-directed packing ─────────────────────────────────────────
function packBubbles(stats: ProjectStats[]): BubbleData[] {
  if (stats.length === 0) return [];
  const sorted = [...stats].sort((a, b) => b.weight - a.weight);
  const maxW = sorted[0].weight;

  const items = sorted.map((s, i) => {
    const r     = bubbleRadius(s.weight, maxW);
    const angle = i * 2.39996; // golden angle
    const dist  = Math.sqrt(i) * r * 1.2;
    return {
      x: i === 0 ? 0 : Math.cos(angle) * dist,
      y: i === 0 ? 0 : Math.sin(angle) * dist,
      r, stats: s,
    };
  });

  // Iterative collision resolution
  const GAP = 14;
  for (let iter = 0; iter < 180; iter++) {
    const damp = 0.7 + 0.3 * (1 - iter / 180);
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const dx   = items[j].x - items[i].x;
        const dy   = items[j].y - items[i].y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const min  = items[i].r + items[j].r + GAP;
        if (dist < min) {
          const f = (min - dist) / dist * 0.5 * damp;
          items[i].x -= dx * f; items[i].y -= dy * f;
          items[j].x += dx * f; items[j].y += dy * f;
        }
      }
      // Gravity toward center
      items[i].x *= 1 - 0.008 * damp;
      items[i].y *= 1 - 0.008 * damp;
    }
  }
  return items;
}

// ── Statistics Panel (left side) ───────────────────────────────────
function StatsPanel({ allStats, colorMap, onSelect }: {
  allStats: ProjectStats[];
  colorMap: Record<number, string>;
  onSelect: (id: number) => void;
}) {
  const totalTasks = allStats.reduce((a, s) => a + s.total, 0);
  const totalRunning = allStats.reduce((a, s) => a + s.running, 0);
  const totalDone = allStats.reduce((a, s) => a + s.done, 0);
  const totalFailed = allStats.reduce((a, s) => a + s.failed, 0);

  // Donut chart data
  const segments = [
    { label: "运行中", count: totalRunning, color: "#22c55e" },
    { label: "已完成", count: totalDone, color: "#4477ff" },
    { label: "异常", count: totalFailed, color: "#ef4444" },
    { label: "其他", count: Math.max(0, totalTasks - totalRunning - totalDone - totalFailed), color: "#3c3c5c" },
  ].filter(s => s.count > 0);
  const total = Math.max(1, segments.reduce((a, s) => a + s.count, 0));

  // SVG donut
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

  // Sort projects by weight descending
  const sorted = [...allStats].sort((a, b) => b.weight - a.weight);

  return (
    <div style={{
      width: 220, flexShrink: 0, display: "flex", flexDirection: "column",
      borderRight: "1px solid var(--border)",
      background: "var(--background-secondary)",
      overflow: "hidden",
    }}>
      {/* Title */}
      <div style={{
        padding: "14px 16px 10px", borderBottom: "1px solid var(--border)",
        fontSize: 14, fontWeight: 700, color: "var(--text-primary)",
        letterSpacing: "-0.01em",
      }}>
        Statistics
      </div>

      {/* Donut chart */}
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

        {/* Legend */}
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

      {/* Divider */}
      <div style={{ margin: "6px 16px", borderTop: "1px solid var(--border-subtle)" }} />

      {/* Project list */}
      <div style={{
        padding: "4px 8px", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
        textTransform: "uppercase", color: "var(--text-tertiary)",
        marginBottom: 2,
      }}>
        项目排名
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
              {/* Rank */}
              <span style={{
                width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 700, fontFamily: "monospace",
                background: i < 3 ? `${color}22` : "var(--background-tertiary)",
                color: i < 3 ? color : "var(--text-tertiary)",
              }}>
                {i + 1}
              </span>

              {/* Color dot */}
              <div style={{
                width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                background: color,
                boxShadow: state === "running" ? `0 0 6px ${color}80` : undefined,
              }} />

              {/* Name + progress */}
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

              {/* Task count */}
              <span style={{ fontSize: 10, fontWeight: 600, fontFamily: "monospace", color: "var(--text-tertiary)", flexShrink: 0 }}>
                {s.total}
              </span>
            </button>
          );
        })}

        {sorted.length === 0 && (
          <div style={{ padding: "20px 0", textAlign: "center", fontSize: 11, color: "var(--text-tertiary)" }}>
            暂无项目
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
  const meta = STATE_META[state];
  const pct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  return (
    <div style={{
      position: "fixed", left: mouse.x + 16, top: mouse.y - 12,
      width: 200, zIndex: 1000, pointerEvents: "none",
      background: "var(--background-secondary)",
      borderRadius: 10,
      padding: "10px 12px",
      boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px var(--border), 0 0 20px ${color}15`,
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 24, height: 24, borderRadius: "50%", background: color, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 800, color: "#fff",
          boxShadow: `0 0 10px ${color}40`,
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
          {meta.label}
        </span>
      </div>

      {/* Mini stats */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {([
          ["任务", stats.total, "var(--text-secondary)"],
          ["运行", stats.running, "#22c55e"],
          ["完成", stats.done, "#4477ff"],
          ["异常", stats.failed, "#ef4444"],
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

      {/* Active stage */}
      {stats.activeStage && (
        <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 6 }}>
          当前阶段：<span style={{ color: meta.base, fontWeight: 600 }}>
            {STAGE_LABEL[stats.activeStage] ?? stats.activeStage}
          </span>
        </div>
      )}

      {/* Progress */}
      {stats.total > 0 && (
        <>
          <div style={{ height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${pct}%`, borderRadius: 2,
              background: `linear-gradient(90deg, ${color}99, ${color})`,
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
      {/* Left statistics panel */}
      <StatsPanel allStats={allStats} colorMap={colorMap} onSelect={onSelectProject} />

      {/* Main chart area */}
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
            {loading ? "加载中..." : `${projects.length} 项目 · 滚轮缩放 · 拖拽平移 · 双击进入`}
          </span>

          <div style={{ flex: 1 }} />

          {/* Legend */}
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
            <defs>
              {/* 3D sheen gradient */}
              <radialGradient id="bubble-sheen" cx="38%" cy="30%" r="60%">
                <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.18"/>
                <stop offset="100%" stopColor="#000000" stopOpacity="0.12"/>
              </radialGradient>
              {/* Glow filters */}
              <filter id="glow-active" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            <rect width="100%" height="100%" fill="var(--background)"
              onClick={() => setSelectedId(null)} />

            {/* Subtle grid dots */}
            <pattern id="grid-dots" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
              <circle cx="20" cy="20" r="0.5" fill="var(--border-subtle)" />
            </pattern>
            <rect width="100%" height="100%" fill="url(#grid-dots)" opacity="0.5"
              onClick={() => setSelectedId(null)} />

            <g transform={`translate(${offset.x},${offset.y}) scale(${scale})`}>
              {!loading && bubbles.map(({ x, y, r, stats }) => {
                const state = resolveState(stats);
                const color = colorMap[stats.project.id] ?? STATE_META[state].base;
                const meta  = STATE_META[state];
                const isHov = hoveredId === stats.project.id;
                const isSel = selectedId === stats.project.id;
                const hasFocus = hoveredId !== null || selectedId !== null;
                const groupOp = hasFocus && !isHov && !isSel ? 0.3 : 1;

                // Name truncation
                const maxChars = Math.max(3, Math.floor(r / 6.5));
                const label = stats.project.name.length <= maxChars
                  ? stats.project.name
                  : stats.project.name.substring(0, maxChars - 1) + "…";

                // Stage / status summary
                const statusLine = stats.running > 0
                  ? `${stats.running} 运行中`
                  : stats.pendingReview > 0
                  ? `${stats.pendingReview} 待审批`
                  : stats.failed > 0
                  ? `${stats.failed} 异常`
                  : stats.total > 0
                  ? `${stats.done}/${stats.total} 完成`
                  : "空闲";

                const pct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

                // Action button positions (around the bubble when selected)
                const actionBtns = [
                  { label: "进入", angle: -90, action: () => onSelectProject(stats.project.id) },
                  { label: "任务", angle: 0, action: () => onSelectProject(stats.project.id) },
                  { label: "详情", angle: 180, action: () => onSelectProject(stats.project.id) },
                ];

                return (
                  <g key={stats.project.id}
                    style={{ opacity: groupOp, transition: "opacity 0.25s ease" }}
                  >
                    {/* Soft shadow */}
                    <circle cx={x} cy={y + 2} r={r * 0.95} fill="rgba(0,0,0,0.3)"
                      filter="url(#glow-active)" style={{ opacity: 0.12 }} />

                    {/* Base circle */}
                    <circle cx={x} cy={y} r={r} fill={color}
                      style={{ transition: "r 0.3s, fill 0.3s" }}
                    />

                    {/* 3D sheen overlay */}
                    <circle cx={x} cy={y} r={r} fill="url(#bubble-sheen)" />

                    {/* ── Bubble content ── */}
                    {r >= 32 && (
                      <>
                        {/* Project name */}
                        <text x={x} y={r >= 55 ? y - r * 0.18 : y - 1}
                          textAnchor="middle" dominantBaseline="middle"
                          fill={meta.text} fillOpacity={0.95}
                          fontSize={r >= 80 ? 14 : r >= 60 ? 12 : r >= 45 ? 10 : 8}
                          fontWeight={700}
                          fontFamily="system-ui, -apple-system, sans-serif"
                          style={{ userSelect: "none", pointerEvents: "none" }}
                        >
                          {label}
                        </text>

                        {/* Status line */}
                        {r >= 55 && (
                          <text x={x} y={y + r * 0.08}
                            textAnchor="middle" dominantBaseline="middle"
                            fill={meta.text} fillOpacity={0.5}
                            fontSize={r >= 70 ? 9.5 : 8}
                            fontFamily="system-ui"
                            style={{ userSelect: "none", pointerEvents: "none" }}
                          >
                            {statusLine}
                          </text>
                        )}

                        {/* Progress bar (horizontal, inside bubble) */}
                        {r >= 55 && stats.total > 0 && (
                          <g style={{ pointerEvents: "none" }}>
                            <rect x={x - r * 0.45} y={y + r * 0.28} width={r * 0.9} height={3}
                              rx={1.5} fill="rgba(255,255,255,0.15)" />
                            <rect x={x - r * 0.45} y={y + r * 0.28}
                              width={r * 0.9 * (pct / 100)} height={3}
                              rx={1.5} fill="rgba(255,255,255,0.5)" />
                            <text x={x + r * 0.45 + 4} y={y + r * 0.3 + 1}
                              fontSize={7} fill={meta.text} fillOpacity={0.4}
                              fontFamily="monospace" dominantBaseline="middle"
                              style={{ userSelect: "none" }}
                            >
                              {pct}%
                            </text>
                          </g>
                        )}

                        {/* Active stage tag */}
                        {r >= 65 && stats.activeStage && (
                          <g style={{ pointerEvents: "none" }}>
                            <rect x={x - 18} y={y + r * 0.44} width={36} height={14}
                              rx={7} fill="rgba(255,255,255,0.15)" />
                            <text x={x} y={y + r * 0.44 + 7.5}
                              textAnchor="middle" dominantBaseline="middle"
                              fill={meta.text} fillOpacity={0.7}
                              fontSize={7.5} fontWeight={600}
                              fontFamily="system-ui"
                              style={{ userSelect: "none" }}
                            >
                              {STAGE_LABEL[stats.activeStage] ?? stats.activeStage}
                            </text>
                          </g>
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

                    {/* ── Action buttons (on click) ── */}
                    {isSel && actionBtns.map((btn, bi) => {
                      const rad = (btn.angle * Math.PI) / 180;
                      const dist = r + 28;
                      const bx = x + Math.cos(rad) * dist;
                      const by = y + Math.sin(rad) * dist;
                      return (
                        <g key={bi} style={{ cursor: "pointer" }}
                          onClick={(e) => { e.stopPropagation(); btn.action(); }}
                        >
                          <circle cx={bx} cy={by} r={16}
                            fill="var(--background-secondary)"
                            stroke={color} strokeWidth={1.5} strokeOpacity={0.6}
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
          {hoveredId && hoveredStats && (
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

        {/* Bottom metrics bar */}
        <BottomMetrics allStats={allStats} />
      </div>
    </div>
  );
}
