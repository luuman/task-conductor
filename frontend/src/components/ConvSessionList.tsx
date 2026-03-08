// frontend/src/components/ConvSessionList.tsx
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { getDateLocale } from "../i18n";
import type { ClaudeSession } from "../lib/api";

interface Props {
  sessions: ClaudeSession[];
  loading: boolean;
  selectedId: number | null;
  onSelect: (session: ClaudeSession) => void;
}

/** 从 cwd 提取项目名（最后一段路径） */
function projectName(cwd: string): string {
  const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] || cwd || "unknown";
}

/** 相对时间显示 */
function relativeTime(isoStr: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const d = new Date(isoStr);
  const now = new Date();
  const locale = getDateLocale();
  const timeStr = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400000);

  if (diffDays === 0) return timeStr;
  if (diffDays === 1) return `${t('convSessionList.yesterday')} ${timeStr}`;
  if (diffDays < 7) return t('convSessionList.daysAgo', { count: diffDays });
  return d.toLocaleDateString(locale, { month: "numeric", day: "numeric" });
}

function StatusDot({ status }: { status: ClaudeSession["status"] }) {
  return (
    <span className={cn(
      "inline-block w-1.5 h-1.5 rounded-full shrink-0",
      status === "active"  ? "bg-green-400" :
      status === "idle"    ? "bg-yellow-400" : "bg-gray-500"
    )} />
  );
}

interface ProjectGroup {
  project: string;
  cwd: string;
  sessions: ClaudeSession[];
  activeCount: number;
}

function groupByProject(sessions: ClaudeSession[]): ProjectGroup[] {
  const map = new Map<string, ClaudeSession[]>();
  for (const s of sessions) {
    const key = s.cwd || "unknown";
    const arr = map.get(key);
    if (arr) arr.push(s);
    else map.set(key, [s]);
  }
  const groups: ProjectGroup[] = [];
  for (const [cwd, items] of map) {
    groups.push({
      project: projectName(cwd),
      cwd,
      sessions: items,
      activeCount: items.filter(s => s.status === "active").length,
    });
  }
  // 有活跃会话的项目优先，其次按最新会话时间倒序
  groups.sort((a, b) => {
    if (a.activeCount !== b.activeCount) return b.activeCount - a.activeCount;
    const aTime = a.sessions[0]?.last_seen_at ?? "";
    const bTime = b.sessions[0]?.last_seen_at ?? "";
    return bTime.localeCompare(aTime);
  });
  return groups;
}

function SessionItem({ s, active, onSelect }: {
  s: ClaudeSession;
  active: boolean;
  onSelect: (s: ClaudeSession) => void;
}) {
  const { t } = useTranslation();
  const title = s.note?.alias || s.summary || s.session_id.slice(0, 8);
  const tags = s.note?.tags ?? [];
  const time = relativeTime(s.started_at, t);

  return (
    <button
      onClick={() => onSelect(s)}
      className="w-full pl-5 pr-3 py-2 text-left transition-colors border-l-2 hover:bg-white/[0.03]"
      style={{
        borderLeftColor: active ? "var(--accent)" : "transparent",
        background: active ? "var(--background-tertiary)" : undefined,
      }}
    >
      {/* 第一行：状态 + 摘要 */}
      <div className="flex items-start gap-1.5">
        <StatusDot status={s.status} />
        <span className="text-[11px] leading-snug font-medium flex-1 line-clamp-2"
              style={{ color: "var(--text-primary)" }}>
          {title}
        </span>
      </div>

      {/* 第二行：时间 + 事件数 */}
      <div className="flex items-center justify-between mt-1 ml-3">
        <span className="text-[9px]"
              style={{ color: "var(--text-tertiary)" }}>
          {time}
        </span>
        <span className="text-[9px]"
              style={{ color: "var(--text-tertiary)" }}>
          {s.event_count} {t('convSession.eventCount')}
        </span>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1 ml-3">
          {tags.slice(0, 3).map(tag => (
            <span key={tag}
                  className="text-[8px] px-1 py-0.5 rounded-full"
                  style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {s.note?.linked_task_id && (
        <span className="text-[9px] mt-0.5 ml-3 block"
              style={{ color: "var(--accent)" }}>
          → Task #{s.note.linked_task_id}
        </span>
      )}
    </button>
  );
}

function ProjectGroupSection({ group, selectedId, onSelect, defaultOpen }: {
  group: ProjectGroup;
  selectedId: number | null;
  onSelect: (s: ClaudeSession) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      {/* 项目分组头 */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-white/[0.03] transition-colors sticky top-0 z-10"
        style={{ background: "var(--background-secondary)", borderBottom: "1px solid var(--border)" }}
      >
        <span className="text-[9px] opacity-50 transition-transform shrink-0"
              style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
          ▶
        </span>
        <span className="text-[11px] font-semibold truncate flex-1"
              style={{ color: "var(--text-primary)" }}>
          {group.project}
        </span>
        {group.activeCount > 0 && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 shrink-0">
            {group.activeCount}
          </span>
        )}
        <span className="text-[9px] shrink-0"
              style={{ color: "var(--text-tertiary)" }}>
          {group.sessions.length}
        </span>
      </button>

      {/* 展开的会话列表 */}
      {open && group.sessions.map(s => (
        <SessionItem
          key={s.id}
          s={s}
          active={selectedId === s.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export function ConvSessionList({ sessions, loading, selectedId, onSelect }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? sessions.filter(s =>
        (s.note?.alias ?? "").toLowerCase().includes(search.toLowerCase()) ||
        s.cwd.toLowerCase().includes(search.toLowerCase()) ||
        (s.note?.tags ?? []).some(t => t.toLowerCase().includes(search.toLowerCase()))
      )
    : sessions;

  const groups = useMemo(() => groupByProject(filtered), [filtered]);

  // 有选中的 session 所属的项目默认展开
  const selectedCwd = selectedId
    ? sessions.find(s => s.id === selectedId)?.cwd
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* 搜索框 */}
      <div className="px-3 py-2 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('convSession.search')}
          className="w-full text-[11px] font-mono rounded px-2.5 py-1.5 outline-none"
          style={{
            background: "var(--background-tertiary)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {/* 分组列表 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-20 text-[11px]"
               style={{ color: "var(--text-tertiary)" }}>{t('convSession.loading')}</div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 px-3 text-center"
               style={{ color: "var(--text-tertiary)" }}>
            <span className="text-2xl">💬</span>
            <p className="text-[11px]">{search ? t('convSession.noMatch') : t('convSession.noSessions')}</p>
          </div>
        ) : (
          groups.map(g => (
            <ProjectGroupSection
              key={g.cwd}
              group={g}
              selectedId={selectedId}
              onSelect={onSelect}
              defaultOpen={
                groups.length <= 3 ||
                g.activeCount > 0 ||
                g.cwd === selectedCwd
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
