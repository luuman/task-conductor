// frontend/src/pages/Dashboard.tsx
import { useEffect, useState } from "react";
import { api, type Project, type Task } from "../lib/api";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";

interface DashboardProps {
  projectId: number | null;
  onOpenTask: (id: number) => void;
  onSelectProject: (id: number) => void;
}

const STAGE_COLORS: Record<string, "default" | "success" | "warning" | "danger" | "info" | "accent"> = {
  input: "default",
  analysis: "warning",
  prd: "warning",
  ui: "accent",
  plan: "accent",
  dev: "info",
  test: "warning",
  deploy: "success",
  monitor: "success",
  done: "success",
};

const STAGE_LABEL: Record<string, string> = {
  input: "需求", analysis: "分析", prd: "PRD", ui: "UI",
  plan: "方案", dev: "开发", test: "测试", deploy: "发布", monitor: "监控", done: "完成",
};

const STATUS_COLORS: Record<string, "default" | "success" | "warning" | "danger" | "info" | "accent"> = {
  pending: "default",
  running: "info",
  waiting_review: "warning",
  approved: "accent",
  rejected: "danger",
  done: "success",
  failed: "danger",
};

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-gray-500",
    running: "bg-blue-400 animate-pulse",
    waiting_review: "bg-yellow-400",
    approved: "bg-accent",
    rejected: "bg-red-400",
    done: "bg-green-400",
    failed: "bg-red-400",
  };
  return <span className={cn("w-2 h-2 rounded-full shrink-0", colors[status] || "bg-gray-500")} />;
}

function NewTaskButton({ projectId, onCreated }: { projectId: number; onCreated: (t: Task) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setLoading(true);
    try {
      const task = await api.tasks.create(projectId, { title: title.trim(), description: desc.trim() });
      onCreated(task);
      setTitle(""); setDesc(""); setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ New Task</Button>
      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-app-secondary border border-app rounded-xl p-5 w-96 space-y-3 shadow-2xl">
            <h2 className="text-sm font-semibold text-app">新建任务</h2>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="任务标题"
              className="w-full bg-app-tertiary border border-app rounded-md px-3 py-1.5 text-xs text-app placeholder:text-app-tertiary outline-none focus:border-accent"
            />
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="需求描述（可选）"
              rows={3}
              className="w-full bg-app-tertiary border border-app rounded-md px-3 py-1.5 text-xs text-app placeholder:text-app-tertiary outline-none focus:border-accent resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setOpen(false)} className="text-xs text-app-tertiary hover:text-app px-3 py-1.5">取消</button>
              <button onClick={handleCreate} disabled={!title.trim() || loading}
                className="text-xs bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-md disabled:opacity-40">
                {loading ? "创建中..." : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ProjectCard({ project, onSelect, onOpenTask }: { project: Project; onSelect: () => void; onOpenTask: (id: number) => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  useEffect(() => {
    api.projects.tasks(project.id).then(setTasks).catch(() => {});
  }, [project.id]);

  const runningCount = tasks.filter(t => t.status === "running").length;

  return (
    <div
      onClick={onSelect}
      className="bg-app-secondary border border-app rounded-lg p-4 cursor-pointer hover:border-accent/30 transition-colors space-y-2"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-accent/20 flex items-center justify-center text-accent text-[10px] font-bold">
            {project.name[0].toUpperCase()}
          </div>
          <span className="text-xs font-semibold text-app">{project.name}</span>
        </div>
        {runningCount > 0 && (
          <Badge variant="info">{runningCount} running</Badge>
        )}
      </div>
      <p className="text-app-tertiary text-[10px]">{tasks.length} tasks</p>
      <div className="flex flex-wrap gap-1 pt-1">
        {tasks.slice(0, 3).map(t => (
          <button
            key={t.id}
            onClick={(e) => { e.stopPropagation(); onOpenTask(t.id); }}
            className="text-[10px] text-app-secondary bg-app-tertiary hover:bg-app-secondary px-1.5 py-0.5 rounded transition-colors"
          >
            {t.title.slice(0, 20)}{t.title.length > 20 ? "..." : ""}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard({ projectId, onOpenTask, onSelectProject }: DashboardProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.projects.list().then((p) => { setProjects(p); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (projectId) {
      api.projects.tasks(projectId).then(setTasks).catch(() => {});
    } else {
      setTasks([]);
    }
  }, [projectId]);

  const activeProject = projects.find((p) => p.id === projectId);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-app-tertiary text-xs animate-pulse">Loading...</p>
    </div>
  );

  // No project selected → overview
  if (!projectId) return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="mb-6">
        <h1 className="text-base font-semibold text-app">Overview</h1>
        <p className="text-app-tertiary text-xs mt-0.5">{projects.length} projects</p>
      </div>
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 space-y-2">
          <p className="text-app-tertiary text-sm">No projects yet</p>
          <p className="text-app-tertiary text-xs">Use + in sidebar to create one</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} onSelect={() => onSelectProject(p.id)} onOpenTask={onOpenTask} />
          ))}
        </div>
      )}
    </div>
  );

  // Project selected → task list
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Project header */}
      <div className="px-5 py-3 border-b border-app flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded bg-accent/20 flex items-center justify-center text-accent text-[10px] font-bold">
            {activeProject?.name[0].toUpperCase()}
          </div>
          <h1 className="text-sm font-semibold text-app">{activeProject?.name}</h1>
          <Badge variant="default">{tasks.length} tasks</Badge>
        </div>
        <NewTaskButton projectId={projectId} onCreated={(t) => { setTasks((p) => [t, ...p]); onOpenTask(t.id); }} />
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 space-y-2">
            <p className="text-app-tertiary text-xs">No tasks yet</p>
          </div>
        ) : (
          tasks.map((t) => (
            <button
              key={t.id}
              onClick={() => onOpenTask(t.id)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-app-secondary transition-colors text-left group"
            >
              <StatusDot status={t.status} />
              <span className="flex-1 text-xs text-app truncate">{t.title}</span>
              <Badge variant={STAGE_COLORS[t.stage] ?? "default"}>
                {STAGE_LABEL[t.stage] ?? t.stage}
              </Badge>
              <Badge variant={STATUS_COLORS[t.status] ?? "default"}>
                {t.status}
              </Badge>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
