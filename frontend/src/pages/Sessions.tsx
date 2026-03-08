// frontend/src/pages/Sessions.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, getWsUrl, type ClaudeSession, type ClaudeEvent } from "../lib/api";
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

function applyEventStyle(eventType: string) {
  let icon = "·", iconColor = "text-gray-500";
  switch (eventType) {
    case "PreToolUse":    icon = "→"; iconColor = "text-blue-400";   break;
    case "PostToolUse":   icon = "✓"; iconColor = "text-green-400";  break;
    case "Notification":  icon = "◆"; iconColor = "text-yellow-400"; break;
    case "Stop":          icon = "■"; iconColor = "text-red-400";    break;
    case "SessionStart":  icon = "▶"; iconColor = "text-purple-400"; break;
    case "SessionEnd":    icon = "◀"; iconColor = "text-purple-300"; break;
  }
  return { icon, iconColor };
}

function dbEventToRow(e: ClaudeEvent): EventRow {
  const ts = new Date(e.created_at).toLocaleTimeString(getDateLocale(), { hour12: false });
  const { icon, iconColor } = applyEventStyle(e.event_type);
  let displayTool = e.tool_name || e.event_type;
  let detail = getToolDetail(e.tool_name, e.tool_input ?? undefined);

  if (e.event_type === "Notification") {
    displayTool = "Notify";
    detail = String((e.extra as Record<string, unknown>)?.message || "").slice(0, 160);
  }
  if (e.event_type === "Stop") displayTool = "Stop";
  if (e.event_type === "SessionStart") displayTool = "SessionStart";
  if (e.event_type === "SessionEnd") displayTool = "SessionEnd";

  return {
    id: `db-${e.id}`,
    ts, icon, iconColor, eventType: e.event_type,
    tool: displayTool || "", detail,
    sessionId: e.session_id.slice(0, 8),
  };
}

let wsRowCounter = 0;

function wsEventToRow(data: Record<string, unknown>): EventRow {
  const eventType = String(data.event_type || "");
  const toolName = data.tool_name as string | null;
  const toolInput = data.tool_input as Record<string, unknown> | null;
  const extra = data.extra as Record<string, unknown> | null;
  const rawTs = data.ts as string | undefined;
  const sessionId = String(data.session_id || "").slice(0, 8);

  const ts = rawTs
    ? new Date(rawTs.endsWith("Z") ? rawTs : rawTs + "Z").toLocaleTimeString(getDateLocale(), { hour12: false })
    : new Date().toLocaleTimeString(getDateLocale(), { hour12: false });

  const { icon, iconColor } = applyEventStyle(eventType);
  let displayTool = toolName || eventType;
  let detail = getToolDetail(toolName, toolInput ?? undefined);

  if (eventType === "Notification") {
    displayTool = "Notify";
    detail = String(extra?.message || "").slice(0, 160);
  }
  if (eventType === "Stop") displayTool = "Stop";
  if (eventType === "SessionStart") displayTool = "SessionStart";
  if (eventType === "SessionEnd") displayTool = "SessionEnd";

  return {
    id: `ws-${wsRowCounter++}`,
    ts, icon, iconColor, eventType,
    tool: displayTool || "", detail,
    sessionId,
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
                  {line.ts}
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

// ── Per-session WebSocket hook ───────────────────────────────

type SessionWsStatus = "disconnected" | "connecting" | "connected";

function useSessionWs(
  sessionId: string | null,
  onEvent: (row: EventRow) => void,
) {
  const [status, setStatus] = useState<SessionWsStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!sessionId) {
      setStatus("disconnected");
      return;
    }

    setStatus("connecting");
    const wsUrl = getWsUrl(`/ws/session/${sessionId}`);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setStatus("connected");
    ws.onclose = () => setStatus("disconnected");
    ws.onerror = () => setStatus("disconnected");

    ws.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data);
        if (parsed.type === "claude_event" && parsed.data) {
          onEventRef.current(wsEventToRow(parsed.data));
        }
      } catch { /* ignore */ }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [sessionId]);

  return status;
}

