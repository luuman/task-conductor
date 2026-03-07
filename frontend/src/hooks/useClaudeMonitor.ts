// frontend/src/hooks/useClaudeMonitor.ts
// Global Claude Code execution monitoring WebSocket hook

import { useEffect, useRef, useState } from "react";
import { getWsUrl } from "../lib/api";

export interface ClaudeHookEvent {
  type: string;
  data: {
    type: string;
    tool?: string | null;
    tool_input?: Record<string, unknown> | null;
    session_id?: string | null;
    cwd?: string | null;
    status?: string;
    raw?: Record<string, unknown>;
  };
  ts: string;
}

export type WsStatus = "connecting" | "connected" | "disconnected";

export function useClaudeMonitor(
  enabled: boolean,
  onEvent: (event: ClaudeHookEvent) => void
): { status: WsStatus; url: string } {
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Generation counter: each effect invocation gets its own gen.
  // Stale async callbacks (from a previous effect run) see gen !== activeGen and exit early.
  const activeGenRef = useRef(0);

  const [status, setStatus] = useState<WsStatus>("disconnected");
  const url = enabled ? getWsUrl("/ws/sessions") : "";

  useEffect(() => {
    if (!enabled) {
      wsRef.current?.close();
      wsRef.current = null;
      if (retryRef.current) clearTimeout(retryRef.current);
      setStatus("disconnected");
      return;
    }

    const gen = ++activeGenRef.current;

    function connect() {
      if (gen !== activeGenRef.current) return;
      const wsUrl = getWsUrl("/ws/sessions");
      setStatus("connecting");

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (gen !== activeGenRef.current) { ws.close(); return; }
        setStatus("connected");
      };

      ws.onmessage = (e) => {
        if (gen !== activeGenRef.current) return;
        try {
          const msg = JSON.parse(e.data) as {
            type: string;
            data: Record<string, unknown>;
            ts: string;
          };

          if (msg.type === "session_update") {
            const d = msg.data;
            const hookEvent: ClaudeHookEvent = {
              type: "claude_hook",
              ts: (d.ts as string) || msg.ts,
              data: {
                type: (d.event_type as string) || "Unknown",
                tool: (d.tool_name as string | null) ?? null,
                tool_input: (d.tool_input as Record<string, unknown> | null) ?? null,
                session_id: (d.session_id as string | null) ?? null,
                cwd: (d.cwd as string | null) ?? null,
                status: (d.status as string) || "unknown",
                raw: d,
              },
            };
            onEventRef.current(hookEvent);
            return;
          }

          if (msg.type === "claude_hook") {
            onEventRef.current(msg as ClaudeHookEvent);
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onerror = () => {
        // onclose fires after error; reconnect is handled in onclose
      };

      ws.onclose = () => {
        if (gen !== activeGenRef.current) return;
        wsRef.current = null;
        setStatus("disconnected");
        // 2 秒后自动重连
        retryRef.current = setTimeout(connect, 2000);
      };
    }

    connect();

    return () => {
      activeGenRef.current++;  // Invalidate this generation's callbacks
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [enabled]);

  return { status, url };
}
