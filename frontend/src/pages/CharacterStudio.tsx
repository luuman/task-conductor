// frontend/src/pages/CharacterStudio.tsx
// 3D AI 角色创建工具 Demo — 复刻 Dribbble 概念设计
import { useState, useRef, useEffect, useCallback } from "react";
import {
  MousePointer2, Type, Square, Circle, Pen, Image, Sparkles,
  Play, Pause, SkipBack, SkipForward, Volume2,
  Eye, Download, Undo2, Redo2, Plus, X, ChevronDown,
  Wand2, RotateCcw, ZoomIn, ZoomOut, Maximize2, Grid3X3,
} from "lucide-react";

/* ─── 常量 ─── */
const TABS = [
  { id: "new", label: "New Character", closable: false },
  { id: "templates", label: "Prompt Templates", closable: false },
  { id: "untitled", label: "Untitled", closable: true },
];

const LEFT_TOOLS = [
  { icon: MousePointer2, tip: "Select" },
  { icon: Type, tip: "Text" },
  { icon: Square, tip: "Rectangle" },
  { icon: Circle, tip: "Ellipse" },
  { icon: Pen, tip: "Pen" },
  { icon: Image, tip: "Image" },
  { icon: Wand2, tip: "AI Magic" },
];

const MODE_OPTIONS = ["Mode", "Full"] as const;
const STYLE_OPTIONS = ["White", "Happy"] as const;
const SPEED_OPTIONS = ["Fast", "Piano"] as const;

const SAMPLE_CODE = `import { LottieBox } from './components/birthday-animation';

export default function App() {
  return (
    <div className="size-full">
      <LottieBox />
    </div>
  );
}`;

const CHARACTER_DESC = `3D stylized cartoon boy
character, chubby,
short proportions, full
body, big round
glasses, baby dark
brown hair 🎨`;

/* ─── 波形生成 ─── */
function generateWaveform(count: number): number[] {
  const wave: number[] = [];
  for (let i = 0; i < count; i++) {
    const base = Math.sin(i * 0.08) * 0.3 + 0.5;
    const noise = Math.random() * 0.4;
    wave.push(Math.min(1, Math.max(0.05, base + noise - 0.2)));
  }
  return wave;
}

