import { useEffect, useState } from "react";
import { api, type Project, type Task } from "../lib/api";

export default function Dashboard({
  onOpenTask,
}: {
  onOpenTask: (id: number) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);

  const loadProjects = () => api.projects.list().then(setProjects).catch(() => {});

  useEffect(() => { loadProjects(); }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">TaskConductor</h1>
          <p className="text-gray-500 text-sm mt-0.5">AI 开发流水线</p>
        </div>
        <button
          onClick={() => setShowNewProject(true)}
          className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          + 新建项目
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="text-center text-gray-600 mt-20">
          <p className="text-lg">还没有项目</p>
          <p className="text-sm mt-1">点击"新建项目"开始</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} onOpenTask={onOpenTask} />
          ))}
        </div>
      )}

      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreate={() => { loadProjects(); setShowNewProject(false); }}
        />
      )}
    </div>
  );
}

function ProjectCard({
  project,
  onOpenTask,
}: {
  project: Project;
  onOpenTask: (id: number) => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showNewTask, setShowNewTask] = useState(false);

  useEffect(() => {
    api.projects.tasks(project.id).then(setTasks).catch(() => {});
  }, [project.id]);

  return (
    <div className="bg-gray-900 rounded-xl p-5 space-y-3 border border-gray-800">
      <div className="flex justify-between items-start">
        <h2 className="font-semibold text-lg">{project.name}</h2>
        <span className="text-xs text-gray-500">{tasks.length} 任务</span>
      </div>

      <div className="space-y-2">
        {tasks.slice(0, 4).map((t) => (
          <div
            key={t.id}
            onClick={() => onOpenTask(t.id)}
            className="bg-gray-800 rounded-lg p-2.5 cursor-pointer hover:bg-gray-700 flex justify-between items-center text-sm transition"
          >
            <span className="truncate flex-1 mr-2">{t.title}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${stageColor(t.stage)}`}>
              {t.stage}
            </span>
          </div>
        ))}
        {tasks.length > 4 && (
          <p className="text-xs text-gray-500 text-center">+{tasks.length - 4} 更多</p>
        )}
      </div>

      <button
        onClick={() => setShowNewTask(true)}
        className="text-blue-400 text-sm hover:text-blue-300 transition"
      >
        + 新建任务
      </button>

      {showNewTask && (
        <NewTaskModal
          projectId={project.id}
          onClose={() => setShowNewTask(false)}
          onCreate={(t) => {
            setTasks((prev) => [t, ...prev]);
            setShowNewTask(false);
            onOpenTask(t.id);
          }}
        />
      )}
    </div>
  );
}

function stageColor(stage: string): string {
  const map: Record<string, string> = {
    input: "bg-gray-700 text-gray-300",
    analysis: "bg-yellow-900 text-yellow-300",
    prd: "bg-yellow-800 text-yellow-200",
    ui: "bg-purple-900 text-purple-300",
    plan: "bg-blue-900 text-blue-300",
    dev: "bg-blue-700 text-blue-100",
    test: "bg-orange-900 text-orange-300",
    deploy: "bg-green-900 text-green-300",
    monitor: "bg-green-700 text-green-100",
    done: "bg-green-500 text-white",
  };
  return map[stage] ?? "bg-gray-700 text-gray-300";
}

function NewProjectModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: () => void;
}) {
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await api.projects.create({ name: name.trim(), repo_url: repoUrl });
      onCreate();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="新建项目" onClose={onClose}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="项目名称（如：my-app）"
        className="input"
        autoFocus
      />
      <input
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
        placeholder="Git 仓库 URL（可选）"
        className="input"
      />
      <ModalActions onClose={onClose} onConfirm={submit} loading={loading} disabled={!name.trim()} />
    </Modal>
  );
}

export function NewTaskModal({
  projectId,
  onClose,
  onCreate,
}: {
  projectId: number;
  onClose: () => void;
  onCreate: (t: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setLoading(true);
    try {
      const t = await api.tasks.create(projectId, {
        title: title.trim(),
        description: desc,
      });
      onCreate(t);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="新建任务" onClose={onClose}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="任务标题（如：实现用户登录功能）"
        className="input"
        autoFocus
      />
      <textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="任务描述（背景、约束、期望结果）"
        rows={4}
        className="input resize-none"
      />
      <ModalActions
        onClose={onClose}
        onConfirm={submit}
        loading={loading}
        disabled={!title.trim()}
        confirmLabel="创建并开始"
      />
    </Modal>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function ModalActions({
  onClose,
  onConfirm,
  loading,
  disabled,
  confirmLabel = "确认",
}: {
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  disabled?: boolean;
  confirmLabel?: string;
}) {
  return (
    <div className="flex gap-2 justify-end pt-1">
      <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white text-sm transition">
        取消
      </button>
      <button
        onClick={onConfirm}
        disabled={disabled || loading}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
      >
        {loading ? "处理中..." : confirmLabel}
      </button>
    </div>
  );
}
