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

function makeToolMsg(toolName: string, input?: Record<string, unknown>): TranscriptMessage {
  return {
    role: 'assistant',
    ts: new Date().toISOString(),
    blocks: [{ type: 'tool_use', tool_name: toolName, tool_input: input || {} }],
  }
}

export function useChatStream() {
  const wsRef = useRef<WebSocket | null>(null)
  const sendTsRef = useRef(0)
  const fullTextRef = useRef('')
  const firstChunkRef = useRef(false)
  // 待发送消息队列：WS 还在连接时暂存
  const pendingRef = useRef<string | null>(null)

  const _ensureWs = useCallback((): WebSocket => {
    const existing = wsRef.current
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return existing
    }

    const baseUrl = getWsBaseUrl()
    const ws = new WebSocket(`${baseUrl}/ws/chat`)
    wsRef.current = ws

    ws.onopen = () => {
      console.log(`[ChatStream] WebSocket 连接建立, 耗时: ${(performance.now() - sendTsRef.current).toFixed(0)}ms`)
      // 发送暂存的消息
      const pending = pendingRef.current
      if (pending) {
        pendingRef.current = null
        ws.send(pending)
      }
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        const s = useChatStore.getState()
        if (msg.type === 'chat_chunk') {
          if (!firstChunkRef.current) {
            firstChunkRef.current = true
            console.log(`[ChatStream] 首个 chunk 到达 (TTFC): ${(performance.now() - sendTsRef.current).toFixed(0)}ms`)
          }
          const text = msg.data?.text || ''
          fullTextRef.current += text
          s.appendCurrentReply(text)
        } else if (msg.type === 'chat_thinking') {
          // 可选：显示思考过程
          const text = msg.data?.text || ''
          if (text) s.appendCurrentReply(text)
        } else if (msg.type === 'chat_tool_use') {
          const tool = msg.data?.tool || ''
          if (tool) s.appendCurrentReply(`\n🔧 调用工具: ${tool}\n`)
        } else if (msg.type === 'chat_done') {
          const ft = fullTextRef.current
          console.log(`[ChatStream] 回答完成, 总耗时: ${(performance.now() - sendTsRef.current).toFixed(0)}ms, 文本长度: ${(msg.data?.full_text || ft).length}`)
          const sessionId = msg.data?.session_id
          if (sessionId) s.setClaudeSessionId(sessionId)
          s.setIsGenerating(false)
          s.setCurrentReply('')
          s.addMessage(makeTextMsg('assistant', msg.data?.full_text || ft))
          // 不关闭 WS，保持复用
        } else if (msg.type === 'chat_error') {
          console.error(`[ChatStream] 错误, 耗时: ${(performance.now() - sendTsRef.current).toFixed(0)}ms, error:`, msg.data?.error)
          s.setIsGenerating(false)
          s.setCurrentReply('')
          s.addMessage(makeTextMsg('assistant', `错误: ${msg.data?.error || '未知错误'}`))
        } else if (msg.type === 'session_reset') {
          console.log('[ChatStream] 会话已重置')
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
      if (s.isGenerating && !fullTextRef.current) {
        s.setIsGenerating(false)
        s.setCurrentReply('')
        s.addMessage(makeTextMsg('assistant', '连接已断开，请重试。'))
      } else {
        s.setIsGenerating(false)
      }
      wsRef.current = null
    }

    return ws
  }, [])

  const send = useCallback((message: string) => {
    const store = useChatStore.getState()
    store.setIsGenerating(true)
    store.setCurrentReply('')
    fullTextRef.current = ''
    firstChunkRef.current = false

    sendTsRef.current = performance.now()
    console.log(`[ChatStream] 发送消息: "${message.slice(0, 50)}..." @ ${new Date().toISOString()}`)

    const { systemPrompt, pageContext, claudeSessionId, projectCwd } = store
    const payload = JSON.stringify({
      type: 'chat',
      message,
      system_prompt: !claudeSessionId ? (systemPrompt || undefined) : undefined,
      session_id: claudeSessionId || undefined,
      cwd: projectCwd || undefined,
      context: pageContext,
    })

    const ws = _ensureWs()
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload)
    } else {
      // WS 还在连接中，暂存
      pendingRef.current = payload
    }
  }, [_ensureWs])

  const stop = useCallback(() => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop' }))
    }
  }, [])

  return { send, stop }
}
