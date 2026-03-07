// frontend/src/components/Sidebar.tsx
import { LayoutDashboard, CheckSquare, Settings, Radio, MessageSquare, Plus, ChevronLeft, ChevronRight, Layers, Cpu, FolderSearch, FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
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
}

const NAV_ITEMS = [
  { id: "dashboard",     labelKey: "sidebar.nav.dashboard",      Icon: LayoutDashboard },
  { id: "canvas",        labelKey: "sidebar.nav.canvas",         Icon: Layers          },
  { id: "tasks",         labelKey: "sidebar.nav.tasks",          Icon: CheckSquare     },
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
}: SidebarProps) {
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
            title="展开侧边栏"
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
              title="折叠侧边栏"
            >
              <ChevronLeft size={13} />
            </button>
          </>
        )}
      </div>

      {/* ── Primary nav ──────────────────────────────────── */}
      <nav className={cn("pt-3 pb-1 space-y-0.5 shrink-0", collapsed ? "px-1" : "px-2")}>
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = activePage === id;
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
            </button>
          );
        })}

        {/* 实时监听 */}
        {(() => {
          const active = activePage === "sessions";
          return (
            <button onClick={() => onSelectPage("sessions")}
              title={collapsed ? "实时监听" : undefined}
              className={cn(
                "relative w-full flex items-center rounded-lg text-[12.5px] transition-all text-left",
                collapsed ? "justify-center py-2 px-0" : "gap-2.5 px-3 py-2",
                active ? "font-medium" : "hover:bg-white/[0.03]"
              )}
              style={{
                background: active ? "rgba(34,197,94,0.08)" : undefined,
                color: active ? "#22c55e" : "var(--text-secondary)",
              }}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-emerald-400" />
              )}
              <span className="relative flex items-center justify-center w-3.5 h-3.5 shrink-0">
                {active ? (
                  <>
                    <span className="absolute w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping opacity-50" />
                    <span className="relative w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  </>
                ) : (
                  <Radio size={14} strokeWidth={1.75} />
                )}
              </span>
              {!collapsed && (
                <>
                  <span className="flex-1">实时监听</span>
                  {active && (
                    <span className="text-[9px] font-mono font-semibold tracking-widest text-emerald-400">
                      LIVE
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })()}
      </nav>

      {/* ── Divider ──────────────────────────────────────── */}
      {!collapsed && <div className="mx-3 my-1" style={{ borderTop: "1px solid var(--border-subtle)" }} />}

      {/* ── Projects ─────────────────────────────────────── */}
      <div className={cn("flex-1 overflow-y-auto pb-2", collapsed ? "px-1" : "px-2")}>
        {!collapsed && (
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em]"
                  style={{ color: "var(--text-tertiary)" }}>
              项目
            </span>
            <div className="flex items-center gap-1">
              {onScanProjects && (
                <button onClick={onScanProjects}
                  className="w-4 h-4 rounded flex items-center justify-center transition-colors hover:bg-white/[0.06]"
                  style={{ color: "var(--text-tertiary)" }}
                  title="扫描本地项目"
                >
                  <FolderSearch size={11} strokeWidth={2} />
                </button>
              )}
              <button onClick={onNewProject}
                className="w-4 h-4 rounded flex items-center justify-center transition-colors hover:bg-white/[0.06]"
                style={{ color: "var(--text-tertiary)" }}
                title="新建项目"
              >
                <Plus size={11} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        )}

        <div className={cn("space-y-0.5", !collapsed && "mt-0.5")}>
          {/* 正式项目 */}
          {realProjects.map(renderProjectItem)}

          {/* 测试项目分隔 */}
          {testProjects.length > 0 && !collapsed && (
            <div className="flex items-center gap-2 px-3 pt-2 pb-1">
              <span className="text-[9px] font-semibold uppercase tracking-[0.08em]"
                    style={{ color: "var(--text-tertiary)" }}>
                测试
              </span>
              <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
            </div>
          )}
          {testProjects.map(renderProjectItem)}

          {projects.length === 0 && !collapsed && (
            <button onClick={onNewProject}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] transition-colors hover:bg-white/[0.03]"
              style={{ color: "var(--text-tertiary)" }}>
              <Plus size={12} strokeWidth={2} />
              新建第一个项目
            </button>
          )}

          {collapsed && (
            <button onClick={onNewProject}
              title="新建项目"
              className="relative w-full flex items-center justify-center py-1.5 rounded-lg transition-colors hover:bg-white/[0.03]"
              style={{ color: "var(--text-tertiary)" }}>
              <Plus size={12} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

    </div>
  );
}
