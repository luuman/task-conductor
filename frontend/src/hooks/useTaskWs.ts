import { useEffect, useRef } from "react";

export function useTaskWs(
  taskId: number,
  onMessage: (msg: { type: string; data: any; ts: string }) => void
) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const base = (import.meta.env.VITE_API_URL || "http://localhost:8000")
      .replace(/^http/, "ws");
    const url = `${base}/ws/task/${taskId}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(e.data));
      } catch {}
    };

    ws.onerror = () => {
      // 静默处理（后端未启动时不崩溃）
    };

    return () => ws.close();
  }, [taskId]);
}
