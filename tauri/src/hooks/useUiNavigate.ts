import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

function getWsBaseUrl(): string {
  const tunnelUrl = localStorage.getItem('tc_tunnel_url')
  if (tunnelUrl) return tunnelUrl.replace(/^http/, 'ws')
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}`
}

export function useUiNavigate() {
  const navigate = useNavigate()

  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      const baseUrl = getWsBaseUrl()
      ws = new WebSocket(`${baseUrl}/ws/ui`)

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

      ws.onerror = () => {}

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
