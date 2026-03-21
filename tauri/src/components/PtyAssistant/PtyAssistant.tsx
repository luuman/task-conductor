import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { usePtyChatStore } from '../../lib/store/pty-chat'
import { usePtyStream } from '../../hooks/usePtyStream'
import { useAppStore } from '../../lib/store/app'
import { HttpAdapter } from '../../lib/api/http'
import type { Project, TranscriptMessage } from '../../lib/api/types'
import { ChatMessageList } from '../ChatRenderer'
import styles from './pty-assistant.module.css'

function makeTextMsg(role: 'user' | 'assistant', text: string): TranscriptMessage {
  return {
    role,
    ts: new Date().toISOString(),
    blocks: [{ type: 'text', text }],
  }
}

export function PtyAssistant() {
  const {
    isOpen, isMinimized, messages, currentReply, isGenerating, ptyAlive,
    position, toggle, minimize, restore, close,
    addMessage, setPosition,
  } = usePtyChatStore()
  const { connect, send, stop, reconnect } = usePtyStream()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isFirstLoadRef = useRef(true)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const [projectCwd, setProjectCwd] = useState<string | null>(null)
  const apiRef = useRef(new HttpAdapter('local-http'))
  const hasConnectedRef = useRef(false)

  // 拉取项目 cwd
  useEffect(() => {
    if (!activeProjectId) { setProjectCwd(null); return }
    apiRef.current.getProjects().then((projects) => {
      const proj = projects.find((p: Project) => p.id === Number(activeProjectId))
      if (proj) {
        setProjectCwd((proj as Project & { repo_url: string }).repo_url || null)
      }
    }).catch(() => {})
  }, [activeProjectId])

  // 面板打开时自动连接 PTY
  useEffect(() => {
    if (isOpen && !hasConnectedRef.current) {
      hasConnectedRef.current = true
      connect(projectCwd || undefined)
    }
  }, [isOpen, projectCwd, connect])

  // 滚动到底部
  useEffect(() => {
    if (!messages.length && !currentReply) return
    if (isFirstLoadRef.current) {
      isFirstLoadRef.current = false
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
      })
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, currentReply])

  // Ctrl+Shift+J 快捷键
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'J') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggle])

  // 拖拽
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const panel = panelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: rect.left, startPosY: rect.top }
    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 200, dragRef.current.startPosX + ev.clientX - dragRef.current.startX)),
        y: Math.max(0, Math.min(window.innerHeight - 60, dragRef.current.startPosY + ev.clientY - dragRef.current.startY)),
      })
    }
    const handleUp = () => { dragRef.current = null; document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp) }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [setPosition])

  // 8方向 Resize
  const handleEdgeResize = useCallback((e: React.MouseEvent, edges: { top?: boolean; bottom?: boolean; left?: boolean; right?: boolean }) => {
    e.preventDefault()
    e.stopPropagation()
    const panel = panelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    const start = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height, l: rect.left, t: rect.top }
    const handleMove = (ev: MouseEvent) => {
      if (!panelRef.current) return
      const dx = ev.clientX - start.x
      const dy = ev.clientY - start.y
      const s = panelRef.current.style
      if (edges.right) s.width = Math.max(350, start.w + dx) + 'px'
      if (edges.bottom) s.height = Math.max(300, start.h + dy) + 'px'
      if (edges.left) {
        const newW = Math.max(350, start.w - dx)
        s.width = newW + 'px'
        s.left = (start.l + start.w - newW) + 'px'
        s.right = 'auto'
        s.bottom = 'auto'
        s.top = start.t + 'px'
      }
      if (edges.top) {
        const newH = Math.max(300, start.h - dy)
        s.height = newH + 'px'
        s.top = (start.t + start.h - newH) + 'px'
        s.right = 'auto'
        s.bottom = 'auto'
        s.left = start.l + 'px'
      }
    }
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || isGenerating) return
    setInput('')
    addMessage(makeTextMsg('user', text))
    send(text)
  }, [input, isGenerating, addMessage, send])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleReconnect = useCallback(() => {
    hasConnectedRef.current = true
    reconnect(projectCwd || undefined)
  }, [reconnect, projectCwd])

  // 新对话
  const handleNewSession = useCallback(() => {
    const store = usePtyChatStore.getState()
    store.setMessages([])
    store.setCurrentReply('')
    hasConnectedRef.current = false
    reconnect(projectCwd || undefined)
    hasConnectedRef.current = true
  }, [reconnect, projectCwd])

  const displayMessages = currentReply
    ? [...messages, makeTextMsg('assistant', currentReply)]
    : messages

  return (
    <>
      {!isOpen && (
        <button className={styles.fab} onClick={toggle} title="PTY 助手 (Ctrl+Shift+J)">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </button>
      )}

      {isOpen && (
        <div
          ref={panelRef}
          className={`${styles.panel} ${isMinimized ? styles.panelMinimized : ''}`}
          style={position.x >= 0 ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined}
        >
          {/* 头部 */}
          <div className={styles.header} onMouseDown={handleDragStart}>
            <div className={styles.headerAvatar}>⚡</div>
            <span className={styles.headerTitle}>PTY 助手</span>
            <span className={`${styles.headerStatus} ${ptyAlive ? styles.statusAlive : styles.statusDead}`}>
              {ptyAlive ? '运行中' : '未连接'}
            </span>
            <div className={styles.headerSpacer} />
            <div className={styles.headerActions}>
              {!ptyAlive && (
                <button className={styles.headerBtn} onClick={handleReconnect} title="重连">↻</button>
              )}
              <button className={styles.headerBtn} onClick={handleNewSession} title="新对话">+</button>
              <button className={styles.headerBtn} onClick={isMinimized ? restore : minimize} title={isMinimized ? '展开' : '最小化'}>
                {isMinimized ? '□' : '—'}
              </button>
              <button className={styles.headerBtn} onClick={close} title="关闭">×</button>
            </div>
          </div>

          {!isMinimized && (
            <div className={styles.chatMain}>
              {/* 消息列表 */}
              <div className={styles.messages}>
                {displayMessages.length === 0 && (
                  <div className={styles.empty}>
                    {ptyAlive ? (
                      <>PTY 模式已就绪<br/>交互式 Claude，多轮对话无冷启动<br/>直接输入开始对话</>
                    ) : (
                      <>正在连接 PTY 进程...<br/>请稍候</>
                    )}
                  </div>
                )}
                <ChatMessageList messages={displayMessages} />
                <div ref={messagesEndRef} />
              </div>

              {/* 输入区 */}
              <div className={styles.inputArea}>
                <textarea
                  className={styles.input}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={ptyAlive ? '输入消息...' : '等待 PTY 连接...'}
                  rows={1}
                  disabled={!ptyAlive}
                />
                {isGenerating ? (
                  <button className={styles.sendBtn} onClick={stop}>停止</button>
                ) : (
                  <button className={styles.sendBtn} onClick={handleSend} disabled={!input.trim() || !ptyAlive}>发送</button>
                )}
              </div>
            </div>
          )}

          {/* 8方向 Resize 手柄 */}
          {!isMinimized && <>
            <div className={styles.resizeN} onMouseDown={(e) => handleEdgeResize(e, { top: true })} />
            <div className={styles.resizeS} onMouseDown={(e) => handleEdgeResize(e, { bottom: true })} />
            <div className={styles.resizeE} onMouseDown={(e) => handleEdgeResize(e, { right: true })} />
            <div className={styles.resizeW} onMouseDown={(e) => handleEdgeResize(e, { left: true })} />
            <div className={styles.resizeNE} onMouseDown={(e) => handleEdgeResize(e, { top: true, right: true })} />
            <div className={styles.resizeNW} onMouseDown={(e) => handleEdgeResize(e, { top: true, left: true })} />
            <div className={styles.resizeSE} onMouseDown={(e) => handleEdgeResize(e, { bottom: true, right: true })} />
            <div className={styles.resizeSW} onMouseDown={(e) => handleEdgeResize(e, { bottom: true, left: true })} />
          </>}
        </div>
      )}
    </>
  )
}
