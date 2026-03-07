// frontend/src/components/ClaudeMonitorPanel.tsx
// 实时监听 Claude Code 执行的控制台面板
// 仅在面板打开时建立 WebSocket，不持久化到后端

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useClaudeMonitor, type ClaudeHookEvent } from "../hooks/useClaudeMonitor";
import { cn } from "../lib/utils";

const MAX_LINES = 300;

// ──────────────────────────────────────────────
// 事件格式化
// ──────────────────────────────────────────────

function getToolDetail(
  tool: string | null | undefined,
  input: Record<string, unknown> | null | undefined
): string {
  if (!tool || !input) return "";
  switch (tool) {
    case "Read":
    case "Write":
    case "Edit":
      return String(input.file_path || input.notebook_path || "");
    case "Bash":
      return String(input.command || "").slice(0, 120);
    case "Glob":
      return String(input.pattern || "");
    case "Grep":
      return `"${input.pattern}"${input.path ? "  " + input.path : ""}`;
    case "WebSearch":
      return String(input.query || "");
    case "WebFetch":
      return String(input.url || "");
    case "Agent":
      return String(input.description || input.prompt || "").slice(0, 80);
    default:
      try {
        return JSON.stringify(input).slice(0, 80);
      } catch {
        return "";
      }
  }
}

interface LogLine {
  id: number;
  ts: string;
  icon: string;
  iconColor: string;
  eventType: string;
  tool: string;
  detail: string;
  sessionId: string;
}

let lineCounter = 0;

function buildLogLine(event: ClaudeHookEvent): LogLine {
  const { type, tool, tool_input, session_id, raw } = event.data;
  const ts = new Date(event.ts + "Z").toLocaleTimeString(getDateLocale(), { hour12: false });
  const shortSession = (session_id || "").slice(0, 6) || "??????";

  let icon = "·";
  let iconColor = "text-gray-500";
  let displayTool = tool || type;
  let detail = getToolDetail(tool, tool_input);

  switch (type) {
    case "PreToolUse":
      icon = "→";
      iconColor = "text-blue-400";
      break;
    case "PostToolUse":
      icon = "✓";
      iconColor = "text-green-400";
      break;
    case "Notification": {
      icon = "◆";
      iconColor = "text-yellow-400";
      displayTool = "Notify";
      detail = String(raw?.message || raw?.notification || "").slice(0, 120);
      break;
    }
    case "Stop":
      icon = "■";
      iconColor = "text-red-400";
      displayTool = "Stop";
      detail = String(raw?.message || "session ended");
      break;
    default:
      icon = "·";
      iconColor = "text-gray-500";
  }

  return {
    id: lineCounter++,
    ts,
    icon,
    iconColor,
    eventType: type,
    tool: displayTool,
    detail,
    sessionId: shortSession,
  };
}

// ──────────────────────────────────────────────
// 主面板
// ──────────────────────────────────────────────

interface ClaudeMonitorPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ClaudeMonitorPanel({ open, onClose }: ClaudeMonitorPanelProps) {
  const { t } = useTranslation();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [paused, setPaused] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const handleEvent = useCallback((event: ClaudeHookEvent) => {
    if (pausedRef.current) return;
    const line = buildLogLine(event);
    setLines((prev) => {
      const next = [...prev, line];
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });
  }, []);

  const { status: wsStatus } = useClaudeMonitor(open, handleEvent);

