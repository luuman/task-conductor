// frontend/src/pages/HybridPipeline.tsx
// 混合方案 Demo — AI生成 → 拓扑修复 → 骨骼绑定 → 风格化材质
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Sparkles, Box, Bone, Palette, Play, Pause, RotateCcw,
  ChevronRight, Check, Loader2, AlertCircle, Settings2,
  Zap, Layers, Eye, Download, ArrowRight, Clock,
  Triangle, Hexagon, CircleDot, Brush,
} from "lucide-react";

/* ═══════════════════════════════════════════════
   类型 & 常量
   ═══════════════════════════════════════════════ */

interface StageConfig {
  id: string;
  title: string;
  subtitle: string;
  tool: string;
  icon: typeof Sparkles;
  color: string;
  accentBg: string;
  description: string;
  details: string[];
  duration: number; // 模拟秒数
}

const STAGES: StageConfig[] = [
  {
    id: "generate",
    title: "AI 生成",
    subtitle: "Text / Image → 3D Mesh",
    tool: "Meshy / Tripo3D",
    icon: Sparkles,
    color: "#8b5cf6",
    accentBg: "rgba(139,92,246,0.12)",
    description: "从文本描述或参考图快速生成初始 3D 模型",
    details: [
      "输入：角色描述 / 参考图片",
      "输出：高多边形网格 (.glb)",
      "含初始 PBR 材质贴图",
      "~30s 生成周期",
    ],
    duration: 6,
  },
  {
    id: "retopo",
    title: "拓扑修复",
    subtitle: "Retopology + UV Unwrap",
    tool: "Blender",
    icon: Box,
    color: "#f59e0b",
    accentBg: "rgba(245,158,11,0.12)",
    description: "清理 AI 生成的杂乱拓扑，重建干净的四边面网格",
    details: [
      "QuadriFlow 自动重拓扑",
      "手动修复关键区域（面部/关节）",
      "Smart UV Project 展 UV",
      "目标：8K~15K 面",
    ],
    duration: 8,
  },
  {
    id: "rigging",
    title: "骨骼绑定",
    subtitle: "Skeleton + Weight Paint",
    tool: "Rigify / Mixamo",
    icon: Bone,
    color: "#06b6d4",
    accentBg: "rgba(6,182,212,0.12)",
    description: "添加骨骼系统并绑定权重，使角色可动画化",
    details: [
      "Mixamo 自动绑定 / Rigify 手动",
      "IK/FK 切换控制器",
      "面部表情骨骼 (Shape Keys)",
      "权重绘制微调关节变形",
    ],
    duration: 7,
  },
  {
    id: "material",
    title: "风格化材质",
    subtitle: "Stylized Shading",
    tool: "Blender Shader Nodes",
    icon: Palette,
    color: "#10b981",
    accentBg: "rgba(16,185,129,0.12)",
    description: "使用 Shader Nodes 制作 Pixar/卡通风格材质",
    details: [
      "Toon Shader + Ramp 控制",
      "SSS 皮肤散射效果",
      "手绘纹理 + 程序化细节",
      "Rim Light 轮廓光",
    ],
    duration: 5,
  },
];

type StageStatus = "idle" | "running" | "done" | "error";

interface StageState {
  status: StageStatus;
  progress: number;
  logs: string[];
}

/* ═══════════════════════════════════════════════
   模拟日志
   ═══════════════════════════════════════════════ */

