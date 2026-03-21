import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useChatStore } from '../../lib/store/chat'
import { useChatStream } from '../../hooks/useChatStream'
import styles from './FloatingAssistant.module.css'

function buildSystemPrompt(ctx: { page: string; projectId?: number; taskId?: number; taskTitle?: string; taskStage?: string }): string {
  const base = '你是 TaskConductor AI 助手。根据用户当前页面上下文提供帮助。'
  switch (ctx.page) {
    case 'dashboard':
      return base + `\n用户在项目概览页（项目ID:${ctx.projectId ?? '未知'}）。可以帮助：创建任务、分析需求。当用户描述需求时，主动开始需求访谈。`
    case 'task-detail':
      return base + `\n用户在任务"${ctx.taskTitle ?? ''}"详情页（阶段:${ctx.taskStage ?? ''}, 任务ID:${ctx.taskId ?? ''})。可以帮助：编辑PRD、讨论方案、推进阶段。输出PRD时用 ---PRD--- 分隔符附带JSON。`
    case 'task-manager':
      return base + '\n用户在任务列表页。帮助创建/管理任务。'
    case 'files':
      return base + '\n用户在文件编辑页。帮助代码分析和修改建议。'
    case 'git':
      return base + '\n用户在Git页面。帮助分支管理和提交建议。'
    default:
      return base
  }
}

export function FloatingAssistant() {
  const {
    isOpen, isMinimized, messages, currentReply, isGenerating,
    pageContext, position, toggle, minimize, restore, close,
    addMessage, setSystemPrompt, setPosition,
  } = useChatStore()
  const { send, stop } = useChatStream()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)

  // 拖拽 header 移动面板
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    // 如果点击的是按钮，不拖拽
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()

    const panel = panelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: rect.left,
      startPosY: rect.top,
    }

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      const newX = Math.max(0, Math.min(window.innerWidth - 400, dragRef.current.startPosX + dx))
      const newY = Math.max(0, Math.min(window.innerHeight - 60, dragRef.current.startPosY + dy))
      setPosition({ x: newX, y: newY })
    }

    const handleMouseUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [setPosition])

  // 页面上下文变化时更新 system prompt
  useEffect(() => {
    setSystemPrompt(buildSystemPrompt(pageContext))
  }, [pageContext, setSystemPrompt])

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentReply])

  // 检测 PRD 分隔符
  useEffect(() => {
    if (messages.length === 0) return
    const last = messages[messages.length - 1]
    if (last.role !== 'assistant') return
    const prdMatch = last.content.match(/---PRD---\s*([\s\S]*?)\s*---PRD---/)
    if (prdMatch) {
      try {
        const prd = prdMatch[1].trim()
        JSON.parse(prd) // validate
        useChatStore.getState().setPrd(prd)
        useChatStore.getState().openPrdSidebar()
      } catch { /* invalid JSON */ }
    }
  }, [messages])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || isGenerating) return
    setInput('')
    addMessage({
      id: Date.now(),
      task_id: 0,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    })
    send(text)
  }, [input, isGenerating, addMessage, send])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <>
      {/* FAB 按钮 */}
      {!isOpen && (
        <button className={styles.fab} onClick={toggle} title="AI 助手">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {/* 聊天面板 */}
      {isOpen && (
        <div
          ref={panelRef}
          className={`${styles.panel} ${isMinimized ? styles.panelMinimized : ''}`}
          style={position.x >= 0 ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined}
        >
          <div className={styles.header} onMouseDown={handleDragStart}>
            <div>
              <span className={styles.headerTitle}>AI 助手</span>
              <span className={styles.headerContext}>{pageContext.page}</span>
            </div>
            <div className={styles.headerActions}>
              <button
                className={styles.headerBtn}
                onClick={isMinimized ? restore : minimize}
                title={isMinimized ? '展开' : '最小化'}
              >
                {isMinimized ? '□' : '—'}
              </button>
              <button className={styles.headerBtn} onClick={close} title="关闭">×</button>
            </div>
          </div>

          {!isMinimized && (
            <>
              <div className={styles.messages}>
                {messages.length === 0 && !currentReply && (
                  <div className={styles.empty}>
                    向我描述你的需求，我可以帮你创建任务、生成 PRD、推进流水线。
                  </div>
                )}
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`${styles.message} ${msg.role === 'user' ? styles.messageUser : styles.messageAssistant}`}
                  >
                    {msg.role === 'assistant' ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    ) : msg.content}
                  </div>
                ))}
                {currentReply && (
                  <div className={styles.streaming}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentReply}</ReactMarkdown>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className={styles.inputArea}>
                <textarea
                  className={styles.input}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入消息..."
                  rows={1}
                />
                {isGenerating ? (
                  <button className={styles.sendBtn} onClick={stop}>停止</button>
                ) : (
                  <button className={styles.sendBtn} onClick={handleSend} disabled={!input.trim()}>
                    发送
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