  // 自动滚动到底部
  useEffect(() => {
    if (!paused) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [lines, paused]);

  const handleClear = () => setLines([]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      {/* 半透明遮罩（仅点击区域，不阻塞主内容键盘） */}
      <div
        className="absolute inset-0 pointer-events-auto"
        onClick={onClose}
        style={{ background: "transparent" }}
      />

      {/* 面板主体 */}
      <div
        className={cn(
          "absolute right-0 top-0 h-full w-[420px] flex flex-col",
          "bg-[#0d1117] border-l border-[#30363d]",
          "shadow-2xl pointer-events-auto",
          "transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#30363d] shrink-0">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              wsStatus === "connected" ? "bg-green-400 animate-pulse" :
              wsStatus === "connecting" ? "bg-yellow-400 animate-pulse" :
              "bg-red-400"
            )} />
            <span className="text-[11px] font-mono font-semibold text-[#e6edf3]">
              {t('claudeMonitor.header.title')}
            </span>
            <span className="text-[9px] text-[#8b949e] font-mono">
              {t('claudeMonitor.header.subtitle')}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPaused((p) => !p)}
              title={paused ? t('claudeMonitor.controls.resumeScroll') : t('claudeMonitor.controls.pauseScroll')}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded font-mono transition-colors",
                paused
                  ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40"
                  : "text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]"
              )}
            >
              {paused ? t('claudeMonitor.controls.resume') : t('claudeMonitor.controls.pause')}
            </button>
            <button
              onClick={handleClear}
              className="text-[10px] px-2 py-0.5 rounded font-mono text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22] transition-colors"
            >
              {t('claudeMonitor.controls.clear')}
            </button>
            <button
              onClick={onClose}
              className="text-[10px] px-2 py-0.5 rounded font-mono text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22] transition-colors ml-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 列头 */}
        <div className="flex gap-2 px-3 py-1 border-b border-[#21262d] shrink-0">
          <span className="text-[9px] font-mono text-[#484f58] w-[52px]">{t('claudeMonitor.tableHeaders.time')}</span>
          <span className="text-[9px] font-mono text-[#484f58] w-3"> </span>
          <span className="text-[9px] font-mono text-[#484f58] w-[90px]">{t('claudeMonitor.tableHeaders.tool')}</span>
          <span className="text-[9px] font-mono text-[#484f58] flex-1">{t('claudeMonitor.tableHeaders.content')}</span>
          <span className="text-[9px] font-mono text-[#484f58] w-[42px]">{t('claudeMonitor.tableHeaders.session')}</span>
        </div>

        {/* 日志区 */}
        <div className="flex-1 overflow-y-auto font-mono text-[11px] leading-[1.6]">
          {lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-[#484f58]">
              <div className="text-2xl">⌗</div>
              <p className="text-[11px]">{t('claudeMonitor.empty.waiting')}</p>
              <p className="text-[10px]">{t('claudeMonitor.empty.hooksHint')}</p>
              <code className="text-[9px] bg-[#161b22] px-2 py-1 rounded text-[#8b949e]">
                bash scripts/install-hooks.sh
              </code>
            </div>
          ) : (
            <div className="py-1">
              {lines.map((line) => (
                <div
                  key={line.id}
                  className={cn(
                    "flex gap-2 px-3 py-[2px] hover:bg-[#161b22] transition-colors group",
                    line.eventType === "Stop" && "opacity-60",
                    line.eventType === "PostToolUse" && "opacity-80"
                  )}
                >
                  {/* 时间 */}
                  <span className="text-[#484f58] w-[52px] shrink-0 text-[10px]">
                    {line.ts}
                  </span>
                  {/* 图标 */}
                  <span className={cn("w-3 shrink-0", line.iconColor)}>
                    {line.icon}
                  </span>
                  {/* 工具名 */}
                  <span className={cn(
                    "w-[90px] shrink-0 truncate",
                    line.eventType === "PreToolUse" ? "text-[#79c0ff]" :
                    line.eventType === "PostToolUse" ? "text-[#56d364]" :
                    line.eventType === "Notification" ? "text-[#e3b341]" :
                    "text-[#8b949e]"
                  )}>
                    {line.tool}
                  </span>
                  {/* 内容详情 */}
                  <span
                    className="flex-1 text-[#c9d1d9] truncate"
                    title={line.detail}
                  >
                    {line.detail}
                  </span>
                  {/* 会话 ID */}
                  <span className="text-[#484f58] w-[42px] shrink-0 text-right text-[9px] opacity-0 group-hover:opacity-100 transition-opacity">
                    {line.sessionId}
                  </span>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* 底部状态栏 */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-[#21262d] shrink-0">
          <span className="text-[9px] font-mono text-[#484f58]">
            {t('claudeMonitor.statusBar.recordCount', { count: lines.length, max: MAX_LINES })}
          </span>
          <span className={cn(
            "text-[9px] font-mono",
            paused ? "text-yellow-500" :
            wsStatus === "connected" ? "text-green-500" :
            wsStatus === "connecting" ? "text-yellow-500" :
            "text-red-400"
          )}>
            {paused ? t('claudeMonitor.statusBar.paused') :
             wsStatus === "connected" ? t('claudeMonitor.statusBar.realtime') :
             wsStatus === "connecting" ? t('claudeMonitor.statusBar.connecting') :
             t('claudeMonitor.statusBar.disconnected')}
          </span>
        </div>
      </div>
    </div>
  );
}
