// frontend/src/pages/TaskPipeline.tsx
import { useEffect, useState, useRef } from "react";
import { api, type Task, type StageArtifact, type AnalysisOption, getWsUrl } from "../lib/api";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";

interface TaskPipelineProps {
  taskId: number;
  onBack: () => void;
}

const STAGES = ["input", "analysis", "prd", "ui", "plan", "dev", "test", "deploy", "monitor"];
const STAGE_LABEL: Record<string, string> = {
  input: "需求", analysis: "分析", prd: "PRD", ui: "UI设计",
  plan: "技术方案", dev: "开发", test: "测试", deploy: "发布", monitor: "监控",
};
const STAGE_COLORS: Record<string, "default" | "success" | "warning" | "danger" | "info" | "accent"> = {
  input: "default", analysis: "warning", prd: "warning", ui: "accent",
  plan: "accent", dev: "info", test: "warning", deploy: "success", monitor: "success",
};

export default function TaskPipeline({ taskId, onBack }: TaskPipelineProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [artifacts, setArtifacts] = useState<StageArtifact[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [options, setOptions] = useState<AnalysisOption[]>([]);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    api.tasks.get(taskId).then(setTask).catch(console.error);
    api.tasks.artifacts(taskId).then(setArtifacts).catch(console.error);
  }, [taskId]);

  useEffect(() => {
    const ws = new WebSocket(getWsUrl(`/ws/task/${taskId}`));
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "log") setLogs((prev) => [...prev, msg.data]);
        if (msg.type === "task_updated") {
          setTask(msg.data);
          api.tasks.artifacts(taskId).then(setArtifacts).catch(console.error);
        }
      } catch {}
    };
    return () => ws.close();
  }, [taskId]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Parse options from artifacts
  useEffect(() => {
    const analysisArtifact = artifacts.find(a => a.stage === "analysis");
    if (analysisArtifact) {
      try {
        const parsed = JSON.parse(analysisArtifact.content);
        if (Array.isArray(parsed)) setOptions(parsed);
      } catch {}
    }
  }, [artifacts]);

  const handleApprove = async () => {
    if (!task) return;
    await api.tasks.approve(taskId, "approve");
    setTask(t => t ? { ...t, status: "approved" } : t);
  };

  const handleReject = async () => {
    if (!task || !rejectReason.trim()) return;
    await api.tasks.approve(taskId, "reject", rejectReason);
    setTask(t => t ? { ...t, status: "rejected" } : t);
    setShowReject(false);
    setRejectReason("");
  };

  const handleRunAnalysis = async () => {
    await api.pipeline.runAnalysis(taskId);
    setTask(t => t ? { ...t, status: "running" } : t);
  };

  const stageIdx = task ? STAGES.indexOf(task.stage) : -1;

  if (!task) return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-app-tertiary text-xs animate-pulse">Loading task...</p>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-app flex items-center gap-3 shrink-0">
        <button onClick={onBack} className="text-app-tertiary hover:text-app text-xs flex items-center gap-1">
          &larr; Back
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
          {task.status}
        </Badge>
      </div>

      {/* Stage Progress */}
      <div className="px-5 py-3 border-b border-app shrink-0">
        <div className="flex items-center gap-1">
          {STAGES.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className={cn(
                "flex-1 flex flex-col items-center gap-1 cursor-default",
              )}>
                <div className={cn(
                  "w-full h-1 rounded-full transition-colors",
                  i < stageIdx ? "bg-accent" :
                  i === stageIdx ? "bg-accent-subtle" :
                  "bg-app-tertiary"
                )} />
                <span className={cn(
                  "text-[9px] font-medium",
                  i === stageIdx ? "text-accent" :
                  i < stageIdx ? "text-app-secondary" :
                  "text-app-tertiary"
                )}>
                  {STAGE_LABEL[s]}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Action buttons */}
          {task.status === "pending" && task.stage === "analysis" && (
            <div className="flex gap-2">
              <Button onClick={handleRunAnalysis}>开始需求分析</Button>
            </div>
          )}

          {task.status === "waiting_review" && (
            <div className="bg-yellow-900/10 border border-yellow-800/30 rounded-lg p-3 flex items-center justify-between">
              <p className="text-xs text-yellow-400">等待审批：请查看分析结果并确认或驳回</p>
              <div className="flex gap-2">
                {!showReject ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setShowReject(true)}>驳回</Button>
                    <Button size="sm" onClick={handleApprove}>批准</Button>
                  </>
                ) : (
                  <div className="flex gap-2 items-center">
                    <input
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="驳回原因（必填）"
                      className="bg-app-tertiary border border-app rounded px-2 py-1 text-xs text-app outline-none focus:border-accent w-40"
                    />
                    <Button variant="danger" size="sm" disabled={!rejectReason.trim()} onClick={handleReject}>确认驳回</Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowReject(false)}>取消</Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Options (if available) */}
          {options.length > 0 && task.status === "waiting_review" && (
            <div>
              <h3 className="text-xs font-semibold text-app mb-2">方案选择</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {options.map((opt, i) => (
                  <div key={i} className="bg-app-secondary border border-app rounded-lg p-3 space-y-2 hover:border-accent/40 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-app">{opt.label}</span>
                      <span className="text-[10px] text-app-tertiary">工作量: {opt.effort}</span>
                    </div>
                    <p className="text-[11px] font-medium text-app-secondary">{opt.title}</p>
                    <p className="text-[10px] text-app-tertiary">{opt.description}</p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-app-tertiary">风险: {opt.risk}</span>
                      <Button size="sm" variant="outline" onClick={async () => {
                        await api.tasks.approve(taskId, "approve", `选择方案: ${opt.label}`);
                        setTask(t => t ? { ...t, status: "approved" } : t);
                      }}>选择</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Artifacts */}
          {artifacts.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-app mb-2">成果物</h3>
              <div className="space-y-2">
                {artifacts.map((a) => (
                  <div key={a.id} className="bg-app-secondary border border-app rounded-lg">
                    <div className="px-3 py-2 border-b border-app flex items-center gap-2">
                      <Badge variant={STAGE_COLORS[a.stage] ?? "default"}>{STAGE_LABEL[a.stage]}</Badge>
                      <span className="text-[10px] text-app-tertiary">{a.artifact_type}</span>
                      <span className="text-[10px] text-app-tertiary ml-auto">{new Date(a.created_at).toLocaleTimeString()}</span>
                    </div>
                    <pre className="p-3 text-[11px] text-app-secondary overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
                      {a.content.slice(0, 1000)}{a.content.length > 1000 ? "..." : ""}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Logs */}
          {logs.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-app mb-2">实时日志</h3>
              <div className="bg-app-secondary border border-app rounded-lg p-3 font-mono text-[11px] text-app-secondary max-h-60 overflow-y-auto space-y-0.5">
                {logs.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
