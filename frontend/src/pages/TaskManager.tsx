// frontend/src/pages/TaskManager.tsx
// AI 驱动的任务管理 — 待办 → AI分析 → 开发队列

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type InboxItem, type ItemAnalysis, type Project } from "../lib/api";
import { cn } from "../lib/utils";

// ── 类型 ─────────────────────────────────────────────────────

interface QueueTask {
  analysis: ItemAnalysis;
  title: string;
  description: string;
  projectId: number | null;
  projectName: string;
  taskId: number | null;   // 创建后的真实 task id
}

type AnalyzePhase = "idle" | "loading" | "done";

// ── 复杂度徽章 ───────────────────────────────────────────────

const COMPLEXITY_COLOR: Record<string, string> = {
  S:  "bg-green-500/15 text-green-400 border-green-500/20",
  M:  "bg-blue-500/15 text-blue-400 border-blue-500/20",
  L:  "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  XL: "bg-red-500/15 text-red-400 border-red-500/20",
};
const COMPLEXITY_KEYS: Record<string, string> = { S: "taskManager.complexityLabels.S", M: "taskManager.complexityLabels.M", L: "taskManager.complexityLabels.L", XL: "taskManager.complexityLabels.XL" };

function ComplexityBadge({ c }: { c: string }) {
  const { t } = useTranslation();
  return (
    <span className={cn(
      "text-[9px] px-1.5 py-0.5 rounded border font-mono font-medium",
      COMPLEXITY_COLOR[c] ?? "bg-gray-500/15 text-gray-400 border-gray-500/20"
    )}>
      {COMPLEXITY_KEYS[c] ? t(COMPLEXITY_KEYS[c]) : c}
    </span>
  );
}

// ── 优先级圆圈 ───────────────────────────────────────────────

function PriorityBadge({ n }: { n: number }) {
  const colors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-blue-500", "bg-gray-500"];
  return (
    <div className={cn(
      "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0",
      colors[Math.min(n - 1, colors.length - 1)]
    )}>
      {n}
    </div>
  );
}

// ── 主页面 ───────────────────────────────────────────────────

