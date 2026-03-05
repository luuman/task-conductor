// frontend/src/pages/ProjectsCanvas.tsx
// Packed-bubble chart — close to the Dribbble reference design
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

// ── Status → color palette (matches reference: green/red/blue groups) ──
const STATE_FILL: Record<VisualState, { fill: string; text: string; label: string }> = {
  running: { fill: "#4caf7a", text: "#fff",     label: "运行中" },
  failed:  { fill: "#e05a5a", text: "#fff",     label: "异常"   },
  review:  { fill: "#f0a030", text: "#fff",     label: "待审批" },
  queued:  { fill: "#7b9ed9", text: "#fff",     label: "排队中" },
  done:    { fill: "#5b9bd5", text: "#fff",     label: "已完成" },
  idle:    { fill: "#b0bcd8", text: "#5a6a8a",  label: "空项目" },
};

// Within a status group, vary brightness by index so adjacent bubbles differ
const STATUS_VARIANTS: Record<VisualState, string[]> = {
  running: ["#4caf7a","#3d9e6b","#5dbf89","#6acf96","#2d8e5a"],
  failed:  ["#e05a5a","#d04a4a","#ea6a6a","#c83e3e","#f07070"],
  review:  ["#f0a030","#e09020","#f5b040","#d88015","#f8c060"],
  queued:  ["#7b9ed9","#6b8ec9","#8baeea","#5b7ec0","#9bc0f0"],
  done:    ["#5b9bd5","#4b8bc5","#6babd5","#3b7ab5","#7bbae0"],
  idle:    ["#b0bcd8","#a0acc8","#c0cce8","#909cb8","#d0dcea"],
};

const STAGE_LABEL: Record<string, string> = {
  input:"需求输入", analysis:"需求分析", prd:"PRD",
  ui:"UI设计", plan:"技术方案", dev:"开发实现",
  test:"测试", deploy:"部署", monitor:"监控", done:"完成",
};

const MIN_R = 28, MAX_R = 86;

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

// Assign a variant color within the group so neighboring bubbles differ
function bubbleColor(state: VisualState, idx: number): string {
  const v = STATUS_VARIANTS[state];
  return v[idx % v.length];
}

// ── Force-directed packing ─────────────────────────────────────────
function packBubbles(stats: ProjectStats[]): BubbleData[] {
  if (stats.length === 0) return [];
  const sorted = [...stats].sort((a, b) => b.weight - a.weight);
  const maxW = sorted[0].weight;

  const items = sorted.map((s, i) => {
    const r     = bubbleRadius(s.weight, maxW);
    const angle = i * 2.39996;
    const dist  = Math.sqrt(i) * r * 1.3;
    return {
      x: i === 0 ? 0 : Math.cos(angle) * dist,
      y: i === 0 ? 0 : Math.sin(angle) * dist,
      r, stats: s,
    };
  });

  const GAP = 2; // very tight packing
  for (let iter = 0; iter < 150; iter++) {
    const damp = 0.7 + 0.3 * (1 - iter / 150);
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
      items[i].x *= 1 - 0.007 * damp;
      items[i].y *= 1 - 0.007 * damp;
    }
  }
  return items;
}

