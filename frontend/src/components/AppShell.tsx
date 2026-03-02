// frontend/src/components/AppShell.tsx
import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { api, type Project } from "../lib/api";

interface AppShellProps {
  onPage: string;
  setPage: (page: string) => void;
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
  onSelectProject: (id: number) => void;
  activeProjectId: number | null;
}

export function AppShell({
  onPage,
  setPage,
  children,
  rightPanel,
  onSelectProject,
  activeProjectId,
}: AppShellProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjName, setNewProjName] = useState("");

  useEffect(() => {
    api.projects.list().then(setProjects).catch(() => {});
  }, []);

  const handleNewProject = async () => {
    if (!newProjName.trim()) return;
    const p = await api.projects.create({ name: newProjName.trim(), repo_url: "" });
    setProjects((prev) => [...prev, p]);
    setNewProjName("");
    setShowNewProject(false);
    onSelectProject(p.id);
    setPage("project");
  };

  return (
    <div className="flex h-screen overflow-hidden bg-app">
      <Sidebar
        projects={projects}
        activeProjectId={activeProjectId}
        activePage={onPage}
        onSelectProject={onSelectProject}
        onSelectPage={setPage}
        onNewProject={() => setShowNewProject(true)}
        connectionStatus="connected"
      />

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </div>

      {/* Right Panel (optional) */}
      {rightPanel && (
        <div className="w-[280px] shrink-0 border-l border-app overflow-y-auto">
          {rightPanel}
        </div>
      )}

      {/* New Project Modal */}
      {showNewProject && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-app-secondary border border-app rounded-xl p-5 w-80 space-y-3 shadow-2xl">
            <h2 className="text-sm font-semibold text-app">新建项目</h2>
            <input
              autoFocus
              value={newProjName}
              onChange={(e) => setNewProjName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleNewProject()}
              placeholder="项目名称"
              className="w-full bg-app-tertiary border border-app rounded-md px-3 py-1.5 text-xs text-app placeholder:text-app-tertiary outline-none focus:border-accent"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowNewProject(false)} className="text-xs text-app-tertiary hover:text-app px-3 py-1.5">取消</button>
              <button onClick={handleNewProject} disabled={!newProjName.trim()}
                className="text-xs bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-md disabled:opacity-40">
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