const STAGE_LOGS: Record<string, string[]> = {
  generate: [
    "[Meshy] Parsing text prompt...",
    "[Meshy] Encoding reference image → CLIP embeddings",
    "[Meshy] Generating coarse voxel grid (64³)",
    "[Meshy] Refining mesh via SDF network",
    "[Meshy] Generating PBR textures (diffuse + normal + roughness)",
    "[Meshy] Mesh decimation: 280K → 120K faces",
    "[Meshy] Exporting character_raw.glb (12.4 MB)",
    "[✓] Initial mesh ready — 120,432 tris, 4 texture maps",
  ],
  retopo: [
    "[Blender] Importing character_raw.glb",
    "[Blender] Running QuadriFlow (target: 12K quads)",
    "[Blender] QuadriFlow complete: 11,847 quads",
    "[Blender] Manual fix: face loop around eyes (32 verts)",
    "[Blender] Manual fix: edge flow at elbow joints",
    "[Blender] Smart UV Project (island margin: 0.02)",
    "[Blender] UV pack islands — coverage: 94.2%",
    "[Blender] Baking normals: high-poly → low-poly",
    "[Blender] Exporting character_clean.fbx (2.1 MB)",
    "[✓] Clean topology: 11,847 quads, UV coverage 94.2%",
  ],
  rigging: [
    "[Mixamo] Uploading character_clean.fbx",
    "[Mixamo] Auto-detecting skeleton placement",
    "[Mixamo] Generating 65-bone humanoid rig",
    "[Mixamo] Computing automatic skin weights",
    "[Blender] Importing rigged character",
    "[Blender] Adding IK constraints (legs + arms)",
    "[Blender] Creating FK/IK switch drivers",
    "[Blender] Shape Keys: smile, blink, eyebrow_raise (×12)",
    "[Blender] Weight paint fix: shoulder deformation",
    "[Blender] Exporting character_rigged.fbx",
    "[✓] Rig complete: 65 bones, 12 shape keys, IK/FK ready",
  ],
  material: [
    "[Blender] Creating Toon Shader node tree",
    "[Blender] Diffuse → ColorRamp (3-step cel shading)",
    "[Blender] Adding SSS node (radius: 0.8, skin preset)",
    "[Blender] Painting diffuse texture (2048×2048)",
    "[Blender] Procedural knit pattern (shirt fabric)",
    "[Blender] Rim Light: Fresnel → Emission mix (0.15)",
    "[Blender] Leather material for bag (roughness: 0.7)",
    "[Blender] Glass refraction for spectacles (IOR: 1.5)",
    "[Blender] Final render test: EEVEE 1080p — 0.8s/frame",
    "[✓] Stylized materials applied — render-ready",
  ],
};

/* ═══════════════════════════════════════════════
   SVG 预览组件 — 每个阶段不同视觉表现
   ═══════════════════════════════════════════════ */