// ── 主页面 ──────────────────────────────────────────────────

export default function Sessions() {
  const { t } = useTranslation();
  // 会话列表
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 历史事件（选中会话后从 DB 加载）
  const [historyRows, setHistoryRows] = useState<EventRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // 实时事件（通过 per-session WebSocket 接收）
  const [liveRows, setLiveRows] = useState<EventRow[]>([]);

  const [filter, setFilter] = useState("");

  const handleWsEvent = useCallback((row: EventRow) => {
    setLiveRows((prev) => [...prev, row].slice(-500));
  }, []);

  const sessionWsStatus = useSessionWs(selectedId, handleWsEvent);

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

  // 点击会话：加载历史 + 连接 WS 实时流
  const handleSelectSession = (sid: string) => {
    if (selectedId === sid) {
      setSelectedId(null);
      setHistoryRows([]);
      setLiveRows([]);
      return;
    }
    setSelectedId(sid);
    setLiveRows([]);
    setHistoryLoading(true);
    api.sessions.events(sid)
      .then((evs) => {
        setHistoryRows(evs.map(dbEventToRow));
        setHistoryLoading(false);
      })
      .catch(() => setHistoryLoading(false));
  };

  // 合并：历史 + 实时新事件（去重）
  const displayRows = useMemo(() => {
    if (!selectedId) return [];
    const seen = new Set(historyRows.map(r => `${r.ts}|${r.tool}|${r.eventType}`));
    const newLive = liveRows.filter(r => !seen.has(`${r.ts}|${r.tool}|${r.eventType}`));
    return [...historyRows, ...newLive];
  }, [selectedId, liveRows, historyRows]);

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

      {/* ── 右侧：会话事件流 ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 工具栏 */}
        <div className="flex items-center justify-between px-4 py-2 shrink-0"
             style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2">
            {selectedId ? (
              <>
                <button
                  onClick={() => { setSelectedId(null); setHistoryRows([]); setLiveRows([]); }}
                  className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded font-mono transition-colors"
                  style={{ background: "var(--background-tertiary)", color: "var(--text-primary)" }}
                >
                  <span style={{ color: "var(--accent)" }}>{selectedId.slice(0, 8)}</span>
                  <span style={{ color: "var(--text-tertiary)" }}>✕</span>
                </button>
                {/* WS 连接状态 */}
                <div className="flex items-center gap-1.5">
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    sessionWsStatus === "connected"  ? "bg-green-400 animate-pulse" :
                    sessionWsStatus === "connecting" ? "bg-yellow-400 animate-pulse" : "bg-red-400"
                  )} />
                  <span className="text-[9px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                    {sessionWsStatus === "connected" ? t('sessions.sessionList.realtime') : sessionWsStatus === "connecting" ? t('sessions.sessionList.connecting') : t('sessions.sessionList.disconnected')}
                  </span>
                </div>
              </>
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
          </div>
        </div>

        {/* 内容区：气泡消息流 */}
        <div className="flex-1 overflow-y-auto">
          {historyLoading ? (
            <div className="flex items-center justify-center h-full text-[12px] font-mono"
                 style={{ color: "var(--text-tertiary)" }}>
              {t('sessions.statusBar.loadingHistory')}
            </div>
          ) : (
            <ChatBubbles
              rows={displayRows}
              filter={filter}
              emptyHint={
                selectedId ? (
                  <>
                    <span className="text-3xl">⌗</span>
                    <p className="text-[12px]">{t('sessions.emptyHints.waitingEvents')}</p>
                  </>
                ) : (
                  <>
                    <span className="text-3xl">⌗</span>
                    <p className="text-[12px]">{t('sessions.emptyHints.selectSession')}</p>
                  </>
                )
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
