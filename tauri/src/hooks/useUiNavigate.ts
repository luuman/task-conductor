import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const WS_BASE = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8765'

export function useUiNavigate() {
  const navigate = useNavigate()

  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      ws = new WebSocket(`${WS_BASE}/ws/ui`)

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'navigate' && msg.data?.path) {
            navigate(msg.data.path)
          }
        } catch {
          // ignore malformed messages
        }
      }

      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [navigate])
}
