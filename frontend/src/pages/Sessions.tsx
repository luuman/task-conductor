// frontend/src/pages/Sessions.tsx
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type ClaudeSession, type ClaudeEvent } from "../lib/api";
import type { ClaudeHookEvent, WsStatus } from "../hooks/useClaudeMonitor";
import { cn } from "../lib/utils";

// ── 工具调用详情格式化 ────────────────────────────────────────

function getToolDetail(
  tool: string | null | undefined,
  input: Record<string, unknown> | null | undefined
): string {
  if (!tool || !input) return "";
  switch (tool) {
    case "Read": case "Write": case "Edit":
      return String(input.file_path || input.notebook_path || "");
    case "Bash":
      return String(input.command || "").slice(0, 160);
    case "Glob":   return String(input.pattern || "");
    case "Grep":   return `"${input.pattern}"${input.path ? "  " + input.path : ""}`;
    case "WebSearch": return String(input.query || "");
    case "WebFetch":  return String(input.url || "");
    case "Agent":  return String(input.description || input.prompt || "").slice(0, 100);
    default:
      try { return JSON.stringify(input).slice(0, 100); } catch { return ""; }
  }
}

// ── 事件行类型 ───────────────────────────────────────────────

interface EventRow {
  id: string;
  ts: string;
  icon: string;
  iconColor: string;
  eventType: string;
  tool: string;
  detail: string;
  sessionId: string;
}

let rowCounter = 0;

function hookEventToRow(event: ClaudeHookEvent): EventRow {
  const { type, tool, tool_input, session_id, raw } = event.data;
  const ts = new Date(event.ts + "Z").toLocaleTimeString("zh-CN", { hour12: false });
  let icon = "·", iconColor = "text-gray-500";
  let displayTool = tool || type;
  let detail = getToolDetail(tool, tool_input);

  switch (type) {
    case "PreToolUse":    icon = "→"; iconColor = "text-blue-400";   break;
    case "PostToolUse":   icon = "✓"; iconColor = "text-green-400";  break;
    case "Notification":  icon = "◆"; iconColor = "text-yellow-400";
      displayTool = "Notify";
      detail = String(raw?.message || raw?.notification || "").slice(0, 160); break;
    case "Stop":          icon = "■"; iconColor = "text-red-400";
      displayTool = "Stop"; break;
    case "SessionStart":  icon = "▶"; iconColor = "text-purple-400";
      displayTool = "SessionStart"; break;
    case "SessionEnd":    icon = "◀"; iconColor = "text-purple-300";
      displayTool = "SessionEnd";   break;
  }

  return {
    id: `live-${rowCounter++}`,
    ts, icon, iconColor, eventType: type,
    tool: displayTool || "", detail,
    sessionId: (session_id || "").slice(0, 8),
  };
}

function dbEventToRow(e: ClaudeEvent): EventRow {
  const ts = new Date(e.created_at).toLocaleTimeString("zh-CN", { hour12: false });
  let icon = "·", iconColor = "text-gray-500";
  let displayTool = e.tool_name || e.event_type;
  let detail = getToolDetail(e.tool_name, e.tool_input ?? undefined);

  switch (e.event_type) {
    case "PreToolUse":   icon = "→"; iconColor = "text-blue-400";  break;
    case "PostToolUse":  icon = "✓"; iconColor = "text-green-400"; break;
    case "Notification": icon = "◆"; iconColor = "text-yellow-400";
      displayTool = "Notify";
      detail = String((e.extra as Record<string, unknown>)?.message || "").slice(0, 160); break;
    case "Stop":         icon = "■"; iconColor = "text-red-400"; displayTool = "Stop"; break;
    case "SessionStart": icon = "▶"; iconColor = "text-purple-400"; displayTool = "SessionStart"; break;
    case "SessionEnd":   icon = "◀"; iconColor = "text-purple-300"; displayTool = "SessionEnd";   break;
  }

  return {
    id: `db-${e.id}`,
    ts, icon, iconColor, eventType: e.event_type,
    tool: displayTool || "", detail,
    sessionId: e.session_id.slice(0, 8),
  };
}

