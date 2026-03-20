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

  const send = useCallback((message: string) => {
    const store = useChatStore.getState()
    store.setIsGenerating(true)
    store.setCurrentReply('')

    const baseUrl = getWsBaseUrl()
    const ws = new WebSocket(`${baseUrl}/ws/chat`)
    wsRef.current = ws

    let fullText = ''

    ws.onopen = () => {
      const { systemPrompt, pageContext, claudeSessionId } = useChatStore.getState()
      ws.send(JSON.stringify({
        type: 'chat',
        message,
        system_prompt: !claudeSessionId ? (systemPrompt || undefined) : undefined,
        session_id: claudeSessionId || undefined,
        context: pageContext,
      }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        const s = useChatStore.getState()
        if (msg.type === 'chat_chunk') {
          const text = msg.data?.text || ''
          fullText += text
          s.appendCurrentReply(text)
        } else if (msg.type === 'chat_done') {
          s.setIsGenerating(false)
          s.setCurrentReply('')
          s.addMessage({
            id: Date.now(),
            task_id: 0,
            role: 'assistant',
            content: msg.data?.full_text || fullText,
            created_at: new Date().toISOString(),
          })
          ws.close()
        } else if (msg.type === 'chat_error') {
          s.setIsGenerating(false)
          s.setCurrentReply('')
          s.addMessage({
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
      const s = useChatStore.getState()
      if (s.isGenerating) {
        s.setIsGenerating(false)
        s.setCurrentReply('')
        s.addMessage({
          id: Date.now(),
          task_id: 0,
          role: 'assistant',
          content: '连接失败：无法连接到后端服务，请确认后端已启动。',
          created_at: new Date().toISOString(),
        })
      }
    }

    ws.onclose = () => {
      const s = useChatStore.getState()
      // 如果还在生成中说明异常关闭
      if (s.isGenerating && !fullText) {
        s.setIsGenerating(false)
        s.setCurrentReply('')
        s.addMessage({
          id: Date.now(),
          task_id: 0,
          role: 'assistant',
          content: '连接已断开，请重试。',
          created_at: new Date().toISOString(),
        })
      } else {
        s.setIsGenerating(false)
      }
      wsRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop' }))
    }
  }, [])

  return { send, stop }
}
