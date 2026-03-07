// frontend/src/components/AppShell.tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sidebar } from "./Sidebar";
import { api, type Project } from "../lib/api";

interface AppShellProps {
  onPage: string;
  setPage: (page: string) => void;
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
  onSelectProject: (id: number) => void;
  activeProjectId: number | null;
  projects: Project[];
  onProjectCreated: (p: Project) => void;
  onRefreshProjects?: () => void;
  connectionStatus: "connected" | "disconnected" | "connecting";
}

export function AppShell({
  onPage,
  setPage,
  children,
  rightPanel,
  onSelectProject,
  activeProjectId,
  projects,
  onProjectCreated,
  onRefreshProjects,
  connectionStatus,
}: AppShellProps) {
  const { t } = useTranslation();
  const [showNewProject, setShowNewProject] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const [workspaceRoot, setWorkspaceRoot] = useState("");

  useEffect(() => {
    api.settings.get().then((s) => setWorkspaceRoot(s.workspace_root)).catch(() => {});
  }, []);

  const projPath = workspaceRoot && newProjName.trim()
    ? `${workspaceRoot}/${newProjName.trim().replace(/\s+/g, "-")}`
    : "";

  const handleNewProject = async () => {
    if (!newProjName.trim()) return;
    const p = await api.projects.create({ name: newProjName.trim(), repo_url: "" });
    onProjectCreated(p);
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
        onScanProjects={async () => {
          await api.projects.scan();
          onRefreshProjects?.();
        }}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(c => !c)}
        connectionStatus={connectionStatus}
      />

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
        <PerfBottomBar
          connectionStatus={connectionStatus}
        />
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
            <h2 className="text-sm font-semibold text-app">{t('appShell.newProject')}</h2>
            <input
              autoFocus
              value={newProjName}
              onChange={(e) => setNewProjName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleNewProject()}
              placeholder={t('appShell.projectName')}
              className="w-full bg-app-tertiary border border-app rounded-md px-3 py-1.5 text-xs text-app placeholder:text-app-tertiary outline-none focus:border-accent"
            />
            {projPath && (
              <div className="bg-app rounded-md px-3 py-2 space-y-0.5">
                <p className="text-[9px] text-app-tertiary uppercase tracking-wider">{t('appShell.willCreateAt')}</p>
                <p className="text-[11px] font-mono text-accent break-all">{projPath}</p>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowNewProject(false)} className="text-xs text-app-tertiary hover:text-app px-3 py-1.5">{t('appShell.cancel')}</button>
              <button onClick={handleNewProject} disabled={!newProjName.trim()}
                className="text-xs bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-md disabled:opacity-40">
                {t('appShell.create')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