export default function TaskManager({ projects }: { projects: Project[] }) {
  const { t } = useTranslation();
  // 待办清单
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [inputTitle, setInputTitle] = useState("");
  const [inputDesc, setInputDesc] = useState("");
  const [showDesc, setShowDesc] = useState(false);

  // AI 分析
  const [phase, setPhase] = useState<AnalyzePhase>("idle");
  const [analyses, setAnalyses] = useState<ItemAnalysis[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<ItemAnalysis>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  // 开发队列
  const [queue, setQueue] = useState<QueueTask[]>([]);

  // 项目选择弹窗
  const [pendingAccept, setPendingAccept] = useState<{ analysis: ItemAnalysis; item: InboxItem } | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);

  // ── 待办操作 ─────────────────────────────────────────────

  const addToInbox = () => {
    const title = inputTitle.trim();
    if (!title) return;
    setInbox((prev) => [...prev, {
      id: `inbox-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      description: inputDesc.trim(),
    }]);
    setInputTitle("");
    setInputDesc("");
    setShowDesc(false);
  };

  const removeFromInbox = (id: string) => {
    setInbox((prev) => prev.filter((i) => i.id !== id));
    setAnalyses((prev) => prev.filter((a) => a.id !== id));
  };

  // ── AI 分析 ──────────────────────────────────────────────

  const runAnalyze = async () => {
    if (inbox.length === 0) return;
    setPhase("loading");
    setSkipped(new Set());
    try {
      const resp = await api.taskManager.analyze(inbox);
      setAnalyses(resp.results);
      setPhase("done");
    } catch {
      setPhase("idle");
    }
  };

  const getAnalysis = (id: string) => analyses.find((a) => a.id === id);

  // ── 编辑 AI 结果 ─────────────────────────────────────────

  const startEdit = (a: ItemAnalysis) => {
    setEditingId(a.id);
    setEditDraft({ understanding: a.understanding, complexity: a.complexity, approach: a.approach });
  };

  const saveEdit = (id: string) => {
    setAnalyses((prev) => prev.map((a) => a.id === id ? { ...a, ...editDraft } : a));
    setEditingId(null);
    setEditDraft({});
  };

  // ── 接受任务 → 选择项目 ──────────────────────────────────

  const acceptAnalysis = (a: ItemAnalysis) => {
    const item = inbox.find((i) => i.id === a.id)!;
    setPendingAccept({ analysis: a, item });
    setSelectedProjectId(projects[0]?.id ?? null);
  };

  const confirmAccept = async () => {
    if (!pendingAccept || !selectedProjectId) return;
    const { analysis, item } = pendingAccept;
    setCreatingTask(true);
    try {
      const task = await api.tasks.create(selectedProjectId, {
        title: item.title,
        description: `${analysis.understanding}\n\n实现方向：${analysis.approach}`,
      });
      const proj = projects.find((p) => p.id === selectedProjectId);
      setQueue((prev) => [...prev, {
        analysis,
        title: item.title,
        description: item.description,
        projectId: selectedProjectId,
        projectName: proj?.name ?? "未知项目",
        taskId: task.id,
      }]);
      setInbox((prev) => prev.filter((i) => i.id !== analysis.id));
      setAnalyses((prev) => prev.filter((a) => a.id !== analysis.id));
    } finally {
      setCreatingTask(false);
      setPendingAccept(null);
    }
  };

  const skipAnalysis = (id: string) => {
    setSkipped((prev) => new Set([...prev, id]));
  };

  // 待确认任务（有分析结果、未跳过）
  const pendingAnalyses = analyses.filter((a) => !skipped.has(a.id));

  // ── 渲染 ────────────────────────────────────────────────

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-app">

      {/* ══ 列1：待办清单 ══ */}
      <div className="w-[280px] shrink-0 border-r border-app flex flex-col">
        <ColHeader
          title={t('taskManager.columns.todo')}
          count={inbox.length}
          badge={inbox.length > 0 ? `${inbox.length}` : undefined}
        />

        {/* 输入区 */}
        <div className="px-3 py-2 border-b border-app space-y-2">
          <div className="flex gap-1.5">
            <input
              value={inputTitle}
              onChange={(e) => setInputTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && addToInbox()}
              placeholder={t('taskManager.input.titlePlaceholder')}
              className="flex-1 bg-app-tertiary border border-app rounded-md px-2.5 py-1.5 text-xs text-app placeholder:text-app-tertiary outline-none focus:border-accent"
            />
            <button
              onClick={() => setShowDesc((v) => !v)}
              title="添加描述"
              className={cn(
                "w-7 h-7 rounded-md border text-xs flex items-center justify-center transition-colors",
                showDesc ? "border-accent text-accent bg-accent/10" : "border-app text-app-tertiary hover:text-app"
              )}
            >≡</button>
            <button
              onClick={addToInbox}
              disabled={!inputTitle.trim()}
              className="w-7 h-7 rounded-md bg-accent hover:bg-accent-hover text-white text-sm flex items-center justify-center disabled:opacity-40 transition-colors"
            >+</button>
          </div>
          {showDesc && (
            <textarea
              value={inputDesc}
              onChange={(e) => setInputDesc(e.target.value)}
              placeholder="任务描述（可选）"
              rows={2}
              className="w-full bg-app-tertiary border border-app rounded-md px-2.5 py-1.5 text-xs text-app placeholder:text-app-tertiary outline-none focus:border-accent resize-none"
            />
          )}
        </div>

        {/* 任务列表 */}
        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1.5">
          {inbox.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-app-tertiary text-xs gap-1.5">
              <span className="text-2xl opacity-30">☐</span>
              <p>输入任务，按回车添加</p>
            </div>
          ) : (
            inbox.map((item) => {
              const a = getAnalysis(item.id);
              return (
                <div key={item.id} className={cn(
                  "bg-app-secondary border rounded-lg px-3 py-2 text-xs group",
                  a && !skipped.has(a.id) ? "border-accent/30" : "border-app"
                )}>
                  <div className="flex items-start gap-2">
                    {a && !skipped.has(a.id) && <PriorityBadge n={a.priority} />}
                    <div className="flex-1 min-w-0">
                      <p className="text-app font-medium truncate">{item.title}</p>
                      {item.description && (
                        <p className="text-app-tertiary text-[10px] truncate mt-0.5">{item.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => removeFromInbox(item.id)}
                      className="opacity-0 group-hover:opacity-100 text-app-tertiary hover:text-red-400 transition-all text-[10px]"
                    >✕</button>
                  </div>
                  {a && !skipped.has(a.id) && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      <ComplexityBadge c={a.complexity} />
                      {a.tags.slice(0, 2).map((t) => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-app-tertiary text-app-tertiary border border-app">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* AI 梳理按钮 */}
        <div className="px-3 py-2.5 border-t border-app">
          <button
            onClick={runAnalyze}
            disabled={inbox.length === 0 || phase === "loading"}
            className={cn(
              "w-full py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5",
              phase === "loading"
                ? "bg-accent/40 text-white cursor-not-allowed"
                : inbox.length === 0
                ? "bg-app-tertiary text-app-tertiary cursor-not-allowed"
                : "bg-accent hover:bg-accent-hover text-white"
            )}
          >
            {phase === "loading" ? (
              <><span className="animate-spin">◌</span> AI 分析中...</>
            ) : (
              <>✦ AI 梳理优先级 {inbox.length > 0 && `(${inbox.length})`}</>
            )}
          </button>
        </div>
      </div>

      {/* ══ 列2：AI 分析结果 ══ */}
      <div className="w-[340px] shrink-0 border-r border-app flex flex-col">
        <ColHeader
          title="AI 分析"
          count={pendingAnalyses.length}
          badge={phase === "loading" ? "分析中..." : phase === "done" ? `${pendingAnalyses.length} 待确认` : undefined}
          badgeColor={phase === "loading" ? "yellow" : "blue"}
        />

        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-2">
          {phase === "idle" && (
            <div className="flex flex-col items-center justify-center h-48 text-app-tertiary text-xs gap-2">
              <span className="text-3xl opacity-20">✦</span>
              <p>添加任务后点击"AI 梳理优先级"</p>
              <p className="text-[10px] opacity-60">AI 将分析优先级、复杂度和实现方向</p>
            </div>
          )}

          {phase === "loading" && (
            <div className="flex flex-col items-center justify-center h-48 text-app-tertiary text-xs gap-3">
              <span className="text-3xl animate-pulse">✦</span>
              <p>Claude 正在分析 {inbox.length} 个任务...</p>
            </div>
          )}

          {phase === "done" && pendingAnalyses.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-app-tertiary text-xs gap-2">
              <span className="text-2xl">✓</span>
              <p>所有任务已处理完毕</p>
            </div>
          )}

          {phase === "done" && pendingAnalyses.map((a) => {
            const item = inbox.find((i) => i.id === a.id);
            if (!item) return null;
            const isEditing = editingId === a.id;
            return (
              <div key={a.id} className="bg-app-secondary border border-app rounded-xl p-3 space-y-2.5">
                {/* 标题行 */}
                <div className="flex items-start gap-2">
                  <PriorityBadge n={a.priority} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-app truncate">{item.title}</p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      <ComplexityBadge c={isEditing ? (editDraft.complexity ?? a.complexity) : a.complexity} />
                      {a.tags.map((t) => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-app-tertiary text-app-tertiary border border-app">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* AI 理解 */}
                <div>
                  <p className="text-[9px] text-app-tertiary uppercase tracking-wider mb-1 font-medium">AI 理解</p>
                  {isEditing ? (
                    <textarea
                      value={editDraft.understanding ?? ""}
                      onChange={(e) => setEditDraft((d) => ({ ...d, understanding: e.target.value }))}
                      rows={2}
                      className="w-full bg-app-tertiary border border-accent/40 rounded px-2 py-1 text-[11px] text-app outline-none resize-none focus:border-accent"
                    />
                  ) : (
                    <p className="text-[11px] text-app-secondary leading-relaxed">{a.understanding}</p>
                  )}
                </div>

                {/* 实现方向 */}
                <div>
                  <p className="text-[9px] text-app-tertiary uppercase tracking-wider mb-1 font-medium">实现方向</p>
                  {isEditing ? (
                    <div className="space-y-1">
                      <textarea
                        value={editDraft.approach ?? ""}
                        onChange={(e) => setEditDraft((d) => ({ ...d, approach: e.target.value }))}
                        rows={2}
                        className="w-full bg-app-tertiary border border-accent/40 rounded px-2 py-1 text-[11px] text-app outline-none resize-none focus:border-accent"
                      />
                      <div className="flex gap-1">
                        {["S","M","L","XL"].map((c) => (
                          <button
                            key={c}
                            onClick={() => setEditDraft((d) => ({ ...d, complexity: c as "S"|"M"|"L"|"XL" }))}
                            className={cn(
                              "text-[9px] px-2 py-0.5 rounded border transition-colors",
                              (editDraft.complexity ?? a.complexity) === c
                                ? COMPLEXITY_COLOR[c]
                                : "border-app text-app-tertiary hover:border-accent"
                            )}
                          >{c}</button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-app-secondary leading-relaxed">{a.approach}</p>
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-1.5 pt-0.5">
                  {isEditing ? (
                    <>
                      <button onClick={() => saveEdit(a.id)}
                        className="flex-1 py-1 rounded-md bg-accent hover:bg-accent-hover text-white text-[10px] font-medium transition-colors">
                        保存
                      </button>
                      <button onClick={() => setEditingId(null)}
                        className="px-2.5 py-1 rounded-md border border-app text-app-tertiary text-[10px] hover:text-app transition-colors">
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => acceptAnalysis(a)}
                        className="flex-1 py-1 rounded-md bg-green-600/80 hover:bg-green-600 text-white text-[10px] font-medium transition-colors">
                        ✓ 接受
                      </button>
                      <button onClick={() => startEdit(a)}
                        className="px-2.5 py-1 rounded-md border border-app text-app-secondary text-[10px] hover:border-accent hover:text-accent transition-colors">
                        编辑
                      </button>
                      <button onClick={() => skipAnalysis(a.id)}
                        className="px-2.5 py-1 rounded-md border border-app text-app-tertiary text-[10px] hover:text-red-400 transition-colors">
                        跳过
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ══ 列3：开发队列 ══ */}
      <div className="flex-1 flex flex-col min-w-0">
        <ColHeader
          title="开发队列"
          count={queue.length}
          badge={queue.length > 0 ? `${queue.length} 个任务` : undefined}
          badgeColor="green"
        />

        <div className="flex-1 overflow-y-auto py-2 px-3 space-y-2">
          {queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-app-tertiary text-xs gap-2">
              <span className="text-3xl opacity-20">▷</span>
              <p>接受 AI 分析结果后任务将出现在这里</p>
              <p className="text-[10px] opacity-60">已与项目绑定，可直接进入开发流水线</p>
            </div>
          ) : (
            queue.map((q, idx) => (
              <div key={`${q.taskId}-${idx}`}
                className="bg-app-secondary border border-app rounded-xl p-3.5 space-y-2 hover:border-accent/30 transition-colors">
                <div className="flex items-start gap-2">
                  <PriorityBadge n={q.analysis.priority} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-app truncate">{q.title}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-app-tertiary">
                        {q.projectName}
                      </span>
                      <ComplexityBadge c={q.analysis.complexity} />
                      {q.analysis.tags.slice(0, 2).map((t) => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-app-tertiary text-app-tertiary border border-app">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  {q.taskId && (
                    <span className="text-[9px] text-green-400 font-mono shrink-0">
                      #{q.taskId}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-app-secondary leading-relaxed pl-7">
                  {q.analysis.understanding}
                </p>
                <div className="pl-7 flex items-center gap-2 pt-0.5">
                  <span className="text-[10px] text-app-tertiary flex-1 truncate">
                    → {q.analysis.approach}
                  </span>
                  {q.taskId && (
                    <span className="text-[9px] text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">
                      ✓ 已创建
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ══ 项目选择弹窗 ══ */}
      {pendingAccept && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-app-secondary border border-app rounded-xl p-5 w-80 space-y-4 shadow-2xl">
            <div>
              <h2 className="text-sm font-semibold text-app">加入开发队列</h2>
              <p className="text-app-tertiary text-xs mt-0.5 truncate">{pendingAccept.item.title}</p>
            </div>
            <div className="bg-app-tertiary rounded-lg p-3 space-y-1">
              <p className="text-[9px] text-app-tertiary uppercase tracking-wider font-medium">AI 理解</p>
              <p className="text-[11px] text-app-secondary">{pendingAccept.analysis.understanding}</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-app-secondary">选择项目</label>
              {projects.length === 0 ? (
                <p className="text-xs text-app-tertiary">暂无项目，请先在仪表盘创建项目</p>
              ) : (
                <div className="space-y-1">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProjectId(p.id)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-md border text-xs transition-colors",
                        selectedProjectId === p.id
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-app text-app-secondary hover:border-accent/50"
                      )}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setPendingAccept(null)}
                className="text-xs text-app-tertiary hover:text-app px-3 py-1.5"
              >取消</button>
              <button
                onClick={confirmAccept}
                disabled={!selectedProjectId || creatingTask || projects.length === 0}
                className="text-xs bg-accent hover:bg-accent-hover text-white px-4 py-1.5 rounded-md disabled:opacity-40 transition-colors"
              >
                {creatingTask ? "创建中..." : "确认加入"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ColHeader({
  title, count, badge, badgeColor = "gray",
}: {
  title: string;
  count: number;
  badge?: string;
  badgeColor?: "gray" | "blue" | "green" | "yellow";
}) {
  const colors = {
    gray:   "bg-app-tertiary text-app-tertiary",
    blue:   "bg-blue-500/15 text-blue-400",
    green:  "bg-green-500/15 text-green-400",
    yellow: "bg-yellow-500/15 text-yellow-400",
  };
  return (
    <div className="px-3 py-2.5 border-b border-app flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-semibold text-app">{title}</h2>
        <span className="text-[10px] text-app-tertiary bg-app-tertiary px-1.5 py-0.5 rounded-full">
          {count}
        </span>
      </div>
      {badge && (
        <span className={cn("text-[9px] px-2 py-0.5 rounded-full font-mono", colors[badgeColor])}>
          {badge}
        </span>
      )}
    </div>
  );
}
