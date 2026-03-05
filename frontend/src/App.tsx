// frontend/src/App.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import Login from "./pages/Login";
import { AppShell } from "./components/AppShell";
import Dashboard from "./pages/Dashboard";
import TaskPipeline from "./pages/TaskPipeline";
import { api, getConfig, checkAuth, clearConfig, type Project } from "./lib/api";
import Settings from "./pages/Settings";
import Sessions from "./pages/Sessions";
import TaskManager from "./pages/TaskManager";
import ConversationHistory from "./pages/ConversationHistory";
import ProjectsCanvas from "./pages/ProjectsCanvas";
import ClaudeConfig from "./pages/ClaudeConfig";
import { useClaudeMonitor, type ClaudeHookEvent, type WsStatus } from "./hooks/useClaudeMonitor";

type Page = "dashboard" | "project" | "task" | "sessions" | "settings" | "tasks" | "conversations" | "canvas" | "claude-config";

const MAX_LIVE_EVENTS = 500;

export default function App() {
  const [authed, setAuthed] = useState(() => {
    const config = getConfig();
    return !!(config?.token);
  });
  const [page, setPage] = useState<Page>("dashboard");
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "connecting">("connecting");

  // 全局实时 Claude 事件（页面打开即监听，不依赖 Sessions 页是否激活）
  const [liveEvents, setLiveEvents] = useState<ClaudeHookEvent[]>([]);
  const liveEventsRef = useRef<ClaudeHookEvent[]>([]);
  const [monitorStatus, setMonitorStatus] = useState<WsStatus>("disconnected");

  const handleMonitorEvent = useCallback((event: ClaudeHookEvent) => {
    liveEventsRef.current = [...liveEventsRef.current, event].slice(-MAX_LIVE_EVENTS);
    setLiveEvents([...liveEventsRef.current]);
  }, []);

  const clearLiveEvents = useCallback(() => {
    liveEventsRef.current = [];
    setLiveEvents([]);
  }, []);

  const { status: wsMonitorStatus } = useClaudeMonitor(authed, handleMonitorEvent);

  // 同步 ws 状态
  useEffect(() => {
    setMonitorStatus(wsMonitorStatus);
  }, [wsMonitorStatus]);

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
        // 后端在线时校验 token 是否仍有效（SECRET_KEY 变化等情况）
        const ok = await checkAuth();
        if (!ok) {
          clearConfig();
          setAuthed(false);
        }
      } catch {
        setConnectionStatus("disconnected");
        // 后端离线不影响登录态，重连后仍可使用
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
    if (page === "sessions") {
      return (
        <Sessions
          liveEvents={liveEvents}
          wsStatus={monitorStatus}
          onClearLive={clearLiveEvents}
        />
      );
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
        onSelectProject={handleSelectProject}
        onRefreshProjects={refreshProjects}
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
      connectionStatus={connectionStatus}
    >
      {renderContent()}
    </AppShell>
  );
}
