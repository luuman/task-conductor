// frontend/src/App.tsx
import { useState } from "react";
import Login from "./pages/Login";
import { AppShell } from "./components/AppShell";
import Dashboard from "./pages/Dashboard";
import TaskPipeline from "./pages/TaskPipeline";
import { getConfig } from "./lib/api";

type Page = "dashboard" | "project" | "task" | "sessions" | "settings";

export default function App() {
  const [authed, setAuthed] = useState(() => {
    const config = getConfig();
    return !!(config?.token);
  });
  const [page, setPage] = useState<Page>("dashboard");
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  const handleSelectProject = (id: number) => {
    setActiveProjectId(id);
    setPage("project");
  };

  const handleOpenTask = (id: number) => {
    setActiveTaskId(id);
    setPage("task");
  };

  return (
    <AppShell
      onPage={page}
      setPage={(p) => setPage(p as Page)}
      onSelectProject={handleSelectProject}
      activeProjectId={activeProjectId}
    >
      {page === "task" && activeTaskId ? (
        <TaskPipeline
          taskId={activeTaskId}
          onBack={() => setPage(activeProjectId ? "project" : "dashboard")}
        />
      ) : (
        <Dashboard
          projectId={activeProjectId}
          onOpenTask={handleOpenTask}
          onSelectProject={handleSelectProject}
        />
      )}
    </AppShell>
  );
}
