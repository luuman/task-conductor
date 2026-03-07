// frontend/src/components/TaskWorkflow.tsx
import "@xyflow/react/dist/style.css";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  BackgroundVariant,
  MarkerType,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import { useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import type { Task, StageArtifact } from "../lib/api";
import { api } from "../lib/api";

// ── 常量 ──────────────────────────────────────────────────────────

const STAGE_ORDER = [
  "input", "analysis", "prd", "ui", "plan",
  "dev",   "test",     "deploy", "monitor", "done",
];

const STAGE_LABEL: Record<string, string> = {
  input: "需求输入", analysis: "需求分析", prd: "PRD 文档", ui: "UI 设计",
  plan: "技术方案",  dev: "开发实现",    test: "测试验证", deploy: "部署发布",
  monitor: "线上监控", done: "已完成",
};

const STAGE_DESC: Record<string, string> = {
  input:    "录入任务需求与描述",
  analysis: "AI 生成 3 个技术方案供选择",
  prd:      "生成产品需求文档",
  ui:       "生成界面原型设计方案",
  plan:     "生成详细技术实现规划",
  dev:      "Claude Code 自动编码实现",
  test:     "运行自动化测试与验证",
  deploy:   "CI/CD 流水线自动部署",
  monitor:  "线上监控与异常告警",
  done:     "任务圆满完成",
};

const STAGE_ICON: Record<string, string> = {
  input: "📋", analysis: "🔍", prd: "📄", ui: "🎨",
  plan: "📐",  dev: "💻",      test: "🧪", deploy: "🚀",
  monitor: "📡", done: "✅",
};

const APPROVAL_STAGES = new Set(["analysis", "prd", "ui", "plan", "test", "deploy"]);

const STATUS_LABEL: Record<string, string> = {
  running: "运行中", waiting_review: "待审批", approved: "已批准",
  rejected: "已驳回", pending: "待处理", done: "已完成", failed: "失败",
  queued: "排队中",
};

const NODE_W = 180;
const COL_STEP = 250;
const ROW_2_Y = 240;

// ── 节点数据类型 ──────────────────────────────────────────────────

type HandleConfig = {
  topTarget?: boolean;
  bottomSource?: boolean;
  leftSource?: boolean;
  leftTarget?: boolean;
  rightSource?: boolean;
  rightTarget?: boolean;
};

type StageNodeData = {
  stage: string;
  label: string;
  desc: string;
  icon: string;
  isCurrentStage: boolean;
  isCompleted: boolean;
  isPending: boolean;
  isSelected: boolean;
  status?: string;
  requiresApproval: boolean;
  handles: HandleConfig;
  onClick: (stage: string) => void;
};

// ── Handle 样式 ────────────────────────────────────────────────────

const HANDLE_STYLE: React.CSSProperties = {
  background: "transparent",
  border: "none",
  width: 6,
  height: 6,
};

// ── StageNode ─────────────────────────────────────────────────────

function StageNode({ data }: NodeProps) {
  const d = data as StageNodeData;

  const borderColor = d.isSelected
    ? "border-white/60"
    : d.isCurrentStage
    ? "border-accent"
    : d.isCompleted
    ? "border-green-500/50"
    : "border-white/10";

  const bgStyle: React.CSSProperties = {
    width: NODE_W,
    cursor: "pointer",
    background: "var(--background-secondary)",
    boxShadow: d.isSelected
      ? "0 0 0 2px rgba(255,255,255,0.2), 0 0 20px rgba(255,255,255,0.05)"
      : d.isCurrentStage
      ? "0 0 18px rgba(68,119,255,0.35)"
      : undefined,
  };

  return (
    <div
      style={bgStyle}
      onClick={() => d.onClick(d.stage)}
      className={cn(
        "rounded-2xl border transition-all select-none hover:border-white/30",
        borderColor,
        !d.isCurrentStage && !d.isCompleted && !d.isSelected && "opacity-40 hover:opacity-70",
      )}
    >
      {d.handles.topTarget    && <Handle id="t"  type="target" position={Position.Top}    style={HANDLE_STYLE} />}
      {d.handles.bottomSource && <Handle id="b"  type="source" position={Position.Bottom} style={HANDLE_STYLE} />}
      {d.handles.leftSource   && <Handle id="ls" type="source" position={Position.Left}   style={HANDLE_STYLE} />}
      {d.handles.leftTarget   && <Handle id="lt" type="target" position={Position.Left}   style={HANDLE_STYLE} />}
      {d.handles.rightSource  && <Handle id="rs" type="source" position={Position.Right}  style={HANDLE_STYLE} />}
      {d.handles.rightTarget  && <Handle id="rt" type="target" position={Position.Right}  style={HANDLE_STYLE} />}

      <div className="px-3.5 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base leading-none shrink-0">{d.icon}</span>
            <span className="text-[11px] font-semibold text-white/90 truncate">{d.label}</span>
          </div>
          <div className={cn(
            "w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0",
            d.isCompleted    ? "bg-green-500 text-white" :
            d.isCurrentStage ? "bg-accent text-white" :
                               "bg-white/10",
          )}>
            {d.isCompleted ? "✓" : d.isCurrentStage ? "▶" : ""}
          </div>
        </div>

        <p className="text-[9px] text-white/40 leading-relaxed">{d.desc}</p>

        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {d.requiresApproval && (
            <span className="text-[8px] border border-yellow-500/30 text-yellow-400/70 px-1.5 py-0.5 rounded-full">
              需审批
            </span>
          )}
          {d.isCurrentStage && d.status && (
            <span className={cn(
              "text-[9px] flex items-center gap-1 font-medium",
              d.status === "running"        ? "text-blue-400" :
              d.status === "waiting_review" ? "text-yellow-400" :
              d.status === "approved"       ? "text-green-400" :
              d.status === "rejected"       ? "text-red-400" :
              d.status === "done"           ? "text-green-400" : "text-white/40",
            )}>
              {d.status === "running" && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
              )}
              {STATUS_LABEL[d.status] ?? d.status}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { stageNode: StageNode };

// ── 构建 nodes & edges ────────────────────────────────────────────

function buildGraph(task: Task, selectedStage: string | null, onClickStage: (s: string) => void) {
  const currentIdx = STAGE_ORDER.indexOf(task.stage);
  const row1 = STAGE_ORDER.slice(0, 5);
  const row2 = STAGE_ORDER.slice(5);

  const makeNodeData = (stage: string, handles: HandleConfig, col: number, rowY: number) => {
    const idx = STAGE_ORDER.indexOf(stage);
    return {
      id: stage,
      type: "stageNode",
      position: { x: col * COL_STEP, y: rowY },
      data: {
        stage, label: STAGE_LABEL[stage], desc: STAGE_DESC[stage],
        icon: STAGE_ICON[stage],
        isCurrentStage: task.stage === stage,
        isCompleted: idx < currentIdx,
        isPending: idx > currentIdx,
        isSelected: selectedStage === stage,
        status: task.stage === stage ? task.status : undefined,
        requiresApproval: APPROVAL_STAGES.has(stage),
        handles,
        onClick: onClickStage,
      } satisfies StageNodeData,
    };
  };

  const nodes: Node[] = [
    ...row1.map((stage, col) => {
      const handles: HandleConfig =
        col === 0 ? { rightSource: true } :
        col === 4 ? { leftTarget: true, bottomSource: true } :
                    { leftTarget: true, rightSource: true };
      return makeNodeData(stage, handles, col, 0);
    }),
    ...row2.map((stage, i) => {
      const col = 4 - i;
      const handles: HandleConfig =
        i === 0   ? { topTarget: true, leftSource: true } :
        col === 0 ? { rightTarget: true } :
                    { rightTarget: true, leftSource: true };
      return makeNodeData(stage, handles, col, ROW_2_Y);
    }),
  ];

  const edgeColor = (idx: number) =>
    idx < currentIdx    ? "#10b981" :
    idx === currentIdx  ? "#4477ff" : "#1e1e30";

  const edgeLabel = (nextStage: string, idx: number) =>
    APPROVAL_STAGES.has(nextStage) && idx < currentIdx
      ? {
          label: "审批通过",
          labelStyle: { fill: "#4ade80", fontSize: 9, fontWeight: 600 },
          labelBgStyle: { fill: "#14532d", fillOpacity: 0.9 },
          labelBgPadding: [4, 6] as [number, number],
          labelBgBorderRadius: 4,
        }
      : {};

  const edges = [
    ...row1.slice(0, -1).map((stage, i) => {
      const idx = STAGE_ORDER.indexOf(stage);
      const color = edgeColor(idx);
      return {
        id: `${stage}→${row1[i + 1]}`,
        source: stage, sourceHandle: "rs",
        target: row1[i + 1], targetHandle: "lt",
        animated: idx === currentIdx && task.status === "running",
        style: { stroke: color, strokeWidth: idx < currentIdx ? 2 : 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        ...edgeLabel(row1[i + 1], idx),
      };
    }),
    (() => {
      const planIdx = STAGE_ORDER.indexOf("plan");
      const color = edgeColor(planIdx);
      return {
        id: "plan→dev",
        source: "plan", sourceHandle: "b",
        target: "dev",  targetHandle: "t",
        animated: planIdx === currentIdx && task.status === "running",
        style: { stroke: color, strokeWidth: planIdx < currentIdx ? 2 : 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
      };
    })(),
    ...row2.slice(0, -1).map((stage, i) => {
      const idx = STAGE_ORDER.indexOf(stage);
      const color = edgeColor(idx);
      return {
        id: `${stage}→${row2[i + 1]}`,
        source: stage, sourceHandle: "ls",
        target: row2[i + 1], targetHandle: "rt",
        animated: idx === currentIdx && task.status === "running",
        style: { stroke: color, strokeWidth: idx < currentIdx ? 2 : 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        ...edgeLabel(row2[i + 1], idx),
      };
    }),
  ];

  return { nodes, edges };
}

// ── StageDetailPanel ──────────────────────────────────────────────

interface StageDetailPanelProps {
  stage: string;
  task: Task;
  artifacts: StageArtifact[];
  onClose: () => void;
  onRunStage: (stage: string) => void;
  onRefresh: () => void;
}

function StageDetailPanel({
  stage, task, artifacts, onClose, onRunStage, onRefresh
}: StageDetailPanelProps) {
  const currentIdx = STAGE_ORDER.indexOf(task.stage);
  const stageIdx   = STAGE_ORDER.indexOf(stage);
  const isCurrentStage = task.stage === stage;
  const isCompleted    = stageIdx < currentIdx;
  const isPending      = stageIdx > currentIdx;

  // 当前阶段的成果物
  const stageArtifacts = artifacts.filter(a => a.stage === stage);
  const latestArtifact = stageArtifacts[stageArtifacts.length - 1];

  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [acting, setActing] = useState(false);

  const act = async (fn: () => void | Promise<void>) => {
    setActing(true);
    try { await fn(); onRefresh(); } catch (e) { console.error(e); } finally { setActing(false); }
  };

  const statusColor =
    task.status === "running"        ? "text-blue-400" :
    task.status === "waiting_review" ? "text-yellow-400" :
    task.status === "approved"       ? "text-green-400" :
    task.status === "rejected"       ? "text-red-400" :
    task.status === "done"           ? "text-green-400" : "text-white/50";

  return (
    <div className="absolute bottom-4 right-4 w-72 backdrop-blur rounded-xl shadow-2xl z-10 overflow-hidden"
         style={{ background: "var(--background-secondary)", border: "1px solid var(--border)" }}>
      {/* Panel Header */}
      <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2">
        <span className="text-base">{STAGE_ICON[stage]}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white/90 truncate">{STAGE_LABEL[stage]}</p>
          <p className="text-[10px] text-white/40">{STAGE_DESC[stage]}</p>
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white/60 text-lg leading-none px-0.5">×</button>
      </div>

      <div className="px-4 py-3 space-y-3 max-h-[420px] overflow-y-auto">
        {/* 状态标签 */}
        <div className="flex items-center gap-2 flex-wrap">
          {isCompleted && (
            <span className="text-[10px] bg-green-500/15 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full">已完成</span>
          )}
          {isPending && (
            <span className="text-[10px] bg-white/5 text-white/40 border border-white/10 px-2 py-0.5 rounded-full">等待执行</span>
          )}
          {isCurrentStage && (
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium flex items-center gap-1", statusColor,
              task.status === "running" ? "bg-blue-500/10 border-blue-500/30" :
              task.status === "waiting_review" ? "bg-yellow-500/10 border-yellow-500/30" :
              "bg-white/5 border-white/10"
            )}>
              {task.status === "running" && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />}
              {STATUS_LABEL[task.status] ?? task.status}
            </span>
          )}
          {APPROVAL_STAGES.has(stage) && (
            <span className="text-[10px] text-yellow-400/60 border border-yellow-500/20 px-2 py-0.5 rounded-full">需审批</span>
          )}
        </div>

        {/* 操作按钮 (当前阶段) */}
        {isCurrentStage && (
          <div className="space-y-2">
            {task.status === "pending" && stage !== "done" && (
              <button
                onClick={() => act(() => onRunStage(stage))}
                disabled={acting}
                className="w-full py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors disabled:opacity-40"
              >
                {acting ? "启动中..." : `启动 ${STAGE_LABEL[stage]}`}
              </button>
            )}
            {task.status === "waiting_review" && !showReject && (
              <div className="flex gap-2">
                <button
                  onClick={() => act(() => api.tasks.approve(task.id, "approve").then(() => {}))}
                  disabled={acting}
                  className="flex-1 py-1.5 text-xs bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium disabled:opacity-40"
                >
                  批准
                </button>
                <button
                  onClick={() => setShowReject(true)}
                  disabled={acting}
                  className="flex-1 py-1.5 text-xs border border-red-500/40 text-red-400 hover:bg-red-500/10 rounded-lg font-medium"
                >
                  驳回
                </button>
              </div>
            )}
            {task.status === "waiting_review" && showReject && (
              <div className="space-y-2">
                <input
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="驳回原因（必填）"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/80 outline-none focus:border-accent/60"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => act(() => api.tasks.approve(task.id, "reject", rejectReason).then(() => {}))}
                    disabled={acting || !rejectReason.trim()}
                    className="flex-1 py-1.5 text-xs bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium disabled:opacity-40"
                  >
                    确认驳回
                  </button>
                  <button onClick={() => setShowReject(false)} className="text-xs text-white/40 hover:text-white/60 px-2">取消</button>
                </div>
              </div>
            )}
            {task.status === "approved" && (
              <button
                onClick={() => act(() => api.tasks.advance(task.id).then(() => {}))}
                disabled={acting}
                className="w-full py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded-lg font-medium disabled:opacity-40"
              >
                {acting ? "推进中..." : "推进到下一阶段"}
              </button>
            )}
            {task.status === "rejected" && (
              <button
                onClick={() => act(() => onRunStage(stage))}
                disabled={acting}
                className="w-full py-1.5 text-xs border border-accent/40 text-accent hover:bg-accent/10 rounded-lg font-medium disabled:opacity-40"
              >
                重新执行
              </button>
            )}
          </div>
        )}

        {/* 成果物预览 */}
        {latestArtifact && (
          <div className="space-y-2">
            <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium">成果物</p>

            {/* 置信度 */}
            {latestArtifact.confidence !== null && latestArtifact.confidence !== undefined && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/40">置信度</span>
                <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full",
                      latestArtifact.confidence >= 0.8 ? "bg-green-500" :
                      latestArtifact.confidence >= 0.6 ? "bg-yellow-500" : "bg-red-500"
                    )}
                    style={{ width: `${Math.round(latestArtifact.confidence * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-white/60 tabular-nums font-medium">
                  {Math.round(latestArtifact.confidence * 100)}%
                </span>
              </div>
            )}

            {/* 重试次数 */}
            {latestArtifact.retry_count > 0 && (
              <p className="text-[10px] text-orange-400">重试了 {latestArtifact.retry_count} 次</p>
            )}

            {/* 内容预览 */}
            <div className="bg-white/4 rounded-lg p-2.5 border border-white/6">
              <pre className="text-[10px] text-white/60 whitespace-pre-wrap overflow-x-auto max-h-32 overflow-y-auto leading-relaxed">
                {(() => {
                  try {
                    const p = JSON.parse(latestArtifact.content);
                    return JSON.stringify(p, null, 2).slice(0, 600);
                  } catch {
                    return latestArtifact.content.slice(0, 600);
                  }
                })()}{latestArtifact.content.length > 600 ? "\n…" : ""}
              </pre>
            </div>

            {/* Critic 评审结果 */}
            {latestArtifact.critic_notes && (() => {
              try {
                const c = JSON.parse(latestArtifact.critic_notes);
                return (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-white/40">Critic</span>
                    <span className={cn("text-[10px] font-bold",
                      (c.score ?? 0) >= 8 ? "text-green-400" :
                      (c.score ?? 0) >= 6 ? "text-yellow-400" : "text-red-400"
                    )}>{c.score}/10</span>
                    <span className={cn("text-[10px]", c.pass_review ? "text-green-400" : "text-red-400")}>
                      {c.pass_review ? "通过" : "未通过"}
                    </span>
                  </div>
                );
              } catch { return null; }
            })()}
          </div>
        )}

        {/* 待执行说明 */}
        {isPending && !latestArtifact && (
          <div className="bg-white/4 rounded-lg px-3 py-2.5 border border-white/6">
            <p className="text-[10px] text-white/40 leading-relaxed">
              等待前序阶段完成后自动执行（或手动触发）
            </p>
          </div>
        )}

        {/* 时间信息 */}
        {latestArtifact && (
          <p className="text-[9px] text-white/25">
            {new Date(latestArtifact.created_at).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────

export interface TaskWorkflowProps {
  task: Task;
  artifacts?: StageArtifact[];
  onRunStage?: (stage: string) => void;
  onRefresh?: () => void;
}

export function TaskWorkflow({ task, artifacts = [], onRefresh }: TaskWorkflowProps) {
  const [selectedStage, setSelectedStage] = useState<string | null>(task.stage);

  const handleClickStage = useCallback((stage: string) => {
    setSelectedStage(prev => prev === stage ? null : stage);
  }, []);

  const { nodes, edges } = useMemo(
    () => buildGraph(task, selectedStage, handleClickStage),
    [task.stage, task.status, selectedStage, handleClickStage],
  );

  const handleRunStage = async (stage: string) => {
    await api.pipeline.runStage(task.id, stage);
    onRefresh?.();
  };

  return (
    <div className="w-full h-full overflow-hidden relative" style={{ background: "var(--background)" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.25}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        onPaneClick={() => setSelectedStage(null)}
      >
        <Background color="#1e1e30" gap={24} size={1.5} variant={BackgroundVariant.Dots} />
        <Controls
          showInteractive={false}
          style={{
            background: "var(--background-secondary)",
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}
        />
      </ReactFlow>

      {/* 阶段详情面板 */}
      {selectedStage && (
        <StageDetailPanel
          key={selectedStage}
          stage={selectedStage}
          task={task}
          artifacts={artifacts}
          onClose={() => setSelectedStage(null)}
          onRunStage={handleRunStage}
          onRefresh={onRefresh ?? (() => {})}
        />
      )}

      {/* 提示 */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none">
        <span className="text-[10px] text-white/20 bg-black/30 px-3 py-1 rounded-full">
          点击节点查看阶段详情与操作
        </span>
      </div>
    </div>
  );
}
