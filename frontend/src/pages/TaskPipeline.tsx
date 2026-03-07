// frontend/src/pages/TaskPipeline.tsx
import { useEffect, useState, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { api, type Task, type StageArtifact, getWsUrl } from "../lib/api";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { TaskWorkflow } from "../components/TaskWorkflow";
import { cn } from "../lib/utils";

interface TaskPipelineProps {
  taskId: number;
  onBack: () => void;
}

function useTPStageLabelMap() {
  const { t } = useTranslation();
  return useMemo<Record<string, string>>(() => ({
    input: t('taskPipeline.stageLabel.input'), analysis: t('taskPipeline.stageLabel.analysis'), prd: t('taskPipeline.stageLabel.prd'), ui: t('taskPipeline.stageLabel.ui'),
    plan: t('taskPipeline.stageLabel.plan'), dev: t('taskPipeline.stageLabel.dev'), test: t('taskPipeline.stageLabel.test'), deploy: t('taskPipeline.stageLabel.deploy'), monitor: t('taskPipeline.stageLabel.monitor'),
  }), [t]);
}

function useTPStatusLabelMap() {
  const { t } = useTranslation();
  return useMemo<Record<string, string>>(() => ({
    pending: t('taskPipeline.status.pending'), running: t('taskPipeline.status.running'), waiting_review: t('taskPipeline.status.approval'),
    approved: t('taskPipeline.status.approved'), rejected: t('taskPipeline.status.rejected'), done: t('taskPipeline.status.done'),
    failed: t('taskPipeline.status.failed'), queued: t('taskPipeline.status.queued'),
  }), [t]);
}
const STAGE_COLORS: Record<string, "default" | "success" | "warning" | "danger" | "info" | "accent"> = {
  input: "default", analysis: "warning", prd: "warning", ui: "accent",
  plan: "accent", dev: "info", test: "warning", deploy: "success", monitor: "success",
};

// ── ConfidenceMeter ──────────────────────────────────────────────
function ConfidenceMeter({ value }: { value: number }) {
  const { t } = useTranslation();
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-yellow-500" : "bg-red-500";
  const textColor = pct >= 80 ? "text-green-400" : pct >= 60 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[10px] text-app-tertiary whitespace-nowrap">{t('taskPipeline.confidenceMeter')}</span>
      <div className="flex-1 h-1.5 bg-app-tertiary/30 rounded-full overflow-hidden min-w-[60px]">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("text-[11px] font-semibold tabular-nums whitespace-nowrap", textColor)}>{pct}%</span>
    </div>
  );
}

// ── AssumptionsList ──────────────────────────────────────────────
function AssumptionsList({ raw }: { raw: string }) {
  const { t } = useTranslation();
  const items: string[] = (() => { try { return JSON.parse(raw); } catch { return [raw]; } })();
  const [wrong, setWrong] = useState<Set<number>>(new Set());
  if (!items.length) return null;
  return (
    <div className="space-y-1">
      {items.map((item, i) => (
        <div key={i} className={cn(
          "flex items-start gap-2 px-2 py-1 rounded text-[11px] group",
          wrong.has(i) ? "bg-red-900/20 text-red-400 line-through" : "text-app-secondary"
        )}>
          <span className="mt-0.5 text-app-tertiary shrink-0">•</span>
          <span className="flex-1">{item}</span>
          <button
            onClick={() => setWrong(prev => {
              const next = new Set(prev);
              next.has(i) ? next.delete(i) : next.add(i);
              return next;
            })}
            className={cn(
              "opacity-0 group-hover:opacity-100 text-[9px] px-1.5 py-0.5 rounded border transition-all shrink-0",
              wrong.has(i)
                ? "border-green-700 text-green-400 hover:bg-green-900/20"
                : "border-red-700/50 text-red-400 hover:bg-red-900/20"
            )}
            title={wrong.has(i) ? t('taskPipeline.assumptions.cancelMark') : t('taskPipeline.assumptions.markAsWrong')}
          >
            {wrong.has(i) ? t('taskPipeline.assumptions.undo') : t('taskPipeline.assumptions.wrong')}
          </button>
        </div>
      ))}
    </div>
  );
}