// ── Tooltip ────────────────────────────────────────────────────────
function Tooltip({ stats, state, color, mouse }: {
  stats: ProjectStats; state: VisualState; color: string; mouse: { x:number; y:number };
}) {
  const sf  = STATE_FILL[state];
  const pct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
  return (
    <div style={{
      position: "fixed", left: mouse.x + 16, top: mouse.y - 12,
      width: 220, zIndex: 1000, pointerEvents: "none",
      background: "#fff",
      borderRadius: 12,
      padding: "12px 14px",
      boxShadow: "0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)",
      border: "1px solid rgba(0,0,0,0.06)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
        <div style={{
          width:28, height:28, borderRadius:"50%", background:color, flexShrink:0,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:11, fontWeight:800, color:"#fff",
        }}>
          {stats.project.name[0].toUpperCase()}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#1a2030", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {stats.project.name}
          </div>
          <div style={{ fontSize:10, color:"#8090a8", marginTop:1 }}>
            {stats.project.execution_mode || "smart"} 模式
          </div>
        </div>
        <span style={{
          fontSize:10, fontWeight:700, color:sf.fill,
          background:`${sf.fill}18`, borderRadius:5, padding:"2px 7px", flexShrink:0,
        }}>
          {sf.label}
        </span>
      </div>

      {/* Stats row */}
      <div style={{ display:"flex", gap:10, marginBottom:10 }}>
        {([
          ["任务", stats.total,  "#546080"],
          ["运行", stats.running, "#4caf7a"],
          ["完成", stats.done,    "#5b9bd5"],
          ["异常", stats.failed,  "#e05a5a"],
        ] as [string,number,string][]).map(([k,v,c]) => (
          <div key={k} style={{ flex:1, textAlign:"center",
            background:"#f5f7fc", borderRadius:7, padding:"5px 2px" }}>
            <div style={{ fontSize:15, fontWeight:700, color: v>0 ? c : "#c0ccdc" }}>{v}</div>
            <div style={{ fontSize:8, color:"#9aacbe", letterSpacing:"0.04em" }}>{k}</div>
          </div>
        ))}
      </div>

      {/* Active stage */}
      {stats.activeStage && (
        <div style={{ fontSize:10, color:"#8090a8", marginBottom:8 }}>
          当前阶段：<span style={{ color:sf.fill, fontWeight:600 }}>
            {STAGE_LABEL[stats.activeStage] ?? stats.activeStage}
          </span>
        </div>
      )}

      {/* Progress */}
      {stats.total > 0 && (
        <>
          <div style={{ height:4, background:"#edf0f6", borderRadius:2, overflow:"hidden" }}>
            <div style={{
              height:"100%", width:`${pct}%`, borderRadius:2,
              background:`linear-gradient(90deg, ${color}99, ${color})`,
              transition:"width 0.4s",
            }} />
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, marginTop:4, color:"#9aacbe" }}>
            <span>完成进度</span><span style={{ color:sf.fill, fontWeight:600 }}>{pct}%</span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Action button (below bubble on click) ─────────────────────────
function ActionBtn({ x, y, label, icon, bg, onClick }: {
  x:number; y:number; label:string; icon:string; bg:string; onClick:()=>void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button style={{
      position:"absolute", left: x-30, top: y-18,
      width:60, height:36, borderRadius:8,
      background: hov ? bg : `${bg}dd`,
      border:"none", cursor:"pointer", pointerEvents:"auto",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:1,
      boxShadow: hov ? `0 4px 16px ${bg}55` : `0 2px 8px ${bg}33`,
      transition:"all 0.15s",
      transform: hov ? "translateY(-2px)" : "none",
    }}
    onMouseEnter={() => setHov(true)}
    onMouseLeave={() => setHov(false)}
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <span style={{ fontSize:13, color:"#fff", lineHeight:1 }}>{icon}</span>
      <span style={{ fontSize:7.5, color:"rgba(255,255,255,0.85)", fontFamily:"system-ui", letterSpacing:"0.02em" }}>{label}</span>
    </button>
  );
}

// ── Quick Actions ──────────────────────────────────────────────────
function QuickActions({ stats, state, bp, scale, offset, svgRect, onSelect, onClose }: {
  stats:ProjectStats; state:VisualState; bp:BubbleData;
  scale:number; offset:{x:number;y:number}; svgRect:DOMRect|null;
  onSelect:(id:number)=>void; onClose:()=>void;
}) {
  const ox = svgRect?.left ?? 0, oy = svgRect?.top ?? 0;
  const sx = bp.x * scale + offset.x + ox;
  const sy = bp.y * scale + offset.y + oy;
  const sr = bp.r * scale;
  const sf = STATE_FILL[state];

  const actions = [
    { label:"进入项目", icon:"→", bg:"#5b9bd5", onAct:() => { onSelect(stats.project.id); onClose(); } },
    { label:"新建任务", icon:"+", bg:"#4caf7a", onAct:() => onClose() },
    { label:"任务列表", icon:"≡", bg:"#f0a030", onAct:() => onClose() },
    { label:"运行分析", icon:"▶", bg:"#9b7bd5", onAct:() => onClose() },
  ];
  const arcR = sr + 50;
  const a0 = -Math.PI * 1.1, a1 = -Math.PI * 0.1;

  return (
    <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:500 }}>
      {/* Name badge */}
      <div style={{
        position:"absolute", left:sx, top: sy - sr - 50,
        transform:"translateX(-50%)", whiteSpace:"nowrap",
        background:"#fff", borderRadius:8,
        border:`1.5px solid ${sf.fill}`,
        padding:"4px 12px",
        fontFamily:"system-ui", fontSize:12, fontWeight:700, color:"#1a2030",
        pointerEvents:"auto",
        boxShadow:`0 3px 14px ${sf.fill}30`,
      }}>
        <span style={{ color:sf.fill, marginRight:6 }}>●</span>
        {stats.project.name}
      </div>

      {/* SVG lines */}
      <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none" }}>
        {actions.map((_, i) => {
          const a  = a0 + (i / (actions.length-1)) * (a1 - a0);
          return <line key={i}
            x1={sx + Math.cos(a)*(sr+2)} y1={sy + Math.sin(a)*(sr+2)}
            x2={sx + Math.cos(a)*arcR}   y2={sy + Math.sin(a)*arcR}
            stroke={actions[i].bg} strokeWidth="1" strokeOpacity="0.35" strokeDasharray="3 3"
          />;
        })}
      </svg>

      {/* Buttons */}
      {actions.map(({ label, icon, bg, onAct }, i) => {
        const a  = a0 + (i / (actions.length-1)) * (a1 - a0);
        const bx = sx + Math.cos(a) * arcR;
        const by = sy + Math.sin(a) * arcR;
        return <ActionBtn key={label} x={bx} y={by} label={label} icon={icon} bg={bg} onClick={onAct} />;
      })}
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
  const [tasksMap, setTasksMap] = useState<Record<number,Task[]>>({});
  const [loading,  setLoading]  = useState(true);

  const [scale,  setScale]  = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPt   = useRef({ x: 0, y: 0 });

  const [hoveredId,  setHoveredId]  = useState<number|null>(null);
  const [selectedId, setSelectedId] = useState<number|null>(null);
  const [mousePos,   setMousePos]   = useState({ x: 0, y: 0 });
  const [svgRect,    setSvgRect]    = useState<DOMRect|null>(null);

  // Fetch tasks
  useEffect(() => {
    if (projects.length === 0) { setLoading(false); return; }
    let dead = false; setLoading(true);
    Promise.all(projects.map(p =>
      api.projects.tasks(p.id).then(t => ({ id:p.id, tasks:t }))
        .catch(() => ({ id:p.id, tasks:[] as Task[] }))
    )).then(res => {
      if (dead) return;
      const m: Record<number,Task[]> = {};
      res.forEach(({ id, tasks }) => { m[id] = tasks; });
      setTasksMap(m); setLoading(false);
    });
    return () => { dead = true; };
  }, [projects]);

  // Build stats + assign bubble colors
  const { allStats, colorMap } = useMemo(() => {
    const stagePri = ["deploy","monitor","dev","test","plan","ui","prd","analysis","input"];
    // count per state to assign variant index
    const stateCount: Record<string, number> = {};
    const cmap: Record<number, string> = {};

    const stats = projects.map((p, _i) => {
      const tasks = tasksMap[p.id] ?? [];
      const running = tasks.filter(t => t.status==="running").length;
      const done    = tasks.filter(t => t.status==="done").length;
      const failed  = tasks.filter(t => t.status==="failed").length;
      const queued  = tasks.filter(t => t.status==="queued").length;
      const pendingReview = tasks.filter(t => t.status==="waiting_review").length;
      const weight  = running*10 + failed*8 + pendingReview*6 + queued*5 + done + tasks.length*0.5;
      const active  = tasks.filter(t => t.status==="running"||t.status==="waiting_review");
      let activeStage: string|null = null;
      for (const stage of stagePri)
        if (active.some(t => t.stage===stage)) { activeStage = stage; break; }
      return { project:p, total:tasks.length, running, done, failed, queued,
               pendingReview, activeStage, weight };
    });

    // Assign colors after resolving states (so similar states get varied colors)
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
    setOffset({ x: width/2, y: height/2 });
  }, [loading]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragging.current = true; lastPt.current = { x:e.clientX, y:e.clientY };
  }, []);
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x:e.clientX, y:e.clientY });
    if (!dragging.current) return;
    const dx = e.clientX - lastPt.current.x, dy = e.clientY - lastPt.current.y;
    lastPt.current = { x:e.clientX, y:e.clientY };
    setOffset(o => ({ x:o.x+dx, y:o.y+dy }));
  }, []);
  const onMouseUp   = useCallback(() => { dragging.current = false; }, []);
  const onWheel     = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale(s => Math.min(4, Math.max(0.15, s * (e.deltaY>0 ? 0.92 : 1.09))));
  }, []);
  const resetView = () => {
    setScale(1);
    if (wrapRef.current) {
      const { width, height } = wrapRef.current.getBoundingClientRect();
      setOffset({ x:width/2, y:height/2 });
    }
  };

  const hoveredStats  = allStats.find(s => s.project.id === hoveredId);
  const selectedStats = allStats.find(s => s.project.id === selectedId);
  const selectedBubble= bubbles.find(b => b.stats.project.id === selectedId);
  const totalRunning  = allStats.reduce((a,s) => a+s.running, 0);
  const totalTasks    = allStats.reduce((a,s) => a+s.total,   0);

  return (
    <div style={{
      display:"flex", flexDirection:"column", height:"100%",
      background:"#edf0f7",
      fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{
        display:"flex", alignItems:"center", gap:14, flexShrink:0,
        padding:"10px 20px",
        borderBottom:"1px solid #dde2ee",
        background:"#fff",
      }}>
        <span style={{ fontSize:13, fontWeight:700, color:"#1a2030", letterSpacing:"-0.02em" }}>
          项目总览
        </span>
        <span style={{
          fontSize:9, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase",
          color:"#8a9ab8", background:"#f0f3fa", borderRadius:4, padding:"3px 8px",
        }}>
          Bubble Chart
        </span>
        <span style={{ fontSize:11, color:"#9aacbe" }}>
          {loading ? "加载中…" : `${projects.length} 项目 · ${totalTasks} 任务 · ${totalRunning} 运行中`}
        </span>

        <div style={{ flex:1 }} />

        {/* Legend */}
        {(Object.entries(STATE_FILL) as [VisualState, typeof STATE_FILL[VisualState]][])
          .filter(([k]) => k !== "idle")
          .map(([k, v]) => (
          <div key={k} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#6a7a90" }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:v.fill, flexShrink:0 }} />
            {v.label}
          </div>
        ))}

        <button onClick={resetView} style={{
          marginLeft:8, fontSize:11, color:"#6a7a90", background:"#f0f3fa",
          border:"1px solid #dde2ee", borderRadius:6, padding:"4px 10px", cursor:"pointer",
        }}>复位</button>
      </div>

      {/* ── Canvas ─────────────────────────────────────────────── */}
      <div ref={wrapRef} style={{ flex:1, position:"relative", overflow:"hidden", cursor:"grab" }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}    onMouseLeave={onMouseUp}
        onWheel={onWheel}        onClick={() => setSelectedId(null)}
      >
        <svg ref={svgRef} width="100%" height="100%" style={{ display:"block" }}
          onMouseEnter={() => setSvgRect(svgRef.current?.getBoundingClientRect() ?? null)}
        >
          <defs>
            {/* Shared highlight gradient (top-left shimmer) */}
            <radialGradient id="bhl" cx="35%" cy="28%" r="65%">
              <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.35"/>
              <stop offset="100%" stopColor="#000000" stopOpacity="0.08"/>
            </radialGradient>
            {/* Running pulse filter */}
            <filter id="glow-run" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="4" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="glow-fail" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="5" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          <rect width="100%" height="100%" fill="#edf0f7"/>

          <g transform={`translate(${offset.x},${offset.y}) scale(${scale})`}>
            {!loading && bubbles.map(({ x, y, r, stats }) => {
              const state  = resolveState(stats);
              const color  = colorMap[stats.project.id] ?? STATE_FILL[state].fill;
              const sf     = STATE_FILL[state];
              const isHov  = hoveredId  === stats.project.id;
              const isSel  = selectedId === stats.project.id;
              const focusOn = hoveredId !== null || selectedId !== null;
              const isFocus = isHov || isSel;
              const groupOp = focusOn && !isFocus ? 0.13 : 1;

              // Name truncation by bubble size
              const maxChars = Math.max(3, Math.floor(r / 8));
              const label = stats.project.name.length <= maxChars
                ? stats.project.name
                : stats.project.name.substring(0, maxChars - 1) + "…";
              const pct = stats.total > 0 ? stats.done / stats.total : 0;

              return (
                <g key={stats.project.id}
                  style={{ opacity:groupOp, transition:"opacity 0.28s ease" }}
                >
                  {/* Pulsing halo — running */}
                  {state === "running" && (
                    <circle cx={x} cy={y} r={r+6}
                      fill={color} fillOpacity={0.18}
                      style={{ animation:"glowBreathGreen 2s ease-in-out infinite" }}
                    />
                  )}
                  {/* Alert halo — failed */}
                  {state === "failed" && (
                    <circle cx={x} cy={y} r={r+6}
                      fill={color} fillOpacity={0.22}
                      style={{ animation:"glowBreathRed 1s ease-in-out infinite" }}
                    />
                  )}

                  {/* Base fill */}
                  <circle cx={x} cy={y} r={r} fill={color}
                    filter={state==="running" ? "url(#glow-run)" : state==="failed" ? "url(#glow-fail)" : undefined}
                  />

                  {/* Shared highlight overlay (gives every bubble a 3D sheen) */}
                  <circle cx={x} cy={y} r={r} fill="url(#bhl)"/>

                  {/* Selected ring */}
                  {isFocus && (
                    <circle cx={x} cy={y} r={r+3}
                      fill="none" stroke={color} strokeWidth="2.5" strokeOpacity="0.5"
                    />
                  )}

                  {/* Progress arc (thin, inside) */}
                  {stats.total > 0 && pct > 0 && (
                    <circle cx={x} cy={y} r={r-4}
                      fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2"
                      strokeDasharray={`${2*Math.PI*(r-4)*pct} ${2*Math.PI*(r-4)*(1-pct)}`}
                      strokeDashoffset={2*Math.PI*(r-4)*0.25}
                      strokeLinecap="round"
                    />
                  )}

                  {/* Project name */}
                  {r >= 30 && (
                    <text x={x} y={stats.total > 0 && r >= 48 ? y-2 : y+4}
                      textAnchor="middle" dominantBaseline="middle"
                      fill={sf.text} fillOpacity={isFocus ? 1 : 0.92}
                      fontSize={r>=70 ? 14 : r>=50 ? 12 : r>=36 ? 10 : 8}
                      fontWeight={700}
                      fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
                      style={{ userSelect:"none", pointerEvents:"none" }}
                    >
                      {label}
                    </text>
                  )}
                  {/* Task count (only in larger bubbles) */}
                  {r >= 48 && stats.total > 0 && (
                    <text x={x} y={y+14}
                      textAnchor="middle" dominantBaseline="middle"
                      fill={sf.text} fillOpacity={0.65}
                      fontSize={r>=60 ? 10 : 8}
                      fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
                      style={{ userSelect:"none", pointerEvents:"none" }}
                    >
                      {stats.running>0 ? `▶${stats.running} ` : ""}{stats.total}T
                    </text>
                  )}

                  {/* Hit area */}
                  <circle cx={x} cy={y} r={r} fill="transparent" style={{ cursor:"pointer" }}
                    onMouseEnter={() => { if (!selectedId) setHoveredId(stats.project.id); }}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSvgRect(svgRef.current?.getBoundingClientRect() ?? null);
                      setSelectedId(prev => prev===stats.project.id ? null : stats.project.id);
                      setHoveredId(null);
                    }}
                    onDoubleClick={(e) => { e.stopPropagation(); onSelectProject(stats.project.id); }}
                  />
                </g>
              );
            })}
          </g>
        </svg>

        {/* Empty */}
        {!loading && projects.length === 0 && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div style={{ textAlign:"center", color:"#9aacbe" }}>
              <div style={{ fontSize:48, marginBottom:10, opacity:0.3 }}>◉</div>
              <div style={{ fontSize:13 }}>暂无项目，请先创建项目</div>
            </div>
          </div>
        )}
        {/* Loading */}
        {loading && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div style={{ display:"flex", gap:7 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width:8, height:8, borderRadius:"50%", background:"#5b9bd5",
                  animation:`dotPulse 1.2s ease-in-out ${i*0.22}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}

        {/* Tooltip */}
        {!selectedId && hoveredId && hoveredStats && (
          <Tooltip
            stats={hoveredStats}
            state={resolveState(hoveredStats)}
            color={colorMap[hoveredStats.project.id] ?? "#5b9bd5"}
            mouse={mousePos}
          />
        )}

        {/* Quick actions */}
        {selectedId && selectedStats && selectedBubble && (
          <QuickActions
            stats={selectedStats}
            state={resolveState(selectedStats)}
            bp={selectedBubble}
            scale={scale} offset={offset} svgRect={svgRect}
            onSelect={onSelectProject} onClose={() => setSelectedId(null)}
          />
        )}

        {/* Zoom badge */}
        <div style={{ position:"absolute", bottom:12, right:12, fontSize:10, color:"#9aacbe",
          background:"rgba(255,255,255,0.7)", borderRadius:5, padding:"3px 8px",
          backdropFilter:"blur(4px)", border:"1px solid #dde2ee" }}>
          {Math.round(scale*100)}%
        </div>
      </div>
    </div>
  );
}
