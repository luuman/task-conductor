import { useCallback, useRef } from 'react'
import { useChatStore } from '../lib/store/chat'

function getWsBaseUrl(): string {
  const tunnelUrl = localStorage.getItem('tc_tunnel_url')
  if (tunnelUrl) {
    return tunnelUrl.replace(/^http/, 'ws')
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}`
}

export function useChatStream() {
  const wsRef = useRef<WebSocket | null>(null)
  const {
    setIsGenerating, setCurrentReply, appendCurrentReply,
    addMessage, systemPrompt, pageContext,
  } = useChatStore()

  const send = useCallback((message: string) => {
    setIsGenerating(true)
    setCurrentReply('')

    const baseUrl = getWsBaseUrl()
    const ws = new WebSocket(`${baseUrl}/ws/chat`)
    wsRef.current = ws

    let fullText = ''

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'chat',
        message,
        system_prompt: systemPrompt || undefined,
        context: pageContext,
      }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'chat_chunk') {
          const text = msg.data?.text || ''
          fullText += text
          appendCurrentReply(text)
        } else if (msg.type === 'chat_done') {
          setIsGenerating(false)
          setCurrentReply('')
          addMessage({
            id: Date.now(),
            task_id: 0,
            role: 'assistant',
            content: msg.data?.full_text || fullText,
            created_at: new Date().toISOString(),
          })
          ws.close()
        } else if (msg.type === 'chat_error') {
          setIsGenerating(false)
          setCurrentReply('')
          addMessage({
            id: Date.now(),
            task_id: 0,
            role: 'assistant',
            content: `错误: ${msg.data?.error || '未知错误'}`,
            created_at: new Date().toISOString(),
          })
          ws.close()
        }
      } catch {
        // ignore parse errors
      }
    }

    ws.onerror = () => {
      setIsGenerating(false)
      setCurrentReply('')
    }

    ws.onclose = () => {
      setIsGenerating(false)
      wsRef.current = null
    }
  }, [systemPrompt, pageContext, setIsGenerating, setCurrentReply, appendCurrentReply, addMessage])

  const stop = useCallback(() => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop' }))
    }
  }, [])

  return { send, stop }
}
