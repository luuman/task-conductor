// frontend/src/hooks/useChatWs.ts
// WebSocket hook for chat with Claude

import { useRef, useState, useCallback, useEffect } from "react";
import { getWsUrl } from "../lib/api";

export interface UseChatWsReturn {
  send: (message: string, model: string, cwd?: string) => void;
  stop: () => void;
  isGenerating: boolean;
  currentReply: string;
  error: string | null;
}

export function useChatWs(onComplete?: (fullText: string) => void): UseChatWsReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const [isGenerating, setIsGenerating] = useState(false);
  const [currentReply, setCurrentReply] = useState("");
  const [error, setError] = useState<string | null>(null);

  const replyBuf = useRef("");
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 确保 WebSocket 已连接，返回 ws 实例
  const ensureConnected = useCallback((): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const existing = wsRef.current;
      if (existing && existing.readyState === WebSocket.OPEN) {
        resolve(existing);
        return;
      }

      // 关闭旧连接
      if (existing) {
        existing.close();
        wsRef.current = null;
      }

      const url = getWsUrl("/ws/chat");
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => resolve(ws);

      ws.onerror = () => {
        reject(new Error("WebSocket 连接失败"));
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as { type: string; text?: string; error?: string };
          if (msg.type === "chat_chunk") {
            replyBuf.current += msg.text || "";
            setCurrentReply(replyBuf.current);
          } else if (msg.type === "chat_done") {
            const full = replyBuf.current;
            setIsGenerating(false);
            setCurrentReply("");
            replyBuf.current = "";
            onCompleteRef.current?.(full);
          } else if (msg.type === "chat_error") {
            setError(msg.error || "未知错误");
            setIsGenerating(false);
            setCurrentReply("");
            replyBuf.current = "";
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        // 如果正在生成中断开，标记错误
        if (replyBuf.current && isGenerating) {
          setIsGenerating(false);
          setError("连接断开");
        }
      };

      // 超时
      const timer = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          reject(new Error("连接超时"));
        }
      }, 5000);

      const origOnOpen = ws.onopen;
      ws.onopen = (ev) => {
        clearTimeout(timer);
        if (origOnOpen) (origOnOpen as (ev: Event) => void)(ev);
      };
    });
  }, []);

  const send = useCallback((message: string, model: string, cwd?: string) => {
    setError(null);
    setCurrentReply("");
    replyBuf.current = "";
    setIsGenerating(true);

    ensureConnected()
      .then((ws) => {
        ws.send(JSON.stringify({
          type: "chat",
          message,
          model,
          ...(cwd ? { cwd } : {}),
        }));
      })
      .catch((err) => {
        setError(err.message || "发送失败");
        setIsGenerating(false);
      });
  }, [ensureConnected]);

  const stop = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "stop" }));
    }
    setIsGenerating(false);
    setCurrentReply("");
    replyBuf.current = "";
  }, []);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  return { send, stop, isGenerating, currentReply, error };
}
