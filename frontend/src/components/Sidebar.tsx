// frontend/src/components/Sidebar.tsx
import { LayoutDashboard, CheckSquare, Settings, Radio, MessageSquare, Plus, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import { cn } from "../lib/utils";

interface SidebarProps {
  projects: Array<{ id: number; name: string }>;
  activeProjectId: number | null;
  activePage: string;
  onSelectProject: (id: number) => void;
  onSelectPage: (page: string) => void;
  onNewProject: () => void;
  collapsed: boolean;
  onToggle: () => void;
}

const NAV_ITEMS = [
  { id: "dashboard",     label: "仪表盘",  Icon: LayoutDashboard },
  { id: "canvas",        label: "项目视图", Icon: Layers          },
  { id: "tasks",         label: "任务管理", Icon: CheckSquare     },
  { id: "conversations", label: "对话历史", Icon: MessageSquare   },
  { id: "settings",      label: "设置",    Icon: Settings        },
];

export function Sidebar({
  projects,
  activeProjectId,
  activePage,
  onSelectProject,
  onSelectPage,
  onNewProject,
  collapsed,
  onToggle,
}: SidebarProps) {
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
          /* Collapsed: center the expand chevron */
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
            {/* Icon badge */}
            <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-white text-[10px] font-bold"
                 style={{ background: "var(--accent)" }}>
              TC
            </div>
            <span className="text-[13px] font-semibold flex-1 truncate"
                  style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
              TaskConductor
            </span>
            {/* Collapse button (top right when expanded) */}
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
              {/* Left accent bar */}
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
            <button onClick={onNewProject}
              className="w-4 h-4 rounded flex items-center justify-center transition-colors hover:bg-white/[0.06]"
              style={{ color: "var(--text-tertiary)" }}
              title="新建项目"
            >
              <Plus size={11} strokeWidth={2.5} />
            </button>
          </div>
        )}

        <div className={cn("space-y-0.5", !collapsed && "mt-0.5")}>
          {projects.map((p) => {
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
                {/* Avatar */}
                <span className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0"
                      style={{
                        background: active ? "var(--accent)" : "var(--background-tertiary)",
                        color: active ? "#fff" : "var(--text-secondary)",
                      }}>
                  {p.name[0].toUpperCase()}
                </span>
                {!collapsed && <span className="truncate">{p.name}</span>}
              </button>
            );
          })}

          {projects.length === 0 && !collapsed && (
            <button onClick={onNewProject}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] transition-colors hover:bg-white/[0.03]"
              style={{ color: "var(--text-tertiary)" }}>
              <Plus size={12} strokeWidth={2} />
              新建第一个项目
            </button>
          )}

          {/* collapsed 时的新建按钮 */}
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
