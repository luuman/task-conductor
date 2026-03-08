// frontend/src/pages/Sessions.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type ClaudeSession, type ClaudeEvent } from "../lib/api";
import type { ClaudeHookEvent, WsStatus } from "../hooks/useClaudeMonitor";
import { cn } from "../lib/utils";
import { getDateLocale } from "../i18n";

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
  const ts = new Date(event.ts + "Z").toLocaleTimeString(getDateLocale(), { hour12: false });
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
  const ts = new Date(e.created_at).toLocaleTimeString(getDateLocale(), { hour12: false });
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

// ── 系统消息类型 ─────────────────────────────────────────────

const SYSTEM_EVENTS = new Set(["SessionStart", "SessionEnd", "Stop", "Notification", "SubagentStart", "SubagentStop"]);

// ── 气泡消息流 ──────────────────────────────────────────────

function ChatBubbles({ rows, filter, emptyHint }: {
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
    <div className="py-3 px-4 space-y-2">
      {filtered.map((line) => {
        const isSystem = SYSTEM_EVENTS.has(line.eventType);
        const isOutgoing = line.eventType === "PreToolUse";
        // PostToolUse / PostToolUseFailure → right side (tool response)

        if (isSystem) {
          return (
            <div key={line.id} className="flex justify-center">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono"
                   style={{ background: "var(--background-tertiary)", color: "var(--text-tertiary)" }}>
                <span className={line.iconColor}>{line.icon}</span>
                <span>{line.tool}</span>
                {line.detail && <span className="opacity-70">· {line.detail}</span>}
                <span className="ml-1 opacity-50">{line.ts}</span>
              </div>
            </div>
          );
        }

        return (
          <div key={line.id}
               className={cn("flex", isOutgoing ? "justify-start" : "justify-end")}>
            <div className={cn(
              "max-w-[75%] min-w-[120px] rounded-xl px-3 py-2 font-mono text-[11px] group relative",
              isOutgoing
                ? "rounded-tl-sm"
                : "rounded-tr-sm",
            )}
            style={{
              background: isOutgoing ? "var(--background-tertiary)" : "rgba(86, 211, 100, 0.08)",
              border: `1px solid ${isOutgoing ? "var(--border)" : "rgba(86, 211, 100, 0.15)"}`,
            }}>
              {/* 头部：工具名 + 时间 */}
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className={cn(
                  "text-[10px] font-semibold",
                  isOutgoing ? "text-[#79c0ff]" : "text-[#56d364]"
                )}>
                  <span className={cn("mr-1", line.iconColor)}>{line.icon}</span>
                  {line.tool}
                </span>
                <span className="text-[9px] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: "var(--text-tertiary)" }}>
                  {line.ts} · {line.sessionId}
                </span>
              </div>
              {/* 内容 */}
              {line.detail && (
                <p className="break-all leading-relaxed" style={{ color: "var(--text-primary)" }}
                   title={line.detail}>
                  {line.detail}
                </p>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

// ── 主页面 ──────────────────────────────────────────────────

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

  // 历史事件（选中会话后从 DB 加载）
  const [historyRows, setHistoryRows] = useState<EventRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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

  // 点击会话：加载历史并过滤
  const handleSelectSession = (sid: string) => {
    if (selectedId === sid) {
      setSelectedId(null);
      setHistoryRows([]);
      return;
    }
    setSelectedId(sid);
    setHistoryLoading(true);
    api.sessions.events(sid)
      .then((evs) => {
        setHistoryRows(evs.map(dbEventToRow));
        setHistoryLoading(false);
      })
      .catch(() => setHistoryLoading(false));
  };

  // 合并时间线：选中会话时 = 历史 + 该会话的实时新事件（去重）；未选中 = 全部实时
  const displayRows = useMemo(() => {
    if (!selectedId) return liveRows;
    const shortId = selectedId.slice(0, 8);
    const sessionLive = liveRows.filter(r => r.sessionId === shortId);
    const seen = new Set(historyRows.map(r => `${r.ts}|${r.tool}|${r.eventType}`));
    const newLive = sessionLive.filter(r => !seen.has(`${r.ts}|${r.tool}|${r.eventType}`));
    return [...historyRows, ...newLive];
  }, [selectedId, liveRows, historyRows]);

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
              {t('sessions.loading')}
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 px-3 text-center"
                 style={{ color: "var(--text-tertiary)" }}>
              <span className="text-2xl">⌗</span>
              <p className="text-[11px]">{t('sessions.noSessions')}</p>
              <p className="text-[10px]">{t('sessions.autoAppearHint')}</p>
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
                  {s.event_count} {t('sessions.eventCount')}
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
          {/* 当前视图指示 */}
          <div className="flex items-center gap-2">
            {selectedId ? (
              <button
                onClick={() => { setSelectedId(null); setHistoryRows([]); }}
                className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded font-mono transition-colors"
                style={{ background: "var(--background-tertiary)", color: "var(--text-primary)" }}
                title={t('sessions.viewTabs.showAll')}
              >
                <span style={{ color: "var(--accent)" }}>{selectedId.slice(0, 8)}</span>
                <span style={{ color: "var(--text-tertiary)" }}>✕</span>
              </button>
            ) : (
              <span className="text-[11px] px-2.5 py-1 font-mono"
                    style={{ color: "var(--text-secondary)" }}>
                {t('sessions.viewTabs.allSessions')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('sessions.filter')}
              className="text-[11px] font-mono rounded px-2.5 py-1 outline-none w-44 transition-colors"
              style={{
                background: "var(--background-tertiary)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
              onFocus={e => e.currentTarget.style.borderColor = "var(--accent)"}
              onBlur={e => e.currentTarget.style.borderColor = "var(--border)"}
            />
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
              {paused ? t('sessions.controls.resume') : t('sessions.controls.pause')}
            </button>
            <button
              onClick={handleClearLive}
              className="text-[11px] px-2.5 py-1 rounded font-mono border border-transparent transition-colors hover:bg-white/[0.04]"
              style={{ color: "var(--text-secondary)" }}
            >
              {t('sessions.controls.clear')}
            </button>
          </div>
        </div>

        {/* 列头 */}
        <div className="flex px-3 py-1.5 shrink-0"
             style={{ borderBottom: "1px solid var(--border)", background: "var(--background-secondary)" }}>
          <span className="text-[10px] font-mono w-[58px]" style={{ color: "var(--text-tertiary)" }}>{t('sessions.tableHeaders.time')}</span>
          <span className="text-[10px] font-mono w-4"      style={{ color: "var(--text-tertiary)" }}> </span>
          <span className="text-[10px] font-mono w-[96px]" style={{ color: "var(--text-tertiary)" }}>{t('sessions.tableHeaders.tool')}</span>
          <span className="text-[10px] font-mono flex-1"   style={{ color: "var(--text-tertiary)" }}>{t('sessions.tableHeaders.content')}</span>
          <span className="text-[10px] font-mono w-[64px] text-right" style={{ color: "var(--text-tertiary)" }}>{t('sessions.tableHeaders.session')}</span>
        </div>

        {/* 内容区：统一时间线 */}
        <div className="flex-1 overflow-y-auto">
          {historyLoading ? (
            <div className="flex items-center justify-center h-full text-[12px] font-mono"
                 style={{ color: "var(--text-tertiary)" }}>
              {t('sessions.statusBar.loadingHistory')}
            </div>
          ) : (
            <EventTable
              rows={displayRows}
              filter={filter}
              emptyHint={
                <>
                  <span className="text-3xl">⌗</span>
                  <p className="text-[12px]">{t('sessions.emptyHints.waitingEvents')}</p>
                  <p className="text-[10px]">{t('sessions.emptyHints.selectSession')}</p>
                </>
              }
            />
          )}
        </div>

        {/* 底部状态栏 */}
        <div className="flex items-center justify-between px-4 py-1.5 shrink-0"
             style={{ borderTop: "1px solid var(--border)", background: "var(--background-secondary)" }}>
          <span className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
            {t('sessions.statusBar.realtimeCount', { count: displayRows.length })}
          </span>
          {filter && (
            <button
              onClick={() => setFilter("")}
              className="text-[10px] font-mono transition-colors hover:text-app-secondary"
              style={{ color: "var(--text-tertiary)" }}
            >
              {t('sessions.statusBar.clearFilter')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