// ── CriticNotes ──────────────────────────────────────────────────
function CriticNotes({ notes }: { notes: string }) {
  const { t } = useTranslation();
  const parsed: { score?: number; issues?: string[]; suggestions?: string; pass_review?: boolean } =
    (() => { try { return JSON.parse(notes); } catch { return {}; } })();
  return (
    <div className="space-y-1.5">
      {parsed.score !== undefined && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-app-tertiary">{t('taskPipeline.criticNotes.title')}</span>
          <span className={cn(
            "text-xs font-bold",
            parsed.score >= 8 ? "text-green-400" : parsed.score >= 6 ? "text-yellow-400" : "text-red-400"
          )}>{parsed.score}/10</span>
          {parsed.pass_review !== undefined && (
            <Badge variant={parsed.pass_review ? "success" : "danger"}>
              {parsed.pass_review ? t('taskPipeline.criticNotes.pass') : t('taskPipeline.criticNotes.needsRevision')}
            </Badge>
          )}
        </div>
      )}
      {parsed.issues?.length ? (
        <div className="space-y-0.5">
          {parsed.issues.map((issue, i) => (
            <div key={i} className="text-[11px] text-yellow-400 flex gap-1.5">
              <span>⚠</span><span>{issue}</span>
            </div>
          ))}
        </div>
      ) : null}
      {parsed.suggestions && (
        <p className="text-[11px] text-app-secondary">{parsed.suggestions}</p>
      )}
    </div>
  );
}

