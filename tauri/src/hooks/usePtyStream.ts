import { useCallback, useEffect, useRef } from 'react'
import { usePtyChatStore } from '../lib/store/pty-chat'
import type { TranscriptMessage } from '../lib/api/types'

function getWsBaseUrl(): string {
  const tunnelUrl = localStorage.getItem('tc_tunnel_url')
  if (tunnelUrl) return tunnelUrl.replace(/^http/, 'ws')
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

export function usePtyStream() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef(false)
  const cwdRef = useRef<string | null>(null)

  // 建立长连接
  const connect = useCallback((cwd?: string, resumeSessionId?: string) => {
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return

    cwdRef.current = cwd || null
    const baseUrl = getWsBaseUrl()
    const ws = new WebSocket(`${baseUrl}/ws/pty-chat`)
    wsRef.current = ws
    reconnectRef.current = true

    ws.onopen = () => {
      console.log('[PtyStream] WebSocket 连接建立，发送 init', resumeSessionId ? `resume=${resumeSessionId}` : '')
      ws.send(JSON.stringify({
        type: 'init',
        cwd: cwd || undefined,
        resume_session_id: resumeSessionId || undefined,
      }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        const s = usePtyChatStore.getState()

        if (msg.type === 'pty_ready') {
          console.log('[PtyStream] PTY 就绪:', msg.data)
          s.setPtyAlive(true)
          s.setSessionId(msg.data?.session_id || null)
        } else if (msg.type === 'chat_chunk') {
          const text = msg.data?.text || ''
          s.appendCurrentReply(text)
        } else if (msg.type === 'chat_done') {
          const fullText = msg.data?.full_text || s.currentReply
          s.setIsGenerating(false)
          s.setCurrentReply('')
          if (fullText && fullText !== '[已中断]') {
            s.addMessage(makeTextMsg('assistant', fullText))
          } else if (fullText === '[已中断]') {
            s.addMessage(makeTextMsg('assistant', '[已中断]'))
          }
        } else if (msg.type === 'chat_error') {
          console.error('[PtyStream] 错误:', msg.data?.error)
          s.setIsGenerating(false)
          s.setCurrentReply('')
          s.addMessage(makeTextMsg('assistant', `错误: ${msg.data?.error || '未知错误'}`))
        } else if (msg.type === 'pty_status') {
          s.setPtyAlive(msg.data?.alive || false)
        }
      } catch { /* ignore */ }
    }

    ws.onerror = () => {
      const s = usePtyChatStore.getState()
      s.setPtyAlive(false)
    }

    ws.onclose = () => {
      const s = usePtyChatStore.getState()
      s.setPtyAlive(false)
      if (s.isGenerating) {
        s.setIsGenerating(false)
        s.setCurrentReply('')
        s.addMessage(makeTextMsg('assistant', '连接已断开'))
      }
      wsRef.current = null
    }
  }, [])

  const disconnect = useCallback(() => {
    reconnectRef.current = false
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  const send = useCallback((message: string) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      usePtyChatStore.getState().addMessage(
        makeTextMsg('assistant', 'PTY 未连接，请等待连接建立')
      )
      return
    }
    const s = usePtyChatStore.getState()
    s.setIsGenerating(true)
    s.setCurrentReply('')
    ws.send(JSON.stringify({ type: 'chat', message }))
  }, [])

  const stop = useCallback(() => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop' }))
    }
  }, [])

  const reconnect = useCallback((cwd?: string) => {
    disconnect()
    setTimeout(() => connect(cwd), 100)
  }, [connect, disconnect])

  // 组件卸载时断开
  useEffect(() => {
    return () => {
      reconnectRef.current = false
      wsRef.current?.close()
    }
  }, [])

  return { connect, disconnect, send, stop, reconnect }
}
