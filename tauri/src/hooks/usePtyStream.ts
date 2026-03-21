import { useCallback, useRef } from 'react'
import { usePtyChatStore } from '../lib/store/pty-chat'

function getWsBaseUrl(): string {
  const tunnelUrl = localStorage.getItem('tc_tunnel_url')
  if (tunnelUrl) return tunnelUrl.replace(/^http/, 'ws')
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}`
}

export function usePtyStream() {
  const wsRef = useRef<WebSocket | null>(null)
  const onDataRef = useRef<((data: string) => void) | null>(null)

  const connect = useCallback((opts: {
    cwd?: string
    cols?: number
    rows?: number
    onData: (data: string) => void
  }) => {
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return

    onDataRef.current = opts.onData
    const baseUrl = getWsBaseUrl()
    const ws = new WebSocket(`${baseUrl}/ws/pty-chat`)
    wsRef.current = ws

    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      console.log('[PtyStream] WebSocket 连接建立')
      ws.send(JSON.stringify({
        type: 'init',
        cwd: opts.cwd || undefined,
        cols: opts.cols || 120,
        rows: opts.rows || 40,
      }))
    }

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // 二进制：PTY 输出 → xterm
        const text = new TextDecoder().decode(event.data)
        onDataRef.current?.(text)
      } else {
        // JSON 控制消息
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'pty_ready') {
            console.log('[PtyStream] PTY 就绪')
            usePtyChatStore.getState().setPtyAlive(true)
          }
        } catch { /* ignore */ }
      }
    }

    ws.onerror = () => {
      usePtyChatStore.getState().setPtyAlive(false)
    }

    ws.onclose = () => {
      usePtyChatStore.getState().setPtyAlive(false)
      wsRef.current = null
    }
  }, [])

  const write = useCallback((data: string) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      // 发送用户输入为二进制
      ws.send(new TextEncoder().encode(data))
    }
  }, [])

  const resize = useCallback((cols: number, rows: number) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols, rows }))
    }
  }, [])

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  const reconnect = useCallback((opts: {
    cwd?: string
    cols?: number
    rows?: number
    onData: (data: string) => void
  }) => {
    disconnect()
    setTimeout(() => connect(opts), 100)
  }, [connect, disconnect])

  return { connect, write, resize, disconnect, reconnect }
}
