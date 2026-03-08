// frontend/src/components/Sidebar.tsx
import { LayoutDashboard, CheckSquare, Settings, MessageSquare, Plus, ChevronLeft, ChevronRight, Layers, Cpu, FolderSearch, FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { PerfBottomBar } from "../modules/perf/bar/PerfBottomBar";
import type { Project } from "../lib/api";

interface SidebarProps {
  projects: Project[];
  activeProjectId: number | null;
  activePage: string;
  onSelectProject: (id: number) => void;
  onSelectPage: (page: string) => void;
  onNewProject: () => void;
  onScanProjects?: () => void;
  collapsed: boolean;
  onToggle: () => void;
  connectionStatus?: "connected" | "disconnected" | "connecting";
}

const NAV_ITEMS = [
  { id: "dashboard",     labelKey: "sidebar.nav.dashboard",      Icon: LayoutDashboard },
  { id: "canvas",        labelKey: "sidebar.nav.canvas",         Icon: Layers          },
  { id: "tasks",         labelKey: "sidebar.nav.tasks",          Icon: CheckSquare     },
  { id: "files",         labelKey: "sidebar.nav.files",          Icon: FolderSearch    },
  { id: "conversations", labelKey: "sidebar.nav.conversations",  Icon: MessageSquare   },
  { id: "claude-config", labelKey: "sidebar.nav.claudeConfig",   Icon: Cpu             },
  { id: "settings",      labelKey: "sidebar.nav.settings",       Icon: Settings        },
];

export function Sidebar({
  projects,
  activeProjectId,
  activePage,
  onSelectProject,
  onSelectPage,
  onNewProject,
  onScanProjects,
  collapsed,
  onToggle,
  connectionStatus,
}: SidebarProps) {
  const { t } = useTranslation();
  const realProjects = projects.filter(p => !p.is_test);
  const testProjects = projects.filter(p => p.is_test);

  const renderProjectItem = (p: Project) => {
    const active = activeProjectId === p.id && activePage === "project";
    return (
      <button key={p.id}
        onClick={() => { onSelectProject(p.id); onSelectPage("project"); }}
        title={collapsed ? p.name : undefined}
        className={cn(
          "relative w-full flex items-center rounded-lg text-[12.5px] transition-all text-left",
          collapsed ? "justify-center py-1.5 px-0" : "gap-2.5 px-3 py-1.5",
          active ? "font-medium" : "hover:bg-white/[0.03]"
        )}
        style={{
          background: active ? "var(--accent-subtle)" : undefined,
          color: active ? "var(--accent)" : "var(--text-secondary)",
        }}
      >
        {active && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full"
                style={{ background: "var(--accent)" }} />
        )}
        <span className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0"
              style={{
                background: active ? "var(--accent)" : p.is_test ? "rgba(168,85,247,0.15)" : "var(--background-tertiary)",
                color: active ? "#fff" : p.is_test ? "#a855f7" : "var(--text-secondary)",
              }}>
          {p.is_test ? <FlaskConical size={10} /> : p.name[0].toUpperCase()}
        </span>
        {!collapsed && <span className="truncate">{p.name}</span>}
      </button>
    );
  };

  return (
    <div
      className={cn(
        "shrink-0 flex flex-col h-screen overflow-hidden transition-all duration-200",
        collapsed ? "w-[48px]" : "w-[220px]"
      )}
      style={{ background: "var(--background-secondary)", borderRight: "1px solid var(--border)" }}
    >
      {/* ── Logo + collapse toggle ───────────────────────── */}
      <div className={cn(
        "h-11 flex items-center gap-2.5 shrink-0",
        collapsed ? "px-2 justify-center" : "px-4"
      )}
           style={{ borderBottom: "1px solid var(--border)" }}>
        {collapsed ? (
          <button
            onClick={onToggle}
            className="w-7 h-7 flex items-center justify-center rounded-md transition-colors hover:bg-white/[0.06]"
            style={{ color: "var(--text-tertiary)" }}
            title={t('sidebar.expandSidebar')}
          >
            <ChevronRight size={13} />
          </button>
        ) : (
          <>
            <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-white text-[10px] font-bold"
                 style={{ background: "var(--accent)" }}>
              TC
            </div>
            <span className="text-[13px] font-semibold flex-1 truncate"
                  style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
              TaskConductor
            </span>
            <button
              onClick={onToggle}
              className="w-6 h-6 flex items-center justify-center rounded-md transition-colors hover:bg-white/[0.06]"
              style={{ color: "var(--text-tertiary)" }}
              title={t('sidebar.collapseSidebar')}
            >
              <ChevronLeft size={13} />
            </button>
          </>
        )}
      </div>

      {/* ── Primary nav ──────────────────────────────────── */}
      <nav className={cn("pt-3 pb-1 space-y-0.5 shrink-0", collapsed ? "px-1" : "px-2")}>
        {NAV_ITEMS.map(({ id, labelKey, Icon }) => {
          const active = activePage === id;
          const label = t(labelKey);
          return (
            <button key={id} onClick={() => onSelectPage(id)}
              title={collapsed ? label : undefined}
              className={cn(
                "relative w-full flex items-center rounded-lg text-[12.5px] transition-all text-left group",
                collapsed ? "justify-center py-2 px-0" : "gap-2.5 px-3 py-2",
                active ? "font-medium" : "hover:bg-white/[0.03]"
              )}
              style={{
                background: active ? "var(--accent-subtle)" : undefined,
                color: active ? "var(--accent)" : "var(--text-secondary)",
              }}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full"
                      style={{ background: "var(--accent)" }} />
              )}
              <Icon size={14} className="shrink-0" strokeWidth={active ? 2 : 1.75} />
              {!collapsed && label}
              {!collapsed && id === "dashboard" && connectionStatus && (
                <span className="ml-auto flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                      background: connectionStatus === "connected" ? "#22c55e"
                        : connectionStatus === "connecting" ? "#f59e0b" : "#636366"
                    }} />
                  <span className="text-[9px] font-mono"
                    style={{
                      color: connectionStatus === "connected" ? "#22c55e"
                        : connectionStatus === "connecting" ? "#f59e0b" : "#636366"
                    }}>
                    {connectionStatus === "connected" ? t('perfBar.connected')
                      : connectionStatus === "connecting" ? t('perfBar.connecting')
                      : t('perfBar.disconnected')}
                  </span>
                </span>
              )}
            </button>
          );
        })}

      </nav>

      {/* ── Spacer ─────────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Bottom perf bar ────────────────────────────── */}
      <div className="shrink-0">
        <PerfBottomBar connectionStatus={connectionStatus} vertical={!collapsed} compact={collapsed} />
      </div>
    </div>
  );
}
