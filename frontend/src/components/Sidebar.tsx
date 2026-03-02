// frontend/src/components/Sidebar.tsx
import { cn } from "../lib/utils";

interface SidebarProps {
  projects: Array<{ id: number; name: string }>;
  activeProjectId: number | null;
  activePage: string;
  onSelectProject: (id: number) => void;
  onSelectPage: (page: string) => void;
  onNewProject: () => void;
  connectionStatus: "connected" | "disconnected" | "connecting";
}

export function Sidebar({
  projects,
  activeProjectId,
  activePage,
  onSelectProject,
  onSelectPage,
  onNewProject,
  connectionStatus,
}: SidebarProps) {
  return (
    <div className="w-[220px] shrink-0 bg-app-secondary border-r border-app flex flex-col h-screen">
      {/* Header */}
      <div className="px-3 py-3 border-b border-app">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-accent flex items-center justify-center text-white text-[10px] font-bold">TC</div>
          <span className="text-xs font-semibold text-app">TaskConductor</span>
          <div className={cn(
            "ml-auto w-1.5 h-1.5 rounded-full",
            connectionStatus === "connected" ? "bg-green-400" :
            connectionStatus === "connecting" ? "bg-yellow-400 animate-pulse" :
            "bg-red-400"
          )} />
        </div>
      </div>

      {/* Nav Items */}
      <div className="px-2 py-2 space-y-0.5">
        {[
          { id: "dashboard", label: "Dashboard", icon: "⊞" },
          { id: "sessions", label: "Claude Sessions", icon: "◎" },
          { id: "settings", label: "Settings", icon: "⚙" },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => onSelectPage(item.id)}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left",
              activePage === item.id
                ? "bg-accent-subtle text-accent"
                : "text-app-secondary hover:text-app hover:bg-app-tertiary"
            )}
          >
            <span className="text-[11px] opacity-70">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      {/* Projects */}
      <div className="px-2 mt-2 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-[10px] text-app-tertiary uppercase tracking-wider font-medium">Projects</span>
          <button
            onClick={onNewProject}
            className="text-app-tertiary hover:text-app text-xs w-4 h-4 flex items-center justify-center rounded hover:bg-app-tertiary"
          >
            +
          </button>
        </div>
        <div className="space-y-0.5 mt-0.5">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => { onSelectProject(p.id); onSelectPage("project"); }}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left",
                activeProjectId === p.id && activePage === "project"
                  ? "bg-accent-subtle text-accent"
                  : "text-app-secondary hover:text-app hover:bg-app-tertiary"
              )}
            >
              <span className="w-4 h-4 rounded bg-app-tertiary flex items-center justify-center text-[9px] shrink-0">
                {p.name[0].toUpperCase()}
              </span>
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-app">
        <p className={cn(
          "text-[10px] flex items-center gap-1",
          connectionStatus === "connected" ? "text-green-400" : "text-app-tertiary"
        )}>
          <span>{connectionStatus === "connected" ? "●" : "○"}</span>
          {connectionStatus === "connected" ? "Agent connected" : "Not connected"}
        </p>
      </div>
    </div>
  );
}
