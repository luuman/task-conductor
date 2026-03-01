import { useEffect, useState } from "react";
import { api, type Task, type StageArtifact, type AnalysisOption } from "../lib/api";
import { StageProgress } from "../components/StageProgress";
import { OptionCards } from "../components/OptionCards";
import { LogStream } from "../components/LogStream";
import { useTaskWs } from "../hooks/useTaskWs";

export default function TaskPipeline({
  taskId,
  onBack,
}: {
  taskId: number;
  onBack: () => void;
}) {
  const [task, setTask] = useState<Task | null>(null);
  const [artifacts, setArtifacts] = useState<StageArtifact[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [options, setOptions] = useState<AnalysisOption[]>([]);
  const [loading, setLoading] = useState(false);

  useTaskWs(taskId, (msg) => {
    if (msg.type === "log" && msg.data?.content) {
      setLogs((prev) => [...prev, String(msg.data.content)]);
    }
    if (msg.type === "stage_update") {
      setTask((prev) =>
        prev
          ? { ...prev, stage: msg.data.stage, status: msg.data.status }
          : prev
      );
      if (msg.data.options?.length) {
        setOptions(msg.data.options);
      }
      // 刷新 artifacts
      api.tasks.artifacts(taskId).then(setArtifacts).catch(() => {});
    }
  });

  useEffect(() => {
    api.tasks.get(taskId).then(setTask).catch(() => {});
    api.tasks.artifacts(taskId).then(setArtifacts).catch(() => {});
  }, [taskId]);

  // 从已有 artifact 中恢复 options
  useEffect(() => {
    const analysisArtifact = artifacts.find((a) => a.stage === "analysis");
    if (analysisArtifact && options.length === 0) {
      try {
        const parsed = JSON.parse(analysisArtifact.content);
        if (parsed.options?.length) setOptions(parsed.options);
      } catch {}
    }
  }, [artifacts]);

  const handleStartAnalysis = async () => {
    setLoading(true);
    setLogs([]);
    try {
      await api.pipeline.runAnalysis(taskId);
      setTask((prev) => prev ? { ...prev, status: "running" } : prev);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (action: "approve" | "reject") => {
    let reason = "";
    if (action === "reject") {
      reason = window.prompt("请输入驳回原因：") || "";
      if (!reason) return;
    }
    setLoading(true);
    try {
      await api.tasks.approve(taskId, action, reason);
      if (action === "approve") {
        const advanced = await api.tasks.advance(taskId);
        setTask(advanced);
      } else {
        setTask((prev) => prev ? { ...prev, status: "rejected" } : prev);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = async (_label: string) => {
    setLoading(true);
    try {
      await api.tasks.approve(taskId, "approve");
      const advanced = await api.tasks.advance(taskId);
      setTask(advanced);
      setOptions([]);
    } finally {
      setLoading(false);
    }
  };

  if (!task) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="animate-pulse text-gray-500">加载中...</div>
      </div>
    );
  }

  const showOptions =
    task.status === "waiting_review" && options.length > 0;
  const showApprovalButtons =
    task.status === "waiting_review" && options.length === 0;
  const showStartAnalysis =
    task.stage === "input" && task.status === "pending";
  const showLog = task.status === "running" || logs.length > 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* 顶部导航 */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-white transition text-sm"
        >
          ← 返回
        </button>
        <span className="text-gray-700">|</span>
        <h1 className="text-lg font-semibold truncate flex-1">{task.title}</h1>
        <StatusBadge status={task.status} />
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* 流水线进度 */}
        <section className="bg-gray-900 rounded-2xl p-5">
          <StageProgress currentStage={task.stage} status={task.status} />
        </section>

        {/* 当前阶段操作区 */}
        <section className="bg-gray-900 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-200">
              当前阶段：
              <span className="text-white ml-1">{stageLabel(task.stage)}</span>
            </h2>
            {loading && (
              <span className="text-xs text-gray-500 animate-pulse">处理中...</span>
            )}
          </div>

          {/* input 阶段：启动分析按钮 */}
          {showStartAnalysis && (
            <button
              onClick={handleStartAnalysis}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-6 py-3 rounded-xl font-medium transition"
            >
              开始 AI 需求分析
            </button>
          )}

          {/* 运行中：日志流 */}
          {showLog && <LogStream lines={logs} />}

          {/* 有方案可选：选择卡片 */}
          {showOptions && (
            <div className="space-y-4">
              <p className="text-gray-400 text-sm">AI 生成了以下方案，请选择：</p>
              <OptionCards
                options={options}
                onSelect={handleSelectOption}
                recommended="A"
              />
              <button
                onClick={() => handleApprove("reject")}
                disabled={loading}
                className="text-sm text-red-400 hover:text-red-300 transition"
              >
                驳回，重新生成
              </button>
            </div>
          )}

          {/* 等待纯文本审批（PRD、测试报告等） */}
          {showApprovalButtons && (
            <div className="flex gap-3">
              <button
                onClick={() => handleApprove("approve")}
                disabled={loading}
                className="px-6 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-xl font-medium transition"
              >
                确认通过
              </button>
              <button
                onClick={() => handleApprove("reject")}
                disabled={loading}
                className="px-4 py-2.5 bg-red-900 hover:bg-red-800 disabled:opacity-50 rounded-xl text-sm transition"
              >
                驳回
              </button>
            </div>
          )}

          {/* 已驳回 */}
          {task.status === "rejected" && (
            <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-sm text-red-300">
              已驳回，等待 AI 重新生成...
            </div>
          )}
        </section>

        {/* 成果物历史 */}
        {artifacts.length > 0 && (
          <section className="bg-gray-900 rounded-2xl p-5 space-y-3">
            <h2 className="font-semibold text-gray-200">成果物历史</h2>
            <div className="space-y-2">
              {artifacts.map((a) => (
                <ArtifactItem key={a.id} artifact={a} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function ArtifactItem({ artifact }: { artifact: StageArtifact }) {
  const [open, setOpen] = useState(false);
  const content =
    artifact.artifact_type === "json"
      ? (() => {
          try {
            return JSON.stringify(JSON.parse(artifact.content), null, 2);
          } catch {
            return artifact.content;
          }
        })()
      : artifact.content;

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex justify-between items-center px-4 py-3 text-sm text-gray-300 hover:text-white transition"
      >
        <span>
          <span className="text-green-400 mr-2">✓</span>
          {stageLabel(artifact.stage)}
          <span className="text-gray-600 ml-2 text-xs">{artifact.artifact_type}</span>
        </span>
        <span className="text-gray-600">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <pre className="px-4 pb-4 text-xs text-gray-400 whitespace-pre-wrap overflow-auto max-h-72 border-t border-gray-700 pt-3">
          {content}
        </pre>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-gray-700 text-gray-300",
    running: "bg-blue-700 text-blue-100 animate-pulse",
    waiting_review: "bg-yellow-800 text-yellow-200",
    approved: "bg-green-700 text-green-100",
    rejected: "bg-red-800 text-red-200",
    done: "bg-green-500 text-white",
    failed: "bg-red-700 text-red-100",
  };
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${map[status] ?? "bg-gray-700"}`}>
      {status}
    </span>
  );
}

function stageLabel(stage: string): string {
  const map: Record<string, string> = {
    input: "需求输入",
    analysis: "需求分析",
    prd: "PRD 生成",
    ui: "UI 设计",
    plan: "技术方案",
    dev: "并行开发",
    test: "自动测试",
    deploy: "部署发布",
    monitor: "监控告警",
    done: "已完成",
  };
  return map[stage] ?? stage;
}
