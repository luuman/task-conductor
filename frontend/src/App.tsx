// frontend/src/App.tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen } from "lucide-react";
import Login from "./pages/Login";
import { AppShell } from "./components/AppShell";
import Dashboard from "./pages/Dashboard";
import TaskPipeline from "./pages/TaskPipeline";
import { api, getConfig, checkAuth, clearConfig, type Project } from "./lib/api";
import { useAppSettings } from "./hooks/useAppSettings";
import Settings from "./pages/Settings";
import TaskManager from "./pages/TaskManager";
import ConversationHistory from "./pages/ConversationHistory";
import ProjectsCanvas from "./pages/ProjectsCanvas";
import ClaudeConfig from "./pages/ClaudeConfig";
import ProjectFiles from "./pages/ProjectFiles";
import PencilCanvas from "./components/PencilCanvas";
import KnowledgePage from "./pages/KnowledgePage";
type Page = "dashboard" | "project" | "task" | "settings" | "tasks" | "conversations" | "canvas" | "claude-config" | "files" | "pencil" | "knowledge";

export default function App() {
  const { t } = useTranslation();
  void t; // available for future use
  const [authed, setAuthed] = useState(() => {
    const config = getConfig();
    return !!(config?.token);
  });
  const { settings: appSettings, loaded: settingsLoaded } = useAppSettings();
  const [page, setPage] = useState<Page>(() => {
    // 从 localStorage 缓存快速读取默认页面
    try {
      const raw = localStorage.getItem("tc_app_settings");
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached.ui_default_page) return cached.ui_default_page as Page;
      }
    } catch { /* ignore */ }
    return "dashboard";
  });
  const [pageInitialized, setPageInitialized] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "connecting">("connecting");

  // 后端设置加载完成后，如果用户还没手动切换过页面，应用默认首页
  useEffect(() => {
    if (settingsLoaded && !pageInitialized) {
      setPageInitialized(true);
      const defaultPage = appSettings.ui_default_page as Page;
      if (defaultPage && defaultPage !== page) {
        setPage(defaultPage);
      }
    }
  }, [settingsLoaded, appSettings.ui_default_page, pageInitialized, page]);

  useEffect(() => {
    if (!authed) return;
    api.projects.list()
      .then((p) => { setProjects(p); setProjectsLoaded(true); })
      .catch(() => setProjectsLoaded(true));
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    const check = async () => {
      try {
        await api.health();
        setConnectionStatus("connected");
        // When backend is online, verify the token is still valid (e.g. SECRET_KEY change)
        const ok = await checkAuth();
        if (!ok) {
          clearConfig();
          setAuthed(false);
        }
      } catch {
        setConnectionStatus("disconnected");
        // Backend being offline doesn't invalidate login; still usable after reconnect
      }
    };
    check();
    const id = setInterval(check, 10000);
    return () => clearInterval(id);
  }, [authed]);

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  const handleSelectPage = (p: string) => {
    const newPage = p as Page;
    setPage(newPage);
    if (newPage === "dashboard") {
      setActiveProjectId(null);
    }
  };

  const handleSelectProject = (id: number) => {
    setActiveProjectId(id);
    setPage("project");
  };

  const handleOpenTask = (id: number) => {
    setActiveTaskId(id);
    setPage("task");
  };

  const handleOpenKnowledge = (projectId: number) => {
    setActiveProjectId(projectId);
    setPage("knowledge");
  };

  const handleProjectCreated = (p: Project) => {
    setProjects((prev) => [...prev, p]);
  };

  const refreshProjects = async () => {
    try {
      const p = await api.projects.list();
      setProjects(p);
    } catch { /* ignore */ }
  };

  const renderContent = () => {
    if (page === "task" && activeTaskId) {
      return (
        <TaskPipeline
          taskId={activeTaskId}
          onBack={() => setPage(activeProjectId ? "project" : "dashboard")}
        />
      );
    }
    if (page === "settings") {
      return <Settings onDisconnect={() => setAuthed(false)} />;
    }
if (page === "tasks") {
      return <TaskManager projects={projects} />;
    }
    if (page === "conversations") {
      return <ConversationHistory projects={projects} />;
    }
    if (page === "claude-config") {
      return <ClaudeConfig />;
    }
    if (page === "files") {
      if (activeProjectId) {
        const proj = projects.find((p) => p.id === activeProjectId);
        if (proj) {
          return (
            <ProjectFiles
              project={proj}
              onBack={() => setPage("project")}
            />
          );
        }
      }
      // 未选项目时显示项目选择列表
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4" style={{ color: "var(--text-tertiary)" }}>
          <FolderOpen size={40} strokeWidth={1.2} />
          <p className="text-[14px]">{t("files.selectProject")}</p>
          <div className="flex flex-col gap-2 w-64">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => { setActiveProjectId(p.id); }}
                className="px-4 py-2.5 rounded-lg text-[13px] text-left hover:bg-white/[0.04] transition-colors"
                style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      );
    }
    if (page === "pencil") {
      return <PencilCanvas className="w-full h-full" />;
    }
    if (page === "canvas") {
      return (
        <ProjectsCanvas
          projects={projects}
          onSelectProject={handleSelectProject}
          onOpenTask={handleOpenTask}  // kept for interface compatibility
        />
      );
    }
    return (
      <Dashboard
        projectId={activeProjectId}
        projects={projects}
        projectsLoaded={projectsLoaded}
        onOpenTask={handleOpenTask}
        onOpenFiles={(pid) => {
          setActiveProjectId(pid);
          setPage("files");
        }}
      />
    );
  };

  return (
    <AppShell
      onPage={page}
      setPage={handleSelectPage}
      onSelectProject={handleSelectProject}
      activeProjectId={activeProjectId}
      projects={projects}
      onProjectCreated={handleProjectCreated}
      onRefreshProjects={refreshProjects}
      connectionStatus={connectionStatus}
      initialSidebarCollapsed={appSettings.ui_sidebar_collapsed}
    >
      {renderContent()}
    </AppShell>
  );
}