/* ─── 节点连接线 SVG ─── */
function NodeConnection({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const mx = (x1 + x2) / 2;
  return (
    <path
      d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
      fill="none"
      stroke="rgba(139,92,246,0.5)"
      strokeWidth={2}
      strokeDasharray="6 4"
    >
      <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="2s" repeatCount="indefinite" />
    </path>
  );
}

/* ─── 发光圆点 ─── */
function GlowDot({ x, y, color = "#8b5cf6" }: { x: number; y: number; color?: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={5} fill={color} opacity={0.3}>
        <animate attributeName="r" values="5;8;5" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx={x} cy={y} r={3} fill={color} />
    </g>
  );
}

/* ─── 主组件 ─── */
export default function CharacterStudio() {
  const [activeTab, setActiveTab] = useState("new");
  const [activeTool, setActiveTool] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0.35);
  const [ideaText, setIdeaText] = useState(CHARACTER_DESC);
  const [selectedMode, setSelectedMode] = useState(1); // Full
  const [selectedStyle, setSelectedStyle] = useState(1); // Happy
  const [selectedSpeed, setSelectedSpeed] = useState(0); // Fast
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [waveform] = useState(() => generateWaveform(120));
  const timelineRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  // 播放动画
  useEffect(() => {
    if (!isPlaying) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setPlayhead((p) => {
        const next = p + dt * 0.05;
        return next > 1 ? 0 : next;
      });
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying]);

  // 模拟生成
  const handleGenerate = useCallback(() => {
    if (generating) return;
    setGenerating(true);
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          setGenerating(false);
          return 100;
        }
        return p + Math.random() * 8 + 2;
      });
    }, 200);
  }, [generating]);

  const formatTime = (t: number) => {
    const total = t * 30; // 30s total
    const m = Math.floor(total / 60);
    const s = Math.floor(total % 60);
    const ms = Math.floor((total % 1) * 100);
    return `${m}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden select-none" style={{ background: "#1a1a2e" }}>

      {/* ═══ 顶部标签栏 ═══ */}
      <div className="flex items-center h-11 shrink-0 px-2 gap-1" style={{ background: "#12121f", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {/* 左侧 Logo */}
        <div className="flex items-center gap-2 px-2 mr-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)" }}>
            <Sparkles size={14} className="text-white" />
          </div>
        </div>

        {/* Tabs */}
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-all"
            style={{
              background: activeTab === tab.id ? "rgba(255,255,255,0.08)" : "transparent",
              color: activeTab === tab.id ? "#e2e8f0" : "rgba(255,255,255,0.4)",
              border: activeTab === tab.id ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
            }}
          >
            {tab.label}
            {tab.closable && (
              <X size={12} className="opacity-50 hover:opacity-100 ml-1" />
            )}
          </button>
        ))}

        <button className="flex items-center justify-center w-7 h-7 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors">
          <Plus size={14} />
        </button>

        <div className="flex-1" />

        {/* 右侧工具 */}
        <div className="flex items-center gap-1">
          {[Undo2, Redo2, Grid3X3, ZoomOut, ZoomIn, Maximize2].map((Icon, i) => (
            <button key={i} className="flex items-center justify-center w-7 h-7 rounded-md text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors">
              <Icon size={14} />
            </button>
          ))}
          <div className="w-px h-5 mx-1" style={{ background: "rgba(255,255,255,0.08)" }} />
          <button className="flex items-center justify-center w-7 h-7 rounded-md text-white/40 hover:text-white/60 hover:bg-white/5">
            <Eye size={14} />
          </button>
          <button className="flex items-center justify-center w-7 h-7 rounded-md text-white/40 hover:text-white/60 hover:bg-white/5">
            <Download size={14} />
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium ml-1 transition-colors"
            style={{ background: "#ef4444", color: "white" }}
          >
            Export
          </button>
        </div>
      </div>

      {/* ═══ 主体区域 ═══ */}
      <div className="flex flex-1 min-h-0">

        {/* ── 左侧工具栏 ── */}
        <div className="flex flex-col items-center w-11 shrink-0 py-3 gap-1" style={{ background: "#12121f", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
          {LEFT_TOOLS.map((tool, i) => (
            <button
              key={i}
              onClick={() => setActiveTool(i)}
              title={tool.tip}
              className="flex items-center justify-center w-8 h-8 rounded-lg transition-all"
              style={{
                background: activeTool === i ? "rgba(139,92,246,0.2)" : "transparent",
                color: activeTool === i ? "#a78bfa" : "rgba(255,255,255,0.3)",
              }}
            >
              <tool.icon size={16} />
            </button>
          ))}
          <div className="flex-1" />
          <button className="flex items-center justify-center w-8 h-8 rounded-full transition-all hover:scale-110" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
            <Plus size={16} className="text-white" />
          </button>
        </div>

        {/* ── 画布区域 ── */}
        <div className="flex-1 relative overflow-hidden" style={{ background: "#16162a" }}>
          {/* 网格背景 */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.03]">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>

          {/* 节点连接 SVG */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
            {/* Ideas → Settings */}
            <NodeConnection x1={310} y1={120} x2={420} y2={80} />
            <GlowDot x={310} y={120} />
            <GlowDot x={420} y={80} />
            {/* Ideas → References */}
            <NodeConnection x1={170} y1={200} x2={170} y2={270} />
            <GlowDot x={170} y={200} />
            <GlowDot x={170} y={270} />
            {/* References → Settings */}
            <NodeConnection x1={280} y1={340} x2={420} y2={200} />
            <GlowDot x={280} y={340} />
            <GlowDot x={420} y={200} />
            {/* Settings → AI Model */}
            <NodeConnection x1={500} y1={260} x2={500} y2={340} />
            <GlowDot x={500} y={260} />
            <GlowDot x={500} y={340} />
          </svg>

          {/* ── IDEAS 卡片 ── */}
          <div
            className="absolute rounded-xl p-4 w-[260px]"
            style={{
              left: 40, top: 50, zIndex: 2,
              background: "rgba(20,20,40,0.9)",
              border: "1px solid rgba(139,92,246,0.2)",
              backdropFilter: "blur(16px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#8b5cf6" }} />
              <span className="text-[11px] font-semibold tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>IDEAS</span>
              <div className="flex-1" />
              <button className="text-white/20 hover:text-white/50"><RotateCcw size={12} /></button>
            </div>
            <textarea
              value={ideaText}
              onChange={(e) => setIdeaText(e.target.value)}
              className="w-full bg-transparent text-[12px] leading-relaxed resize-none outline-none"
              style={{ color: "rgba(255,255,255,0.7)", height: 110 }}
              spellCheck={false}
            />
          </div>

          {/* ── REFERENCES 卡片 ── */}
          <div
            className="absolute rounded-xl p-3 w-[200px]"
            style={{
              left: 50, top: 280, zIndex: 2,
              background: "rgba(20,20,40,0.9)",
              border: "1px solid rgba(139,92,246,0.15)",
              backdropFilter: "blur(16px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#6366f1" }} />
              <span className="text-[11px] font-semibold tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>REFERENCES</span>
              <div className="flex-1" />
              <button className="text-white/20 hover:text-white/50"><X size={12} /></button>
            </div>
            {/* 角色缩略图 */}
            <div
              className="w-full aspect-[3/4] rounded-lg overflow-hidden relative"
              style={{
                background: "linear-gradient(145deg, #2a2a4a, #1a1a3a)",
                border: "1px solid rgba(139,92,246,0.1)",
              }}
            >
              {/* 简化角色轮廓 */}
              <svg viewBox="0 0 120 160" className="w-full h-full">
                {/* 头 */}
                <ellipse cx="60" cy="50" rx="28" ry="30" fill="#e8c9a0" opacity="0.8" />
                {/* 眼镜 */}
                <circle cx="48" cy="48" r="10" fill="none" stroke="#4a3728" strokeWidth="2.5" />
                <circle cx="72" cy="48" r="10" fill="none" stroke="#4a3728" strokeWidth="2.5" />
                <line x1="58" y1="48" x2="62" y2="48" stroke="#4a3728" strokeWidth="2" />
                {/* 头发 */}
                <path d="M32 40 Q35 18 60 15 Q85 18 88 40" fill="#3d2b1f" opacity="0.9" />
                <circle cx="55" cy="18" r="4" fill="#3d2b1f" />
                {/* 身体 - 绿色衬衫 */}
                <path d="M35 75 Q30 80 28 110 L92 110 Q90 80 85 75 Q72 70 60 72 Q48 70 35 75Z" fill="#5a7a5a" opacity="0.85" />
                {/* 白色内衬 */}
                <path d="M48 75 L52 95 L68 95 L72 75" fill="rgba(255,255,255,0.3)" />
                {/* 斜挎包 */}
                <line x1="42" y1="78" x2="72" y2="105" stroke="#d97706" strokeWidth="3" strokeLinecap="round" />
                <rect x="65" y="95" width="14" height="16" rx="3" fill="#d97706" opacity="0.9" />
                {/* 短裤 */}
                <path d="M35 110 L30 135 L55 135 L60 115 L65 135 L90 135 L85 110Z" fill="#c9b89a" opacity="0.7" />
                {/* 鞋子 */}
                <ellipse cx="42" cy="150" rx="14" ry="6" fill="white" opacity="0.9" />
                <ellipse cx="78" cy="150" rx="14" ry="6" fill="white" opacity="0.9" />
              </svg>
              {/* 发光边框 */}
              <div className="absolute inset-0 rounded-lg" style={{ boxShadow: "inset 0 0 20px rgba(139,92,246,0.1)" }} />
            </div>
          </div>

          {/* ── SETTINGS 面板 ── */}
          <div
            className="absolute rounded-xl p-4 w-[200px]"
            style={{
              left: 380, top: 50, zIndex: 2,
              background: "rgba(20,20,40,0.9)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(16px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#f59e0b" }} />
              <span className="text-[11px] font-semibold tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>SETTINGS</span>
            </div>

            {/* Mode */}
            <div className="flex gap-1.5 mb-3">
              {MODE_OPTIONS.map((opt, i) => (
                <button
                  key={opt}
                  onClick={() => setSelectedMode(i)}
                  className="flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                  style={{
                    background: selectedMode === i ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.04)",
                    color: selectedMode === i ? "#c4b5fd" : "rgba(255,255,255,0.4)",
                    border: selectedMode === i ? "1px solid rgba(139,92,246,0.3)" : "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>

            {/* Auto toggle */}
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>Auto</span>
              <button
                onClick={() => setAutoEnabled(!autoEnabled)}
                className="w-8 h-4 rounded-full relative transition-colors"
                style={{ background: autoEnabled ? "#8b5cf6" : "rgba(255,255,255,0.1)" }}
              >
                <div
                  className="w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all"
                  style={{ left: autoEnabled ? 17 : 2 }}
                />
              </button>
            </div>

            {/* Speed */}
            <div className="flex gap-1.5 mb-3">
              {SPEED_OPTIONS.map((opt, i) => (
                <button
                  key={opt}
                  onClick={() => setSelectedSpeed(i)}
                  className="flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                  style={{
                    background: selectedSpeed === i ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.04)",
                    color: selectedSpeed === i ? "#c4b5fd" : "rgba(255,255,255,0.4)",
                    border: selectedSpeed === i ? "1px solid rgba(139,92,246,0.3)" : "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>

            {/* Style */}
            <div className="flex gap-1.5 mb-4">
              {STYLE_OPTIONS.map((opt, i) => (
                <button
                  key={opt}
                  onClick={() => setSelectedStyle(i)}
                  className="flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                  style={{
                    background: selectedStyle === i ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.04)",
                    color: selectedStyle === i ? "#c4b5fd" : "rgba(255,255,255,0.4)",
                    border: selectedStyle === i ? "1px solid rgba(139,92,246,0.3)" : "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>

            {/* AI Model */}
            <div className="mt-1">
              <span className="text-[10px] tracking-widest block mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>AI MODEL</span>
              <button
                className="w-full py-2 rounded-lg text-[12px] font-medium flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                style={{
                  background: "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(99,102,241,0.3))",
                  border: "1px solid rgba(139,92,246,0.3)",
                  color: "#c4b5fd",
                }}
              >
                <Sparkles size={13} />
                Seedance3
                <ChevronDown size={12} className="opacity-50" />
              </button>
            </div>
          </div>

          {/* ── 3D 角色预览区 ── */}
          <div
            className="absolute rounded-2xl overflow-hidden flex items-center justify-center"
            style={{
              right: 40, top: 30, width: "min(40%, 420px)", bottom: 20, zIndex: 2,
              background: "radial-gradient(ellipse at 50% 40%, rgba(40,30,60,0.8), rgba(16,16,30,0.95))",
              border: "1px solid rgba(255,255,255,0.06)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            {/* 生成进度条 */}
            {generating && (
              <div className="absolute top-0 left-0 right-0 h-1 z-10" style={{ background: "rgba(255,255,255,0.05)" }}>
                <div
                  className="h-full transition-all duration-200"
                  style={{
                    width: `${Math.min(progress, 100)}%`,
                    background: "linear-gradient(90deg, #8b5cf6, #6366f1, #a78bfa)",
                  }}
                />
              </div>
            )}

            {/* 大号角色 SVG */}
            <svg viewBox="0 0 200 320" className="h-[85%] drop-shadow-2xl" style={{ filter: "drop-shadow(0 10px 30px rgba(0,0,0,0.5))" }}>
              {/* 阴影 */}
              <ellipse cx="100" cy="310" rx="50" ry="8" fill="rgba(0,0,0,0.3)" />

              {/* 鞋子 */}
              <ellipse cx="70" cy="295" rx="22" ry="10" fill="#f0f0f0" />
              <ellipse cx="70" cy="293" rx="20" ry="7" fill="white" />
              <ellipse cx="130" cy="295" rx="22" ry="10" fill="#f0f0f0" />
              <ellipse cx="130" cy="293" rx="20" ry="7" fill="white" />

              {/* 腿 / 短裤 */}
              <path d="M55 220 L48 275 Q48 282 58 282 L82 282 Q88 282 88 275 L100 230 L112 275 Q112 282 118 282 L142 282 Q152 282 152 275 L145 220Z" fill="#c9b99a" />

              {/* 身体 - 绿色衬衫 */}
              <path d="M50 145 Q42 155 38 220 L162 220 Q158 155 150 145 Q130 135 100 138 Q70 135 50 145Z" fill="#5d7e58" />
              {/* 衬衫纹理 */}
              <path d="M50 145 Q42 155 38 220 L162 220 Q158 155 150 145 Q130 135 100 138 Q70 135 50 145Z" fill="url(#knit)" opacity="0.15" />

              {/* 白色内衣 V 领 */}
              <path d="M82 145 L92 180 L100 185 L108 180 L118 145" fill="rgba(255,255,255,0.4)" />

              {/* 斜挎包带 */}
              <line x1="65" y1="148" x2="125" y2="210" stroke="#d97706" strokeWidth="5" strokeLinecap="round" />
              {/* 包 */}
              <rect x="115" y="190" width="22" height="28" rx="5" fill="#d97706" />
              <rect x="119" y="195" width="14" height="3" rx="1" fill="#b45309" opacity="0.5" />

              {/* 头 */}
              <ellipse cx="100" cy="90" rx="48" ry="52" fill="#e8c9a0" />

              {/* 腮红 */}
              <ellipse cx="62" cy="100" rx="12" ry="8" fill="#e8a0a0" opacity="0.3" />
              <ellipse cx="138" cy="100" rx="12" ry="8" fill="#e8a0a0" opacity="0.3" />

              {/* 眼镜 */}
              <circle cx="80" cy="88" r="18" fill="none" stroke="#3d2b1f" strokeWidth="4" />
              <circle cx="120" cy="88" r="18" fill="none" stroke="#3d2b1f" strokeWidth="4" />
              <line x1="98" y1="88" x2="102" y2="88" stroke="#3d2b1f" strokeWidth="3" />
              <line x1="62" y1="86" x2="50" y2="80" stroke="#3d2b1f" strokeWidth="3" />
              <line x1="138" y1="86" x2="150" y2="80" stroke="#3d2b1f" strokeWidth="3" />
              {/* 镜片反光 */}
              <circle cx="80" cy="88" r="16" fill="rgba(200,220,255,0.08)" />
              <circle cx="120" cy="88" r="16" fill="rgba(200,220,255,0.08)" />

              {/* 眼睛 */}
              <circle cx="80" cy="90" r="5" fill="#2d1f14" />
              <circle cx="120" cy="90" r="5" fill="#2d1f14" />
              <circle cx="82" cy="88" r="2" fill="white" />
              <circle cx="122" cy="88" r="2" fill="white" />

              {/* 鼻子 */}
              <ellipse cx="100" cy="100" rx="4" ry="3" fill="#d4a87a" opacity="0.6" />

              {/* 嘴巴 */}
              <path d="M92 110 Q100 116 108 110" fill="none" stroke="#c48a6a" strokeWidth="2" strokeLinecap="round" />

              {/* 头发 */}
              <path d="M52 72 Q55 30 100 22 Q145 30 148 72 Q150 60 145 50 Q140 35 100 25 Q60 35 55 50 Q50 60 52 72Z" fill="#3d2b1f" />
              {/* 刘海 */}
              <path d="M68 55 Q72 35 88 30 Q78 38 75 55Z" fill="#3d2b1f" />
              <path d="M80 50 Q85 32 100 28 Q92 35 88 50Z" fill="#3d2b1f" />
              <path d="M95 48 Q102 30 115 28 Q108 35 102 48Z" fill="#3d2b1f" />

              {/* 耳朵 */}
              <ellipse cx="52" cy="90" rx="8" ry="12" fill="#e0be95" />
              <ellipse cx="148" cy="90" rx="8" ry="12" fill="#e0be95" />

              {/* 袖口 */}
              <ellipse cx="38" cy="190" rx="14" ry="10" fill="#e8c9a0" />
              <ellipse cx="162" cy="190" rx="14" ry="10" fill="#e8c9a0" />

              {/* 毛衣纹理 pattern */}
              <defs>
                <pattern id="knit" width="8" height="8" patternUnits="userSpaceOnUse">
                  <path d="M0 4 Q2 2 4 4 Q6 6 8 4" fill="none" stroke="white" strokeWidth="0.5" />
                </pattern>
              </defs>
            </svg>

            {/* 右下角 Generate 按钮 */}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="absolute bottom-5 right-5 flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-medium transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
                color: "white",
                boxShadow: "0 4px 20px rgba(139,92,246,0.4)",
              }}
            >
              <Sparkles size={14} />
              {generating ? `Generating ${Math.min(Math.round(progress), 100)}%` : "Generate"}
            </button>
          </div>
        </div>
      </div>

      {/* ═══ 底部面板 ═══ */}
      <div className="shrink-0" style={{ height: 160, background: "#12121f", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex h-full">
          {/* 底部左侧: 提示文字 + 代码 */}
          <div className="flex-1 flex flex-col min-w-0" style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
            {/* Thoughts */}
            <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <Sparkles size={12} style={{ color: "#8b5cf6" }} />
              <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>Thoughts for life</span>
            </div>
            {/* 代码编辑器 */}
            <div className="flex-1 overflow-auto px-4 py-2 font-mono text-[11px] leading-[1.6]">
              {SAMPLE_CODE.split("\n").map((line, i) => (
                <div key={i} className="flex">
                  <span className="w-6 shrink-0 text-right mr-3 select-none" style={{ color: "rgba(255,255,255,0.15)" }}>
                    {i + 1}
                  </span>
                  <span style={{ color: colorize(line) }}>
                    {highlightSyntax(line)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 底部右侧: 时间轴 */}
          <div className="flex flex-col" style={{ width: "50%" }}>
            {/* 时间刻度 */}
            <div className="flex items-center px-3 py-1.5 gap-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div className="flex items-center gap-1">
                <button onClick={() => setPlayhead(Math.max(0, playhead - 0.05))} className="text-white/30 hover:text-white/60">
                  <SkipBack size={12} />
                </button>
                <button onClick={() => setIsPlaying(!isPlaying)} className="text-white/50 hover:text-white/80 mx-1">
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <button onClick={() => setPlayhead(Math.min(1, playhead + 0.05))} className="text-white/30 hover:text-white/60">
                  <SkipForward size={12} />
                </button>
              </div>
              <span className="text-[10px] font-mono tabular-nums" style={{ color: "rgba(255,255,255,0.4)" }}>
                {formatTime(playhead)}
              </span>
              <div className="flex-1" />
              <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.2)" }}>30.00s</span>
              <Volume2 size={12} style={{ color: "rgba(255,255,255,0.25)" }} />
            </div>

            {/* 波形 + 播放头 */}
            <div
              ref={timelineRef}
              className="flex-1 relative cursor-pointer px-3 py-2"
              onClick={(e) => {
                const rect = timelineRef.current?.getBoundingClientRect();
                if (rect) setPlayhead(Math.max(0, Math.min(1, (e.clientX - rect.left - 12) / (rect.width - 24))));
              }}
            >
              {/* 波形条 */}
              <div className="flex items-end h-full gap-px">
                {waveform.map((h, i) => {
                  const pos = i / waveform.length;
                  const isPast = pos < playhead;
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-t-sm transition-colors"
                      style={{
                        height: `${h * 100}%`,
                        background: isPast
                          ? "linear-gradient(to top, #8b5cf6, #a78bfa)"
                          : "rgba(255,255,255,0.08)",
                        minWidth: 2,
                      }}
                    />
                  );
                })}
              </div>
              {/* 播放头 */}
              <div
                className="absolute top-0 bottom-0 w-0.5 pointer-events-none"
                style={{
                  left: `calc(12px + ${playhead * 100}% * (1 - 24px / ${timelineRef.current?.offsetWidth || 600}))`,
                  background: "#8b5cf6",
                  boxShadow: "0 0 8px rgba(139,92,246,0.6)",
                }}
              >
                <div className="absolute -top-0.5 -left-1 w-2.5 h-2.5 rounded-full" style={{ background: "#8b5cf6" }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── 简单语法高亮 ─── */
function colorize(line: string): string {
  if (line.includes("import") || line.includes("export") || line.includes("from") || line.includes("return"))
    return "#c4b5fd";
  if (line.includes("function") || line.includes("default"))
    return "#93c5fd";
  if (line.includes("<") || line.includes("/>"))
    return "#6ee7b7";
  return "rgba(255,255,255,0.5)";
}

function highlightSyntax(line: string): string {
  return line;
}
