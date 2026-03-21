import { useCallback, useRef } from 'react'
import { usePtyChatStore } from '../lib/store/pty-chat'

function getWsBaseUrl(): string {
  const tunnelUrl = localStorage.getItem('tc_tunnel_url')
  if (tunnelUrl) return tunnelUrl.replace(/^http/, 'ws')
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}`
}

/**
 * 管理多个 PTY WebSocket 连接。
 * 每个 session 有独立的 WebSocket 和 PTY 进程。
 */
export function usePtyStream() {
  // sessionId → WebSocket
  const wsMapRef = useRef<Map<string, WebSocket>>(new Map())

  const connectSession = useCallback((sessionId: string, opts: {
    cwd?: string
    cols?: number
    rows?: number
    onData: (data: string) => void
    onReady?: () => void
    onClose?: () => void
  }) => {
    // 已有连接则跳过
    if (wsMapRef.current.has(sessionId)) return

    const baseUrl = getWsBaseUrl()
    const ws = new WebSocket(`${baseUrl}/ws/pty-chat`)
    ws.binaryType = 'arraybuffer'
    wsMapRef.current.set(sessionId, ws)

    ws.onopen = () => {
      console.log(`[PtyStream:${sessionId}] WebSocket 连接建立`)
      ws.send(JSON.stringify({
        type: 'init',
        cwd: opts.cwd || undefined,
        cols: opts.cols || 120,
        rows: opts.rows || 40,
      }))
    }

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        const text = new TextDecoder().decode(event.data)
        opts.onData(text)
      } else {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'pty_ready') {
            console.log(`[PtyStream:${sessionId}] PTY 就绪`)
            usePtyChatStore.getState().updateSessionAlive(sessionId, true)
            opts.onReady?.()
          }
        } catch { /* ignore */ }
      }
    }

    ws.onerror = () => {
      usePtyChatStore.getState().updateSessionAlive(sessionId, false)
    }

    ws.onclose = () => {
      usePtyChatStore.getState().updateSessionAlive(sessionId, false)
      wsMapRef.current.delete(sessionId)
      opts.onClose?.()
    }
  }, [])

  const writeToSession = useCallback((sessionId: string, data: string) => {
    const ws = wsMapRef.current.get(sessionId)
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(new TextEncoder().encode(data))
    }
  }, [])

  const resizeSession = useCallback((sessionId: string, cols: number, rows: number) => {
    const ws = wsMapRef.current.get(sessionId)
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols, rows }))
    }
  }, [])

  const disconnectSession = useCallback((sessionId: string) => {
    const ws = wsMapRef.current.get(sessionId)
    if (ws) {
      ws.close()
      wsMapRef.current.delete(sessionId)
    }
  }, [])

  const disconnectAll = useCallback(() => {
    wsMapRef.current.forEach((ws) => ws.close())
    wsMapRef.current.clear()
  }, [])

  return { connectSession, writeToSession, resizeSession, disconnectSession, disconnectAll }
}