// ── ArtifactCard ─────────────────────────────────────────────────
function ArtifactCard({ artifact }: {
  artifact: StageArtifact;
}) {
  const [expanded, setExpanded] = useState(true);

  // Try to pretty-print JSON content
  let displayContent = artifact.content;
  try {
    const parsed = JSON.parse(artifact.content);
    displayContent = JSON.stringify(parsed, null, 2);
  } catch { /* keep raw */ }

  return (
    <div className="bg-app-secondary border border-app rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-app-tertiary/10"
        onClick={() => setExpanded(e => !e)}
      >
        <Badge variant={STAGE_COLORS[artifact.stage] ?? "default"}>{STAGE_LABEL[artifact.stage]}</Badge>
        <span className="text-[10px] text-app-tertiary">{artifact.artifact_type}</span>
        {artifact.retry_count > 0 && (
          <span className="text-[10px] text-orange-400 bg-orange-900/20 px-1.5 py-0.5 rounded-full">
            重试 {artifact.retry_count}x
          </span>
        )}
        <span className="text-[10px] text-app-tertiary ml-auto">
          {new Date(artifact.created_at).toLocaleTimeString()}
        </span>
        <span className="text-[10px] text-app-tertiary">{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-app">
          {/* Confidence + Assumptions + Critic in a mini info row */}
          {(artifact.confidence !== null || artifact.assumptions || artifact.critic_notes) && (
            <div className="pt-2 space-y-2">
              {artifact.confidence !== null && (
                <ConfidenceMeter value={artifact.confidence} />
              )}
              {artifact.assumptions && (
                <div>
                  <p className="text-[10px] text-app-tertiary mb-1 uppercase tracking-wider">AI 假设前提</p>
                  <AssumptionsList raw={artifact.assumptions} />
                </div>
              )}
              {artifact.critic_notes && (
                <div>
                  <p className="text-[10px] text-app-tertiary mb-1 uppercase tracking-wider">Critic 评审</p>
                  <div className="bg-app/50 rounded p-2">
                    <CriticNotes notes={artifact.critic_notes} />
                  </div>
                </div>
              )}
              {artifact.error_log && (
                <div>
                  <p className="text-[10px] text-red-400 mb-1 uppercase tracking-wider">错误日志</p>
                  <pre className="text-[10px] text-red-300 bg-red-900/10 rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-24 overflow-y-auto">
                    {artifact.error_log}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Content */}
          <pre className="text-[11px] text-app-secondary overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto bg-app/50 rounded p-2">
            {displayContent.slice(0, 2000)}{displayContent.length > 2000 ? "\n…(截断)" : ""}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────
export default function TaskPipeline({ taskId, onBack }: TaskPipelineProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [artifacts, setArtifacts] = useState<StageArtifact[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [view, setView] = useState<"detail" | "flow">("flow");
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.tasks.get(taskId).then(setTask).catch(console.error);
    api.tasks.artifacts(taskId).then(setArtifacts).catch(console.error);
  }, [taskId]);

  useEffect(() => {
    const ws = new WebSocket(getWsUrl(`/ws/task/${taskId}`));
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "log") {
          // data 可能是纯字符串，也可能是 {content, stage} 兼容旧格式
          const line = typeof msg.data === "string"
            ? msg.data
            : (msg.data?.content ? String(msg.data.content) : JSON.stringify(msg.data));
          if (line) setLogs((prev) => [...prev, line]);
        }
        if (msg.type === "task_updated" || msg.type === "stage_update") {
          api.tasks.get(taskId).then(setTask).catch(console.error);
          api.tasks.artifacts(taskId).then(setArtifacts).catch(console.error);
        }
        if (msg.type === "stage_failed") {
          api.tasks.get(taskId).then(setTask).catch(console.error);
        }
      } catch {}
    };
    return () => ws.close();
  }, [taskId]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const refreshTask = () => {
    api.tasks.get(taskId).then(setTask).catch(console.error);
    api.tasks.artifacts(taskId).then(setArtifacts).catch(console.error);
  };

  const handleRunStage = async (stage: string) => {
    await api.pipeline.runStage(taskId, stage);
    setTask(t => t ? { ...t, status: "running" } : t);
  };

  const handleAdvance = async () => {
    await api.tasks.advance(taskId);
    refreshTask();
  };

  if (!task) return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-app-tertiary text-xs animate-pulse">加载任务...</p>
    </div>
  );

  const isRunning = task.status === "running";
  const isWaitingReview = task.status === "waiting_review";
  const isApproved = task.status === "approved";
  const canStart = task.status === "pending" && task.stage !== "done";

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-app flex items-center gap-3 shrink-0">
        <button onClick={onBack} className="text-app-tertiary hover:text-app text-xs flex items-center gap-1">
          ← 返回
        </button>
        <div className="w-px h-4 bg-border" />
        <h1 className="text-sm font-semibold text-app flex-1 truncate">{task.title}</h1>
        <Badge variant={STAGE_COLORS[task.stage] ?? "default"}>{STAGE_LABEL[task.stage]}</Badge>
        <Badge variant={
          task.status === "done" ? "success" :
          task.status === "running" ? "info" :
          task.status === "waiting_review" ? "warning" :
          task.status === "failed" || task.status === "rejected" ? "danger" : "default"
        }>
          {{ pending: "待处理", running: "运行中", waiting_review: "待审批", approved: "已批准",
             rejected: "已驳回", done: "已完成", failed: "失败", queued: "排队中" }[task.status] ?? task.status}
        </Badge>
        {/* view toggle */}
        <div className="flex items-center border border-app rounded-lg p-0.5 gap-0.5 ml-1">
          {(["detail", "flow"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "px-2.5 py-1 text-[10px] rounded-md transition-colors font-medium",
                view === v ? "bg-accent text-white" : "text-app-tertiary hover:text-app"
              )}
            >
              {v === "detail" ? "详情" : "流程图"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {view === "flow" ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <TaskWorkflow
              task={task}
              artifacts={artifacts}
              onRunStage={async (stage) => {
                await api.pipeline.runStage(taskId, stage);
                refreshTask();
              }}
              onRefresh={refreshTask}
            />
          </div>
          <LogPanel logs={logs} isRunning={isRunning} stage={task.stage} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Action Banner */}
          {canStart && (
            <div className="bg-accent/10 border border-accent/30 rounded-lg p-3 flex items-center justify-between">
              <p className="text-xs text-accent">任务处于 <b>{STAGE_LABEL[task.stage]}</b> 阶段，等待执行</p>
              <Button size="sm" onClick={() => handleRunStage(task.stage)}>
                启动 {STAGE_LABEL[task.stage]}
              </Button>
            </div>
          )}

          {isRunning && (
            <div className="bg-blue-900/10 border border-blue-800/30 rounded-lg p-3 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
              <p className="text-xs text-blue-400">Claude 正在执行 <b>{STAGE_LABEL[task.stage]}</b> 阶段...</p>
            </div>
          )}

          {isWaitingReview && (
            <ReviewBanner taskId={taskId} onDone={refreshTask} />
          )}

          {isApproved && (
            <div className="bg-green-900/10 border border-green-800/30 rounded-lg p-3 flex items-center justify-between">
              <p className="text-xs text-green-400">已批准，准备推进到下一阶段</p>
              <Button size="sm" onClick={handleAdvance}>推进到下一阶段</Button>
            </div>
          )}

          {task.status === "rejected" && (
            <div className="bg-red-900/10 border border-red-800/30 rounded-lg p-3">
              <p className="text-xs text-red-400">已驳回，可重新触发当前阶段</p>
              <Button size="sm" className="mt-2" onClick={() => handleRunStage(task.stage)}>
                重新执行
              </Button>
            </div>
          )}

          {/* Worktree info */}
          {task.worktree_path && (
            <div className="bg-app-secondary border border-app rounded-lg px-3 py-2 flex items-center gap-3">
              <span className="text-[10px] text-app-tertiary uppercase tracking-wider">Worktree</span>
              <code className="text-[11px] text-accent font-mono flex-1 truncate">{task.worktree_path}</code>
              {task.branch_name && (
                <span className="text-[10px] text-app-tertiary bg-app px-1.5 py-0.5 rounded font-mono">
                  {task.branch_name}
                </span>
              )}
            </div>
          )}

          {/* Stage Artifacts */}
          {artifacts.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-app mb-2">阶段成果物</h3>
              <div className="space-y-2">
                {artifacts.map((a) => (
                  <ArtifactCard
                    key={a.id}
                    artifact={a}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Live Logs */}
          {logs.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-app mb-2">实时日志</h3>
              <div className="bg-app-secondary border border-app rounded-lg p-3 font-mono text-[11px] text-app-secondary max-h-60 overflow-y-auto space-y-0.5">
                {logs.map((l, i) => <div key={i}>{l}</div>)}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}

          {/* Task meta */}
          <div className="text-[10px] text-app-tertiary space-y-0.5 pt-2 border-t border-app">
            <div>创建：{new Date(task.created_at).toLocaleString()}</div>
            {task.started_at && <div>开始：{new Date(task.started_at).toLocaleString()}</div>}
            {task.finished_at && <div>完成：{new Date(task.finished_at).toLocaleString()}</div>}
            {task.queued_at && !task.started_at && <div>入队：{new Date(task.queued_at).toLocaleString()}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── LogPanel ──────────────────────────────────────────────────────
function LogPanel({ logs, isRunning, stage }: {
  logs: string[];
  isRunning: boolean;
  stage: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, expanded]);

  // 自动展开：开始运行时展开
  useEffect(() => { if (isRunning) setExpanded(true); }, [isRunning]);

  if (!isRunning && logs.length === 0) return null;

  const lastLine = logs[logs.length - 1] ?? "";

  return (
    <div className="shrink-0 border-t border-white/8 bg-[#080d15]">
      {/* 顶栏 */}
      <div
        className="flex items-center gap-2 px-4 py-2 cursor-pointer select-none hover:bg-white/3"
        onClick={() => setExpanded(e => !e)}
      >
        {/* 运行指示 */}
        <span className="relative flex items-center justify-center w-3 h-3 shrink-0">
          {isRunning ? (
            <>
              <span className="absolute w-3 h-3 rounded-full bg-blue-400/30 animate-ping" />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            </>
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          )}
        </span>
        <span className="text-[11px] text-white/40 font-mono shrink-0">
          {isRunning ? `执行中 · ${STAGE_LABEL[stage] ?? stage}` : "执行完成"}
        </span>
        {/* 未展开时显示最后一行 */}
        {!expanded && lastLine && (
          <span className="text-[11px] text-white/50 font-mono truncate flex-1 ml-2">
            {lastLine}
          </span>
        )}
        <span className="ml-auto text-[10px] text-white/25 shrink-0">
          {logs.length} 行 {expanded ? "▼" : "▲"}
        </span>
      </div>

      {/* 日志内容 */}
      {expanded && (
        <div className="px-4 pb-3 max-h-52 overflow-y-auto font-mono text-[11px] space-y-0.5">
          {logs.length === 0 ? (
            <p className="text-white/20 py-1">等待输出...</p>
          ) : (
            logs.map((line, i) => (
              <div key={i} className="flex gap-2 leading-relaxed">
                <span className="text-white/15 shrink-0 tabular-nums select-none w-6 text-right">{i + 1}</span>
                <span className={cn(
                  "flex-1 break-all",
                  line.toLowerCase().includes("error") || line.toLowerCase().includes("错误")
                    ? "text-red-400"
                    : line.toLowerCase().includes("warn") || line.toLowerCase().includes("警告")
                    ? "text-yellow-400"
                    : line.startsWith("[critic]") || line.startsWith("✓") || line.startsWith("✗")
                    ? "text-blue-300"
                    : "text-white/60"
                )}>
                  {line}
                </span>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}

// ── ReviewBanner ─────────────────────────────────────────────────
function ReviewBanner({ taskId, onDone }: { taskId: number; onDone: () => void }) {
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const handleApprove = async () => {
    await api.tasks.approve(taskId, "approve");
    onDone();
  };
  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    await api.tasks.approve(taskId, "reject", rejectReason);
    setShowReject(false);
    onDone();
  };

  return (
    <div className="bg-yellow-900/10 border border-yellow-800/30 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-yellow-400">等待审批：请查看成果物后批准或驳回</p>
        {!showReject ? (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowReject(true)}>驳回</Button>
            <Button size="sm" onClick={handleApprove}>批准</Button>
          </div>
        ) : (
          <div className="flex gap-2 items-center">
            <input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="驳回原因（必填）"
              className="bg-app border border-app rounded px-2 py-1 text-xs text-app outline-none focus:border-accent w-44"
            />
            <Button variant="danger" size="sm" disabled={!rejectReason.trim()} onClick={handleReject}>确认驳回</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowReject(false)}>取消</Button>
          </div>
        )}
      </div>
    </div>
  );
}