function MeshPreview({ stageIndex, animated }: { stageIndex: number; animated?: boolean }) {
  const pulse = animated ? "animate-pulse" : "";
  return (
    <svg viewBox="0 0 180 240" className={`w-full h-full ${pulse}`}>
      {stageIndex === 0 && (
        /* AI 生成 — 粗糙高面数网格（三角面乱线） */
        <g>
          <ellipse cx="90" cy="225" rx="40" ry="6" fill="rgba(139,92,246,0.15)" />
          {/* 头 — 三角面网格 */}
          <ellipse cx="90" cy="65" rx="32" ry="35" fill="none" stroke="#8b5cf6" strokeWidth="0.6" opacity="0.3" />
          <ellipse cx="90" cy="65" rx="32" ry="35" fill="rgba(139,92,246,0.05)" />
          {/* 杂乱三角面 */}
          {Array.from({ length: 25 }).map((_, i) => {
            const cx = 90 + Math.cos(i * 0.8) * 28;
            const cy = 65 + Math.sin(i * 0.6) * 30;
            return (
              <line key={`h${i}`} x1={90} y1={65} x2={cx} y2={cy} stroke="#8b5cf6" strokeWidth="0.4" opacity="0.25" />
            );
          })}
          {/* 身体 — 三角面 */}
          <path d="M60 95 L50 170 L130 170 L120 95Z" fill="rgba(139,92,246,0.05)" stroke="#8b5cf6" strokeWidth="0.6" opacity="0.3" />
          {Array.from({ length: 15 }).map((_, i) => {
            const x1 = 55 + Math.random() * 70;
            const y1 = 95 + Math.random() * 75;
            const x2 = 55 + Math.random() * 70;
            const y2 = 95 + Math.random() * 75;
            return <line key={`b${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#8b5cf6" strokeWidth="0.3" opacity="0.2" />;
          })}
          {/* 腿 */}
          <path d="M65 170 L58 215 L80 215 L90 175 L100 215 L122 215 L115 170Z" fill="rgba(139,92,246,0.04)" stroke="#8b5cf6" strokeWidth="0.5" opacity="0.3" />
          {/* 标签 */}
          <text x="90" y="238" textAnchor="middle" fill="#8b5cf6" fontSize="8" opacity="0.6">120K tris (raw)</text>
        </g>
      )}
      {stageIndex === 1 && (
        /* 拓扑修复 — 干净四边面，UV展示 */
        <g>
          <ellipse cx="90" cy="225" rx="40" ry="6" fill="rgba(245,158,11,0.15)" />
          {/* 头 — 干净边缘流 */}
          <ellipse cx="90" cy="65" rx="32" ry="35" fill="rgba(245,158,11,0.04)" stroke="#f59e0b" strokeWidth="0.8" />
          {/* 水平环切 */}
          {[45, 55, 65, 75, 85].map((y) => (
            <ellipse key={y} cx="90" cy={y} rx={32 - Math.abs(y - 65) * 0.4} ry="3" fill="none" stroke="#f59e0b" strokeWidth="0.5" opacity="0.35" />
          ))}
          {/* 垂直环切 */}
          {[-20, -10, 0, 10, 20].map((offset) => (
            <path key={offset} d={`M${90 + offset} 30 Q${90 + offset * 1.3} 65 ${90 + offset} 100`} fill="none" stroke="#f59e0b" strokeWidth="0.5" opacity="0.35" />
          ))}
          {/* 身体 — 整齐四边面 */}
          <path d="M62 97 L52 170 L128 170 L118 97Z" fill="rgba(245,158,11,0.04)" stroke="#f59e0b" strokeWidth="0.8" />
          {[110, 125, 140, 155].map((y) => (
            <line key={y} x1={52 + (y - 97) * 0.14} y1={y} x2={128 - (y - 97) * 0.14} y2={y} stroke="#f59e0b" strokeWidth="0.4" opacity="0.3" />
          ))}
          {[70, 80, 90, 100, 110].map((x) => (
            <line key={x} x1={x} y1={97} x2={x - 2} y2={170} stroke="#f59e0b" strokeWidth="0.4" opacity="0.3" />
          ))}
          {/* 腿 */}
          <path d="M65 170 L58 215 L80 215 L90 175 L100 215 L122 215 L115 170Z" fill="rgba(245,158,11,0.04)" stroke="#f59e0b" strokeWidth="0.7" />
          <text x="90" y="238" textAnchor="middle" fill="#f59e0b" fontSize="8" opacity="0.6">11.8K quads (clean)</text>
        </g>
      )}
      {stageIndex === 2 && (
        /* 骨骼绑定 — 骨骼+关节点 */
        <g>
          <ellipse cx="90" cy="225" rx="40" ry="6" fill="rgba(6,182,212,0.15)" />
          {/* 半透明身体轮廓 */}
          <ellipse cx="90" cy="65" rx="30" ry="33" fill="rgba(6,182,212,0.04)" stroke="#06b6d4" strokeWidth="0.5" opacity="0.3" />
          <path d="M62 95 L52 170 L128 170 L118 95Z" fill="rgba(6,182,212,0.03)" stroke="#06b6d4" strokeWidth="0.4" opacity="0.25" />
          <path d="M65 170 L58 215 L80 215 L90 175 L100 215 L122 215 L115 170Z" fill="rgba(6,182,212,0.03)" stroke="#06b6d4" strokeWidth="0.4" opacity="0.25" />
          {/* 脊椎 */}
          {[[90, 45], [90, 65], [90, 90], [90, 115], [90, 140], [90, 170]].map(([x, y], i) => (
            <g key={`spine${i}`}>
              {i > 0 && <line x1={90} y1={[45, 65, 90, 115, 140][i - 1]} x2={x} y2={y} stroke="#06b6d4" strokeWidth="2" opacity="0.7" />}
              <circle cx={x} cy={y} r={i === 0 ? 4 : 3} fill="#06b6d4" opacity="0.9" />
            </g>
          ))}
          {/* 手臂骨 */}
          <line x1="90" y1="100" x2="55" y2="115" stroke="#06b6d4" strokeWidth="2" opacity="0.6" />
          <line x1="55" y1="115" x2="35" y2="145" stroke="#06b6d4" strokeWidth="1.5" opacity="0.5" />
          <circle cx="55" cy="115" r="3" fill="#22d3ee" />
          <circle cx="35" cy="145" r="2.5" fill="#22d3ee" />
          <line x1="90" y1="100" x2="125" y2="115" stroke="#06b6d4" strokeWidth="2" opacity="0.6" />
          <line x1="125" y1="115" x2="145" y2="145" stroke="#06b6d4" strokeWidth="1.5" opacity="0.5" />
          <circle cx="125" cy="115" r="3" fill="#22d3ee" />
          <circle cx="145" cy="145" r="2.5" fill="#22d3ee" />
          {/* 腿骨 */}
          <line x1="90" y1="170" x2="72" y2="195" stroke="#06b6d4" strokeWidth="2" opacity="0.6" />
          <line x1="72" y1="195" x2="68" y2="215" stroke="#06b6d4" strokeWidth="1.5" opacity="0.5" />
          <circle cx="72" cy="195" r="3" fill="#22d3ee" />
          <circle cx="68" cy="215" r="2.5" fill="#22d3ee" />
          <line x1="90" y1="170" x2="108" y2="195" stroke="#06b6d4" strokeWidth="2" opacity="0.6" />
          <line x1="108" y1="195" x2="112" y2="215" stroke="#06b6d4" strokeWidth="1.5" opacity="0.5" />
          <circle cx="108" cy="195" r="3" fill="#22d3ee" />
          <circle cx="112" cy="215" r="2.5" fill="#22d3ee" />
          <text x="90" y="238" textAnchor="middle" fill="#06b6d4" fontSize="8" opacity="0.6">65 bones + IK/FK</text>
        </g>
      )}
      {stageIndex === 3 && (
        /* 风格化材质 — 完整渲染角色 */
        <g>
          <ellipse cx="90" cy="225" rx="45" ry="7" fill="rgba(0,0,0,0.2)" />
          {/* 鞋子 */}
          <ellipse cx="72" cy="215" rx="15" ry="7" fill="#f0f0f0" />
          <ellipse cx="108" cy="215" rx="15" ry="7" fill="#f0f0f0" />
          {/* 短裤 */}
          <path d="M63 168 L58 200 Q58 205 65 205 L82 205 Q86 205 86 200 L90 175 L94 200 Q94 205 98 205 L115 205 Q122 205 122 200 L117 168Z" fill="#c9b99a" />
          {/* 绿色衬衫 */}
          <path d="M58 98 L50 168 L130 168 L122 98 Q108 88 90 90 Q72 88 58 98Z" fill="#5d7e58" />
          {/* 毛衣纹理线 */}
          {[108, 118, 128, 138, 148, 158].map((y) => (
            <path key={y} d={`M${52 + (y - 98) * 0.12} ${y} Q${90} ${y - 2} ${128 - (y - 98) * 0.12} ${y}`} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />
          ))}
          {/* V 领内衬 */}
          <path d="M80 98 L88 125 L92 125 L100 98" fill="rgba(255,255,255,0.3)" />
          {/* 斜挎包 */}
          <line x1="70" y1="100" x2="115" y2="155" stroke="#d97706" strokeWidth="4" strokeLinecap="round" />
          <rect x="108" y="142" width="16" height="20" rx="4" fill="#d97706" />
          <rect x="111" y="146" width="10" height="2.5" rx="1" fill="#b45309" opacity="0.5" />
          {/* 头 */}
          <ellipse cx="90" cy="60" rx="35" ry="38" fill="#e8c9a0" />
          {/* 腮红 */}
          <ellipse cx="62" cy="70" rx="9" ry="6" fill="#e8a0a0" opacity="0.3" />
          <ellipse cx="118" cy="70" rx="9" ry="6" fill="#e8a0a0" opacity="0.3" />
          {/* 眼镜 */}
          <circle cx="76" cy="60" r="14" fill="rgba(200,220,255,0.06)" stroke="#3d2b1f" strokeWidth="3" />
          <circle cx="104" cy="60" r="14" fill="rgba(200,220,255,0.06)" stroke="#3d2b1f" strokeWidth="3" />
          <line x1="90" y1="60" x2="90" y2="60" stroke="#3d2b1f" strokeWidth="3" />
          <line x1="62" y1="58" x2="52" y2="52" stroke="#3d2b1f" strokeWidth="2.5" />
          <line x1="118" y1="58" x2="128" y2="52" stroke="#3d2b1f" strokeWidth="2.5" />
          {/* 眼睛 */}
          <circle cx="76" cy="62" r="4" fill="#2d1f14" />
          <circle cx="104" cy="62" r="4" fill="#2d1f14" />
          <circle cx="78" cy="60" r="1.5" fill="white" />
          <circle cx="106" cy="60" r="1.5" fill="white" />
          {/* 嘴 */}
          <path d="M82 76 Q90 82 98 76" fill="none" stroke="#c48a6a" strokeWidth="1.5" strokeLinecap="round" />
          {/* 头发 */}
          <path d="M55 48 Q58 18 90 12 Q122 18 125 48 Q128 35 122 25 Q115 12 90 8 Q65 12 58 25 Q52 35 55 48Z" fill="#3d2b1f" />
          <path d="M68 35 Q72 18 85 14 Q76 22 73 35Z" fill="#3d2b1f" />
          <path d="M80 30 Q86 15 98 12 Q92 20 88 30Z" fill="#3d2b1f" />
          {/* 耳朵 */}
          <ellipse cx="55" cy="62" rx="6" ry="9" fill="#e0be95" />
          <ellipse cx="125" cy="62" rx="6" ry="9" fill="#e0be95" />
          {/* 手 */}
          <ellipse cx="42" cy="155" rx="10" ry="8" fill="#e8c9a0" />
          <ellipse cx="138" cy="155" rx="10" ry="8" fill="#e8c9a0" />
          {/* Rim light */}
          <ellipse cx="90" cy="60" rx="36" ry="39" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
          <path d="M58 98 L50 168 L130 168 L122 98 Q108 88 90 90 Q72 88 58 98Z" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" />
          <text x="90" y="238" textAnchor="middle" fill="#10b981" fontSize="8" opacity="0.6">Render-ready</text>
        </g>
      )}
    </svg>
  );
}

/* ═══════════════════════════════════════════════
   连接箭头组件
   ═══════════════════════════════════════════════ */

function PipeArrow({ fromColor, toColor, active }: { fromColor: string; toColor: string; active: boolean }) {
  return (
    <div className="flex items-center justify-center w-12 shrink-0 relative">
      <svg width="48" height="48" viewBox="0 0 48 48">
        <defs>
          <linearGradient id={`grad-${fromColor}-${toColor}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={fromColor} />
            <stop offset="100%" stopColor={toColor} />
          </linearGradient>
        </defs>
        <line x1="4" y1="24" x2="36" y2="24" stroke={active ? `url(#grad-${fromColor}-${toColor})` : "rgba(255,255,255,0.1)"} strokeWidth="2" strokeDasharray={active ? "0" : "4 3"}>
          {active && <animate attributeName="strokeDashoffset" from="20" to="0" dur="0.6s" fill="freeze" />}
        </line>
        <polygon points="36,18 44,24 36,30" fill={active ? toColor : "rgba(255,255,255,0.1)"} />
      </svg>
      {active && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full" style={{ background: toColor, boxShadow: `0 0 8px ${toColor}` }}>
            <div className="w-2 h-2 rounded-full animate-ping" style={{ background: toColor, opacity: 0.4 }} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   主组件
   ═══════════════════════════════════════════════ */

export default function HybridPipeline() {
  const [stages, setStages] = useState<StageState[]>(
    STAGES.map(() => ({ status: "idle", progress: 0, logs: [] }))
  );
  const [activeStage, setActiveStage] = useState(0);
  const [autoRun, setAutoRun] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [meshyPrompt, setMeshyPrompt] = useState("3D stylized cartoon boy, chubby proportions, big round glasses, green shirt, orange satchel bag, white sneakers, Pixar style");
  const [totalElapsed, setTotalElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动日志
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [stages[activeStage]?.logs.length]);

  // 运行单个阶段
  const runStage = useCallback((index: number) => {
    const stage = STAGES[index];
    const logs = STAGE_LOGS[stage.id];
    let logIndex = 0;
    let progress = 0;

    setStages((prev) => {
      const next = [...prev];
      next[index] = { status: "running", progress: 0, logs: [] };
      return next;
    });
    setActiveStage(index);

    const logInterval = stage.duration * 1000 / logs.length;
    const progressTick = 50;

    // 进度条
    const pInterval = setInterval(() => {
      progress += (100 / (stage.duration * 1000)) * progressTick;
      const elapsed = (progress / 100) * stage.duration;
      setStages((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], progress: Math.min(progress, 100) };
        return next;
      });
      setTotalElapsed((t) => t + progressTick / 1000);
      if (progress >= 100) clearInterval(pInterval);
    }, progressTick);

    // 日志
    const lInterval = setInterval(() => {
      if (logIndex < logs.length) {
        setStages((prev) => {
          const next = [...prev];
          next[index] = { ...next[index], logs: [...next[index].logs, logs[logIndex]] };
          return next;
        });
        logIndex++;
      } else {
        clearInterval(lInterval);
      }
    }, logInterval);

    // 完成
    setTimeout(() => {
      clearInterval(pInterval);
      setStages((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], status: "done", progress: 100 };
        return next;
      });
      // 自动运行下一阶段
      if (autoRun && index < STAGES.length - 1) {
        setTimeout(() => runStage(index + 1), 600);
      }
    }, stage.duration * 1000);

    return () => {
      clearInterval(pInterval);
      clearInterval(lInterval);
    };
  }, [autoRun]);

  // 全部运行
  const runAll = useCallback(() => {
    setAutoRun(true);
    setTotalElapsed(0);
    setStages(STAGES.map(() => ({ status: "idle", progress: 0, logs: [] })));
    setTimeout(() => runStage(0), 200);
  }, [runStage]);

  // 重置
  const resetAll = useCallback(() => {
    setAutoRun(false);
    setTotalElapsed(0);
    setStages(STAGES.map(() => ({ status: "idle", progress: 0, logs: [] })));
    setActiveStage(0);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const isAnyRunning = stages.some((s) => s.status === "running");
  const allDone = stages.every((s) => s.status === "done");
  const currentStage = STAGES[activeStage];
  const currentState = stages[activeStage];

  return (
    <div className="flex flex-col h-full w-full overflow-hidden select-none" style={{ background: "#0f0f1a" }}>

      {/* ═══ 顶部栏 ═══ */}
      <div className="flex items-center h-12 shrink-0 px-5 gap-3" style={{ background: "#111122", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #8b5cf6, #06b6d4)" }}>
            <Layers size={15} className="text-white" />
          </div>
          <span className="text-[14px] font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>
            Hybrid Pipeline
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}>
            推荐方案
          </span>
        </div>

        <div className="flex-1" />

        {/* 总耗时 */}
        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
          <Clock size={12} />
          <span className="font-mono tabular-nums">{totalElapsed.toFixed(1)}s</span>
        </div>

        {/* 操作按钮 */}
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
          style={{ color: showConfig ? "#8b5cf6" : "rgba(255,255,255,0.3)", background: showConfig ? "rgba(139,92,246,0.1)" : "transparent" }}
        >
          <Settings2 size={15} />
        </button>
        <button onClick={resetAll} className="flex items-center justify-center w-8 h-8 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors">
          <RotateCcw size={15} />
        </button>
        <button
          onClick={isAnyRunning ? undefined : runAll}
          disabled={isAnyRunning}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)", color: "white", boxShadow: "0 4px 16px rgba(139,92,246,0.3)" }}
        >
          {isAnyRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {isAnyRunning ? "Running..." : allDone ? "Run Again" : "Run Pipeline"}
        </button>
      </div>

      {/* ═══ 主区域 ═══ */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── 左侧: 流水线 + 配置 ── */}
        <div className="flex flex-col flex-1 min-w-0">

          {/* 配置面板（可折叠） */}
          {showConfig && (
            <div className="shrink-0 px-5 py-4" style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <label className="text-[10px] tracking-widest mb-1.5 block" style={{ color: "rgba(255,255,255,0.35)" }}>PROMPT</label>
                  <textarea
                    value={meshyPrompt}
                    onChange={(e) => setMeshyPrompt(e.target.value)}
                    className="w-full bg-transparent rounded-lg px-3 py-2 text-[12px] leading-relaxed resize-none outline-none"
                    style={{ color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.08)", height: 60 }}
                    spellCheck={false}
                  />
                </div>
                <div className="w-48 shrink-0">
                  <label className="text-[10px] tracking-widest mb-1.5 block" style={{ color: "rgba(255,255,255,0.35)" }}>OPTIONS</label>
                  <div className="flex flex-col gap-1.5">
                    {[
                      { label: "Auto-advance stages", checked: autoRun, toggle: () => setAutoRun(!autoRun) },
                      { label: "High-poly mode (280K)", checked: false, toggle: () => {} },
                      { label: "Bake normal maps", checked: true, toggle: () => {} },
                    ].map((opt) => (
                      <label key={opt.label} className="flex items-center gap-2 text-[11px] cursor-pointer" style={{ color: "rgba(255,255,255,0.5)" }}>
                        <button
                          onClick={opt.toggle}
                          className="w-3.5 h-3.5 rounded border flex items-center justify-center"
                          style={{ borderColor: opt.checked ? "#8b5cf6" : "rgba(255,255,255,0.15)", background: opt.checked ? "#8b5cf6" : "transparent" }}
                        >
                          {opt.checked && <Check size={9} className="text-white" />}
                        </button>
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── 流水线阶段卡片 ── */}
          <div className="flex items-center justify-center px-6 py-6 gap-0 overflow-x-auto shrink-0">
            {STAGES.map((stage, i) => {
              const state = stages[i];
              const isActive = activeStage === i;
              const StatusIcon = state.status === "done" ? Check : state.status === "running" ? Loader2 : state.status === "error" ? AlertCircle : stage.icon;

              return (
                <div key={stage.id} className="flex items-center">
                  {/* 阶段卡片 */}
                  <button
                    onClick={() => setActiveStage(i)}
                    className="relative flex flex-col items-center w-[150px] rounded-xl p-3 transition-all hover:scale-[1.03] cursor-pointer"
                    style={{
                      background: isActive ? stage.accentBg : "rgba(255,255,255,0.02)",
                      border: `1px solid ${isActive ? stage.color + "40" : "rgba(255,255,255,0.06)"}`,
                      boxShadow: isActive ? `0 4px 20px ${stage.color}15` : "none",
                    }}
                  >
                    {/* 序号 */}
                    <div className="absolute -top-2 -left-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{
                        background: state.status === "done" ? stage.color : "rgba(255,255,255,0.06)",
                        color: state.status === "done" ? "white" : "rgba(255,255,255,0.3)",
                        border: `1px solid ${state.status !== "idle" ? stage.color + "60" : "rgba(255,255,255,0.1)"}`,
                      }}
                    >
                      {state.status === "done" ? <Check size={10} /> : i + 1}
                    </div>

                    {/* 图标 */}
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2"
                      style={{ background: `${stage.color}18` }}
                    >
                      <StatusIcon
                        size={18}
                        style={{ color: stage.color }}
                        className={state.status === "running" ? "animate-spin" : ""}
                      />
                    </div>

                    {/* 标题 */}
                    <span className="text-[12px] font-semibold" style={{ color: isActive ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.6)" }}>
                      {stage.title}
                    </span>
                    <span className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                      {stage.tool}
                    </span>

                    {/* 进度条 */}
                    {state.status !== "idle" && (
                      <div className="w-full h-1 rounded-full mt-2.5 overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div
                          className="h-full rounded-full transition-all duration-200"
                          style={{ width: `${state.progress}%`, background: stage.color }}
                        />
                      </div>
                    )}

                    {/* 单步运行按钮 */}
                    {state.status === "idle" && !isAnyRunning && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setAutoRun(false); runStage(i); }}
                        className="mt-2 flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all hover:scale-105"
                        style={{ background: `${stage.color}20`, color: stage.color, border: `1px solid ${stage.color}30` }}
                      >
                        <Play size={10} /> Run
                      </button>
                    )}
                  </button>

                  {/* 箭头 */}
                  {i < STAGES.length - 1 && (
                    <PipeArrow
                      fromColor={STAGES[i].color}
                      toColor={STAGES[i + 1].color}
                      active={stages[i].status === "done"}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* ── 下方详情 ── */}
          <div className="flex flex-1 min-h-0 mx-5 mb-4 gap-4">
            {/* 阶段详情 */}
            <div className="flex-1 rounded-xl overflow-hidden flex flex-col" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-2 px-4 py-2.5 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <currentStage.icon size={14} style={{ color: currentStage.color }} />
                <span className="text-[12px] font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>
                  {currentStage.title}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: currentStage.accentBg, color: currentStage.color }}>
                  {currentStage.subtitle}
                </span>
                <div className="flex-1" />
                {currentState.status === "done" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>
                    <Check size={10} /> Complete
                  </span>
                )}
              </div>
              <div className="px-4 py-3">
                <p className="text-[12px] leading-relaxed mb-3" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {currentStage.description}
                </p>
                <div className="flex flex-col gap-1.5">
                  {currentStage.details.map((d, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                      <ChevronRight size={11} className="mt-0.5 shrink-0" style={{ color: currentStage.color, opacity: 0.6 }} />
                      {d}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 日志面板 */}
            <div className="w-[380px] shrink-0 rounded-xl overflow-hidden flex flex-col" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-2 px-4 py-2.5 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <Zap size={12} style={{ color: currentStage.color }} />
                <span className="text-[12px] font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>Console</span>
                <div className="flex-1" />
                <span className="text-[10px] font-mono tabular-nums" style={{ color: "rgba(255,255,255,0.2)" }}>
                  {currentState.logs.length} lines
                </span>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[10.5px] leading-[1.7]" style={{ scrollbarWidth: "thin" }}>
                {currentState.logs.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-[11px]" style={{ color: "rgba(255,255,255,0.15)" }}>
                    Waiting for stage to start...
                  </div>
                ) : (
                  currentState.logs.map((log, i) => (
                    <div key={i} className="flex gap-2">
                      <span style={{ color: "rgba(255,255,255,0.12)" }}>{String(i + 1).padStart(2, "0")}</span>
                      <span style={{
                        color: log.startsWith("[✓]") ? "#10b981"
                          : log.includes("Error") ? "#ef4444"
                          : log.includes("[Blender]") ? "#f59e0b"
                          : log.includes("[Mixamo]") ? "#06b6d4"
                          : log.includes("[Meshy]") ? "#8b5cf6"
                          : "rgba(255,255,255,0.45)",
                      }}>
                        {log}
                      </span>
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            </div>
          </div>
        </div>

        {/* ── 右侧: 3D 预览 ── */}
        <div className="w-[280px] shrink-0 flex flex-col" style={{ background: "rgba(255,255,255,0.015)", borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
          {/* 预览标题 */}
          <div className="flex items-center gap-2 px-4 py-3 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <Eye size={13} style={{ color: "rgba(255,255,255,0.4)" }} />
            <span className="text-[12px] font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>Preview</span>
            <div className="flex-1" />
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: currentStage.accentBg, color: currentStage.color }}>
              Stage {activeStage + 1}/4
            </span>
          </div>

          {/* SVG 预览 */}
          <div className="flex-1 flex items-center justify-center p-6 relative">
            {/* 发光背景 */}
            <div className="absolute inset-0" style={{
              background: `radial-gradient(ellipse at 50% 45%, ${currentStage.color}08, transparent 70%)`,
            }} />
            <div className="w-full max-w-[200px] relative z-10">
              <MeshPreview stageIndex={activeStage} animated={stages[activeStage]?.status === "running"} />
            </div>
          </div>

          {/* 阶段缩略图 */}
          <div className="flex gap-2 px-4 py-3 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            {STAGES.map((stage, i) => (
              <button
                key={stage.id}
                onClick={() => setActiveStage(i)}
                className="flex-1 aspect-square rounded-lg overflow-hidden flex items-center justify-center transition-all hover:scale-105"
                style={{
                  background: activeStage === i ? `${stage.color}15` : "rgba(255,255,255,0.03)",
                  border: `1.5px solid ${activeStage === i ? stage.color + "50" : "rgba(255,255,255,0.06)"}`,
                }}
              >
                <div className="w-[80%] h-[80%]">
                  <MeshPreview stageIndex={i} />
                </div>
              </button>
            ))}
          </div>

          {/* 导出按钮 */}
          {allDone && (
            <div className="px-4 pb-4 shrink-0">
              <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-medium transition-all hover:scale-[1.02]"
                style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "white", boxShadow: "0 4px 16px rgba(16,185,129,0.25)" }}
              >
                <Download size={14} />
                Export Final Model
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
