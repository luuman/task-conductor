import { useCallback, useRef } from 'react'
import { useChatStore } from '../lib/store/chat'
import { useActiveChatStoreApi } from '../lib/store/chat-ctx'
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
  // 获取当前 context 里的 store API（FA → 全局 store；ChatPage → 局部 store）
  const storeApi = useActiveChatStoreApi()

  const wsRef = useRef<WebSocket | null>(null)
  const sendTsRef = useRef(0)
  const fullTextRef = useRef('')
  const firstChunkRef = useRef(false)
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
      const pending = pendingRef.current
      if (pending) {
        pendingRef.current = null
        ws.send(pending)
      }
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        // 使用 context store（FA 或 ChatPage 各自独立）
        const s = storeApi.getState()
        if (msg.type === 'chat_chunk') {
          if (!firstChunkRef.current) {
            firstChunkRef.current = true
            console.log(`[ChatStream] 首个 chunk 到达 (TTFC): ${(performance.now() - sendTsRef.current).toFixed(0)}ms`)
          }
          const text = msg.data?.text || ''
          fullTextRef.current += text
          s.appendCurrentReply(text)

        } else if (msg.type === 'chat_thinking') {
          // 思考过程不混入正文

        } else if (msg.type === 'chat_tool_use') {
          const current = s.currentReply.trim()
          if (current) {
            s.addMessage(makeTextMsg('assistant', current))
            s.setCurrentReply('')
            fullTextRef.current = ''
          }
          s.addMessage(makeToolMsg(msg.data?.tool || 'Tool', {}))

        } else if (msg.type === 'chat_tool_result') {
          const toolName = msg.data?.tool || 'Tool'
          const toolInput = msg.data?.input || {}
          const result = msg.data?.result || ''
          const isError = msg.data?.is_error || false
          const msgs = s.messages
          let found = false
          for (let i = msgs.length - 1; i >= 0; i--) {
            const b = msgs[i].blocks[0]
            if (b?.type === 'tool_use' && b.tool_name === toolName && !b.tool_result) {
              const updated = [...msgs]
              updated[i] = {
                ...updated[i],
                blocks: [{
                  type: 'tool_use' as const,
                  tool_name: toolName,
                  tool_input: toolInput,
                  tool_result: result.slice(0, 3000) || null,
                  tool_error: isError,
                }],
              }
              s.setMessages(updated)
              found = true
              break
            }
          }
          if (!found) {
            s.addMessage({
              role: 'assistant',
              ts: new Date().toISOString(),
              blocks: [{
                type: 'tool_use' as const,
                tool_name: toolName,
                tool_input: toolInput,
                tool_result: result.slice(0, 3000) || null,
                tool_error: isError,
              }],
            })
          }

        } else if (msg.type === 'chat_done') {
          const ft = fullTextRef.current
          console.log(`[ChatStream] 回答完成, 总耗时: ${(performance.now() - sendTsRef.current).toFixed(0)}ms, 文本长度: ${(msg.data?.full_text || ft).length}`)
          const sessionId = msg.data?.session_id
          if (sessionId) s.setClaudeSessionId(sessionId)
          s.setLastStats({
            cost_usd: msg.data?.cost_usd,
            duration_ms: msg.data?.duration_ms,
            input_tokens: msg.data?.input_tokens,
            output_tokens: msg.data?.output_tokens,
          })
          s.setIsGenerating(false)
          const remaining = s.currentReply.trim()
          if (remaining) {
            s.addMessage(makeTextMsg('assistant', remaining))
          }
          s.setCurrentReply('')

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
      const s = storeApi.getState()
      if (s.isGenerating) {
        s.setIsGenerating(false)
        s.setCurrentReply('')
        s.addMessage(makeTextMsg('assistant', '连接失败：无法连接到后端服务，请确认后端已启动。'))
      }
    }

    ws.onclose = () => {
      const s = storeApi.getState()
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
  }, [storeApi])

  const send = useCallback((message: string) => {
    const store = storeApi.getState()
    store.setIsGenerating(true)
    store.setCurrentReply('')
    fullTextRef.current = ''
    firstChunkRef.current = false

    sendTsRef.current = performance.now()
    console.log(`[ChatStream] 发送消息: "${message.slice(0, 50)}..." @ ${new Date().toISOString()}`)

    const { systemPrompt, pageContext, claudeSessionId, projectCwd, selectedModel, permissionMode } = store
    const payload = JSON.stringify({
      type: 'chat',
      message,
      model: selectedModel || undefined,
      system_prompt: !claudeSessionId ? (systemPrompt || undefined) : undefined,
      session_id: claudeSessionId || undefined,
      cwd: projectCwd || undefined,
      context: pageContext,
      permission_mode: permissionMode || 'default',
    })

    const ws = _ensureWs()
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload)
    } else {
      pendingRef.current = payload
    }
  }, [storeApi, _ensureWs])

  const stop = useCallback(() => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop' }))
    }
  }, [])

  const sendNewSession = useCallback(() => {
    const ws = _ensureWs()
    const payload = JSON.stringify({ type: 'new_session' })
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload)
    } else {
      pendingRef.current = payload
    }
  }, [_ensureWs])

  return { send, stop, sendNewSession }
}

// 兼容性导出：部分代码直接从 useChatStore 读取，保留不变
export { useChatStore }
