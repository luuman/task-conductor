import { useCallback, useRef } from 'react'
import { useChatStore } from '../lib/store/chat'
import type { TranscriptMessage } from '../lib/api/types'

function getWsBaseUrl(): string {
  const tunnelUrl = localStorage.getItem('tc_tunnel_url')
  if (tunnelUrl) {
    return tunnelUrl.replace(/^http/, 'ws')
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}`
}

function makeTextMsg(role: 'user' | 'assistant', text: string): TranscriptMessage {
  return {
    role,
    ts: new Date().toISOString(),
    blocks: [{ type: 'text', text }],
  }
}

export function useChatStream() {
  const wsRef = useRef<WebSocket | null>(null)

  const send = useCallback((message: string) => {
    const store = useChatStore.getState()
    store.setIsGenerating(true)
    store.setCurrentReply('')

    const sendTs = performance.now()
    console.log(`[ChatStream] 发送消息: "${message.slice(0, 50)}..." @ ${new Date().toISOString()}`)

    const baseUrl = getWsBaseUrl()
    const ws = new WebSocket(`${baseUrl}/ws/chat`)
    wsRef.current = ws

    let fullText = ''
    let firstChunkLogged = false

    ws.onopen = () => {
      console.log(`[ChatStream] WebSocket 连接建立, 耗时: ${(performance.now() - sendTs).toFixed(0)}ms`)
      const { systemPrompt, pageContext, claudeSessionId, projectCwd } = useChatStore.getState()
      ws.send(JSON.stringify({
        type: 'chat',
        message,
        system_prompt: !claudeSessionId ? (systemPrompt || undefined) : undefined,
        session_id: claudeSessionId || undefined,
        cwd: projectCwd || undefined,
        context: pageContext,
      }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        const s = useChatStore.getState()
        if (msg.type === 'chat_chunk') {
          if (!firstChunkLogged) {
            firstChunkLogged = true
            console.log(`[ChatStream] 首个 chunk 到达 (TTFC): ${(performance.now() - sendTs).toFixed(0)}ms`)
          }
          const text = msg.data?.text || ''
          fullText += text
          s.appendCurrentReply(text)
        } else if (msg.type === 'chat_done') {
          console.log(`[ChatStream] 回答完成, 总耗时: ${(performance.now() - sendTs).toFixed(0)}ms, 文本长度: ${(msg.data?.full_text || fullText).length}`)
          const sessionId = msg.data?.session_id
          if (sessionId) s.setClaudeSessionId(sessionId)
          s.setIsGenerating(false)
          s.setCurrentReply('')
          s.addMessage(makeTextMsg('assistant', msg.data?.full_text || fullText))
          ws.close()
        } else if (msg.type === 'chat_error') {
          console.error(`[ChatStream] 错误, 耗时: ${(performance.now() - sendTs).toFixed(0)}ms, error:`, msg.data?.error)
          s.setIsGenerating(false)
          s.setCurrentReply('')
          s.addMessage(makeTextMsg('assistant', `错误: ${msg.data?.error || '未知错误'}`))
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
        s.addMessage(makeTextMsg('assistant', '连接失败：无法连接到后端服务，请确认后端已启动。'))
      }
    }

    ws.onclose = () => {
      const s = useChatStore.getState()
      // 如果还在生成中说明异常关闭
      if (s.isGenerating && !fullText) {
        s.setIsGenerating(false)
        s.setCurrentReply('')
        s.addMessage(makeTextMsg('assistant', '连接已断开，请重试。'))
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