// ── 状态标签 ────────────────────────────────────────────────

function StatusBadge({ status }: { status: ClaudeSession["status"] }) {
  const { t } = useTranslation();
  return (
    <span className={cn(
      "text-[9px] px-1.5 py-0.5 rounded-full font-mono",
      status === "active"  ? "bg-green-500/15 text-green-400" :
      status === "idle"    ? "bg-yellow-500/15 text-yellow-400" :
                             "bg-gray-500/15 text-gray-400"
    )}>
      {status === "active" ? t('sessions.statusBadge.running') : status === "idle" ? t('sessions.statusBadge.idle') : t('sessions.statusBadge.stopped')}
    </span>
  );
}

// ── 事件日志表格 ─────────────────────────────────────────────

function EventTable({ rows, filter, emptyHint }: {
  rows: EventRow[];
  filter: string;
  emptyHint: React.ReactNode;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const filtered = filter.trim()
    ? rows.filter(l =>
        l.tool.toLowerCase().includes(filter.toLowerCase()) ||
        l.detail.toLowerCase().includes(filter.toLowerCase()) ||
        l.eventType.toLowerCase().includes(filter.toLowerCase()))
    : rows;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [rows]);

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3"
           style={{ color: "var(--text-tertiary)" }}>
        {emptyHint}
      </div>
    );
  }

  return (
    <div className="py-1">
      {filtered.map((line) => (
        <div
          key={line.id}
          className={cn(
            "flex px-3 py-[2px] hover:bg-white/[0.03] transition-colors group text-[11px] font-mono",
            line.eventType === "Stop" && "opacity-50",
            line.eventType === "PostToolUse" && "opacity-75"
          )}
        >
          <span className="w-[58px] shrink-0 text-[10px] pt-px"
                style={{ color: "var(--text-tertiary)" }}>{line.ts}</span>
          <span className={cn("w-4 shrink-0", line.iconColor)}>{line.icon}</span>
          <span className={cn(
            "w-[96px] shrink-0 truncate",
            line.eventType === "PreToolUse"  ? "text-[#79c0ff]" :
            line.eventType === "PostToolUse" ? "text-[#56d364]" :
            line.eventType === "Notification"? "text-[#e3b341]" :
            line.eventType === "SessionStart"? "text-[#bc8cff]" :
            line.eventType === "SessionEnd"  ? "text-[#d2a8ff]" :
                                               ""
          )}
          style={
            !["PreToolUse","PostToolUse","Notification","SessionStart","SessionEnd"].includes(line.eventType)
              ? { color: "var(--text-secondary)" }
              : undefined
          }>{line.tool}</span>
          <span className="flex-1 truncate" style={{ color: "var(--text-primary)" }}
                title={line.detail}>{line.detail}</span>
          <span className="w-[64px] shrink-0 text-right text-[9px] opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: "var(--text-tertiary)" }}>
            {line.sessionId}
          </span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

// ── 主页面 ──────────────────────────────────────────────────

type RightView = "live" | "history";

interface SessionsProps {
  liveEvents: ClaudeHookEvent[];
  wsStatus: WsStatus;
  onClearLive: () => void;
}

export default function Sessions({ liveEvents, wsStatus, onClearLive }: SessionsProps) {
  const { t } = useTranslation();
  // 会话列表
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 历史事件
  const [historyRows, setHistoryRows] = useState<EventRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [rightView, setRightView] = useState<RightView>("live");
  const [filter, setFilter] = useState("");
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  // 将全局传入的实时事件转为行（跳过 paused 状态下的新事件）
  const prevLiveEventsLen = useRef(0);
  const [liveRows, setLiveRows] = useState<EventRow[]>([]);

  useEffect(() => {
    const newEvents = liveEvents.slice(prevLiveEventsLen.current);
    prevLiveEventsLen.current = liveEvents.length;
    if (newEvents.length === 0) return;
    if (pausedRef.current) return;
    setLiveRows((prev) => [...prev, ...newEvents.map(hookEventToRow)].slice(-500));

    // 同步刷新会话列表状态
    for (const event of newEvents) {
      setSessions((prev) =>
        prev.map((s) =>
          s.session_id === event.data.session_id
            ? { ...s, status: (event.data.status as ClaudeSession["status"]) || s.status }
            : s
        )
      );
    }
  }, [liveEvents]);

  // 加载会话列表
  const loadSessions = () => {
    api.sessions.list()
      .then((s) => { setSessions(s); setSessionsLoading(false); })
      .catch(() => setSessionsLoading(false));
  };

  useEffect(() => {
    loadSessions();
    const id = setInterval(loadSessions, 5000);
    return () => clearInterval(id);
  }, []);

  // 点击会话：加载历史
  const handleSelectSession = (sid: string) => {
    setSelectedId(sid);
    setRightView("history");
    setHistoryLoading(true);
    api.sessions.events(sid)
      .then((evs) => {
        setHistoryRows(evs.map(dbEventToRow));
        setHistoryLoading(false);
      })
      .catch(() => setHistoryLoading(false));
  };

  const handleClearLive = () => {
    setLiveRows([]);
    prevLiveEventsLen.current = liveEvents.length;
    onClearLive();
  };

  const cwd = (path: string) => {
    const parts = path.replace(/\\/g, "/").split("/");
    return parts.slice(-2).join("/") || path;
  };

  return (
    <div className="flex-1 flex h-full overflow-hidden"
         style={{ background: "var(--background)" }}>

      {/* ── 左侧：会话列表 ── */}
      <div className="w-[240px] shrink-0 flex flex-col"
           style={{ borderRight: "1px solid var(--border)" }}>
        {/* 头部 */}
        <div className="px-3 py-2.5 flex items-center justify-between"
             style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-[11px] font-semibold"
                style={{ color: "var(--text-primary)" }}>{t('sessions.sessionList.title')}</span>
          <div className="flex items-center gap-1.5">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              wsStatus === "connected"  ? "bg-green-400 animate-pulse" :
              wsStatus === "connecting" ? "bg-yellow-400 animate-pulse" : "bg-red-400"
            )} />
            <span className="text-[9px] font-mono" style={{ color: "var(--text-tertiary)" }}>
              {wsStatus === "connected" ? t('sessions.sessionList.realtime') : wsStatus === "connecting" ? t('sessions.sessionList.connecting') : t('sessions.sessionList.disconnected')}
            </span>
          </div>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto py-1">
          {sessionsLoading ? (
            <div className="flex items-center justify-center h-20 text-[11px]"
                 style={{ color: "var(--text-tertiary)" }}>
              加载中...
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 px-3 text-center"
                 style={{ color: "var(--text-tertiary)" }}>
              <span className="text-2xl">⌗</span>
              <p className="text-[11px]">暂无会话记录</p>
              <p className="text-[10px]">运行 Claude Code 后自动出现</p>
            </div>
          ) : (
            sessions.map((s) => (
              <button
                key={s.session_id}
                onClick={() => handleSelectSession(s.session_id)}
                className="w-full px-3 py-2 text-left transition-colors border-l-2 hover:bg-white/[0.03]"
                style={{
                  borderLeftColor: selectedId === s.session_id ? "var(--accent)" : "transparent",
                  background: selectedId === s.session_id ? "var(--background-tertiary)" : undefined,
                }}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] font-mono"
                        style={{ color: "var(--text-secondary)" }}>
                    {s.session_id.slice(0, 8)}
                  </span>
                  <StatusBadge status={s.status} />
                </div>
                <p className="text-[11px] truncate" title={s.cwd}
                   style={{ color: "var(--text-primary)" }}>
                  {cwd(s.cwd) || "—"}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                  {s.event_count} 条事件
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── 右侧：实时流 / 历史事件 ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 工具栏 */}
        <div className="flex items-center justify-between px-4 py-2 shrink-0"
             style={{ borderBottom: "1px solid var(--border)" }}>
          {/* 视图切换 */}
          <div className="flex items-center gap-1 rounded-md p-0.5"
               style={{ background: "var(--background-tertiary)" }}>
            <button
              onClick={() => setRightView("live")}
              className="text-[11px] px-2.5 py-1 rounded font-mono transition-colors"
              style={rightView === "live"
                ? { background: "var(--background-secondary)", color: "var(--text-primary)" }
                : { color: "var(--text-secondary)" }}
            >
              ● 实时
            </button>
            <button
              onClick={() => selectedId && setRightView("history")}
              disabled={!selectedId}
              className={cn(
                "text-[11px] px-2.5 py-1 rounded font-mono transition-colors",
                !selectedId && "opacity-30 cursor-not-allowed"
              )}
              style={rightView === "history"
                ? { background: "var(--background-secondary)", color: "var(--text-primary)" }
                : { color: "var(--text-secondary)" }}
            >
              ◷ 历史
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="过滤工具 / 内容..."
              className="text-[11px] font-mono rounded px-2.5 py-1 outline-none w-44 transition-colors"
              style={{
                background: "var(--background-tertiary)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
              onFocus={e => e.currentTarget.style.borderColor = "var(--accent)"}
              onBlur={e => e.currentTarget.style.borderColor = "var(--border)"}
            />
            {rightView === "live" && (
              <button
                onClick={() => setPaused((p) => !p)}
                className={cn(
                  "text-[11px] px-2.5 py-1 rounded font-mono transition-colors border",
                  paused
                    ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"
                    : "border-transparent"
                )}
                style={!paused ? { color: "var(--text-secondary)" } : undefined}
              >
                {paused ? "▶ 继续" : "⏸ 暂停"}
              </button>
            )}
            {rightView === "live" && (
              <button
                onClick={handleClearLive}
                className="text-[11px] px-2.5 py-1 rounded font-mono border border-transparent transition-colors hover:bg-white/[0.04]"
                style={{ color: "var(--text-secondary)" }}
              >
                清空
              </button>
            )}
          </div>
        </div>

        {/* 列头 */}
        <div className="flex px-3 py-1.5 shrink-0"
             style={{ borderBottom: "1px solid var(--border)", background: "var(--background-secondary)" }}>
          <span className="text-[10px] font-mono w-[58px]" style={{ color: "var(--text-tertiary)" }}>时间</span>
          <span className="text-[10px] font-mono w-4"      style={{ color: "var(--text-tertiary)" }}> </span>
          <span className="text-[10px] font-mono w-[96px]" style={{ color: "var(--text-tertiary)" }}>工具</span>
          <span className="text-[10px] font-mono flex-1"   style={{ color: "var(--text-tertiary)" }}>内容</span>
          <span className="text-[10px] font-mono w-[64px] text-right" style={{ color: "var(--text-tertiary)" }}>会话</span>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto">
          {rightView === "live" ? (
            <EventTable
              rows={liveRows}
              filter={filter}
              emptyHint={
                <>
                  <span className="text-3xl">⌗</span>
                  <p className="text-[12px]">等待 Claude Code 事件...</p>
                  <p className="text-[10px]">在左侧选择会话可查看历史记录</p>
                </>
              }
            />
          ) : historyLoading ? (
            <div className="flex items-center justify-center h-full text-[12px] font-mono"
                 style={{ color: "var(--text-tertiary)" }}>
              加载历史事件...
            </div>
          ) : (
            <EventTable
              rows={historyRows}
              filter={filter}
              emptyHint={
                <>
                  <span className="text-3xl">◷</span>
                  <p className="text-[12px]">该会话暂无事件记录</p>
                </>
              }
            />
          )}
        </div>

        {/* 底部状态栏 */}
        <div className="flex items-center justify-between px-4 py-1.5 shrink-0"
             style={{ borderTop: "1px solid var(--border)", background: "var(--background-secondary)" }}>
          <span className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
            {rightView === "live"
              ? `实时：${liveRows.length} 条`
              : `历史：${historyRows.length} 条`}
          </span>
          {filter && (
            <button
              onClick={() => setFilter("")}
              className="text-[10px] font-mono transition-colors hover:text-app-secondary"
              style={{ color: "var(--text-tertiary)" }}
            >
              清除过滤
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
