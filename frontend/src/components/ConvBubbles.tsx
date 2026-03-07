// frontend/src/components/ConvBubbles.tsx
import { useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import type { ClaudeEvent } from "../lib/api";

function toolSummary(toolName: string | null, input: Record<string, unknown> | null): string {
  if (!toolName || !input) return "";
  switch (toolName) {
    case "Read": case "Write": case "Edit":
      return String(input.file_path || input.notebook_path || "");
    case "Bash":
      return String(input.command || "").slice(0, 120);
    case "Glob":   return String(input.pattern || "");
    case "Grep":   return `"${input.pattern}"${input.path ? "  " + input.path : ""}`;
    case "WebSearch": return String(input.query || "");
    case "WebFetch":  return String(input.url || "");
    case "Agent":  return String(input.description || input.prompt || "").slice(0, 100);
    default:
      try { return JSON.stringify(input).slice(0, 100); } catch { return ""; }
  }
}

type Bubble =
  | { kind: "banner";   icon: string; text: string; sub?: string; color: string }
  | { kind: "tool";     name: string; detail: string; done: boolean; durationMs?: number; success?: boolean }
  | { kind: "notify";   message: string }
  | { kind: "subagent"; text: string };

function eventsToBubbles(events: ClaudeEvent[], t: (key: string) => string): Bubble[] {
  const bubbles: Bubble[] = [];
  let i = 0;
  while (i < events.length) {
    const e = events[i];

    if (e.event_type === "SessionStart") {
      bubbles.push({ kind: "banner", icon: "▶", text: t('convBubbles.sessionStart'),
        sub: new Date(e.created_at).toLocaleString("zh-CN"), color: "text-purple-400" });
      i++; continue;
    }
    if (e.event_type === "SessionEnd") {
      bubbles.push({ kind: "banner", icon: "◀", text: t('convBubbles.sessionEnd'),
        sub: new Date(e.created_at).toLocaleString("zh-CN"), color: "text-purple-300" });
      i++; continue;
    }
    if (e.event_type === "Stop") {
      bubbles.push({ kind: "banner", icon: "■", text: t('convBubbles.turnEnd'),
        sub: new Date(e.created_at).toLocaleString("zh-CN"), color: "text-gray-400" });
      i++; continue;
    }
    if (e.event_type === "Notification") {
      const msg = String((e.extra as Record<string, unknown>)?.message ||
                         (e.extra as Record<string, unknown>)?.notification || "");
      bubbles.push({ kind: "notify", message: msg });
      i++; continue;
    }
    if (e.event_type === "SubagentStart") {
      bubbles.push({ kind: "subagent", text: t('convBubbles.subagentStart') });
      i++; continue;
    }
    if (e.event_type === "SubagentStop") {
      bubbles.push({ kind: "subagent", text: t('convBubbles.subagentEnd') });
      i++; continue;
    }
    if (e.event_type === "PreToolUse") {
      const next = events[i + 1];
      const detail = toolSummary(e.tool_name, e.tool_input);
      if (next && next.event_type === "PostToolUse" && next.tool_name === e.tool_name) {
        const t0 = new Date(e.created_at).getTime();
        const t1 = new Date(next.created_at).getTime();
        bubbles.push({ kind: "tool", name: e.tool_name || "Unknown", detail,
          done: true, durationMs: t1 - t0, success: true });
        i += 2; continue;
      } else if (next && next.event_type === "PostToolUseFailure" && next.tool_name === e.tool_name) {
        const t0 = new Date(e.created_at).getTime();
        const t1 = new Date(next.created_at).getTime();
        bubbles.push({ kind: "tool", name: e.tool_name || "Unknown", detail,
          done: true, durationMs: t1 - t0, success: false });
        i += 2; continue;
      } else {
        bubbles.push({ kind: "tool", name: e.tool_name || "Unknown", detail, done: false });
        i++; continue;
      }
    }
    i++;
  }
  return bubbles;
}

function Banner({ b }: { b: Extract<Bubble, { kind: "banner" }> }) {
  return (
    <div className="flex items-center gap-2 py-3 px-4">
      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
      <span className={cn("text-[11px] font-mono flex items-center gap-1.5", b.color)}>
        <span>{b.icon}</span>
        <span>{b.text}</span>
        {b.sub && <span className="opacity-60 text-[10px]">{b.sub}</span>}
      </span>
      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
    </div>
  );
}

function ToolCard({ b, t }: { b: Extract<Bubble, { kind: "tool" }>; t: (key: string) => string }) {
  return (
    <div className="mx-4 my-1.5 rounded-lg overflow-hidden"
         style={{ border: "1px solid var(--border)", background: "var(--background-secondary)" }}>
      <div className="flex items-center gap-2 px-3 py-1.5"
           style={{ borderBottom: b.done ? "1px solid var(--border)" : undefined }}>
        <span className="text-[11px] font-semibold text-[#79c0ff]">{b.name}</span>
        {!b.done && (
          <span className="text-[10px] animate-pulse" style={{ color: "var(--text-tertiary)" }}>
            {t('convBubbles.toolExecuting')}
          </span>
        )}
        {b.done && (
          <span className={cn("text-[10px] ml-auto", b.success ? "text-green-400" : "text-red-400")}>
            {b.success ? "✓" : "✗"}
            {b.durationMs !== undefined && (
              <span className="ml-1 opacity-70">{(b.durationMs / 1000).toFixed(1)}s</span>
            )}
          </span>
        )}
      </div>
      {b.detail && (
        <div className="px-3 py-1.5 text-[11px] font-mono truncate"
             style={{ color: "var(--text-secondary)" }} title={b.detail}>
          {b.detail}
        </div>
      )}
    </div>
  );
}

function NotifyBar({ b, t }: { b: Extract<Bubble, { kind: "notify" }>; t: (key: string) => string }) {
  return (
    <div className="mx-4 my-1.5 flex items-center gap-2 px-3 py-2 rounded-lg text-[11px]"
         style={{ background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)", color: "#e3b341" }}>
      <span>◆</span>
      <span className="flex-1 truncate">{b.message || t('convBubbles.notify')}</span>
    </div>
  );
}

function SubagentRow({ b }: { b: Extract<Bubble, { kind: "subagent" }> }) {
  return (
    <div className="ml-8 mr-4 my-1 flex items-center gap-2 text-[10px]"
         style={{ color: "var(--text-tertiary)" }}>
      <span className="w-3 h-px inline-block" style={{ background: "var(--border)" }} />
      <span>{b.text}</span>
    </div>
  );
}

interface Props {
  events: ClaudeEvent[];
  loading: boolean;
}

export function ConvBubbles({ events, loading }: Props) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[12px]"
           style={{ color: "var(--text-tertiary)" }}>
        加载中...
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3"
           style={{ color: "var(--text-tertiary)" }}>
        <span className="text-3xl">💬</span>
        <p className="text-[12px]">选择左侧会话查看对话记录</p>
      </div>
    );
  }

  const bubbles = eventsToBubbles(events);

  return (
    <div className="py-2">
      {bubbles.map((b, idx) => {
        if (b.kind === "banner")   return <Banner     key={idx} b={b} />;
        if (b.kind === "tool")     return <ToolCard   key={idx} b={b} />;
        if (b.kind === "notify")   return <NotifyBar  key={idx} b={b} />;
        if (b.kind === "subagent") return <SubagentRow key={idx} b={b} />;
        return null;
      })}
      <div ref={bottomRef} />
    </div>
  );
}
