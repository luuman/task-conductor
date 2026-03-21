import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useChatStore, type PageContext } from '../../lib/store/chat'
import { useChatStream } from '../../hooks/useChatStream'
import { useAppStore } from '../../lib/store/app'
import { HttpAdapter } from '../../lib/api/http'
import type { Project, Task, AiSession } from '../../lib/api/types'
import styles from './FloatingAssistant.module.css'

interface ProjectInfo {
  name: string
  repo_url: string
  taskCount: number
  tasks: { id: number; title: string; stage: string; status: string }[]
}

// ── System Prompt 构建 ──
function buildSystemPrompt(ctx: PageContext, project?: ProjectInfo | null): string {
  const parts: string[] = []
  parts.push('你是 TaskConductor AI 助手，帮助用户进行需求分析、任务管理和项目开发。')

  if (project) {
    parts.push(`\n## 当前项目\n- 名称: ${project.name}\n- 路径: ${project.repo_url || '未设置'}`)
    if (project.tasks.length > 0) {
      parts.push(`- 任务数: ${project.taskCount}`)
      const taskList = project.tasks.slice(0, 10).map(t => `  - [${t.stage}/${t.status}] ${t.title} (ID:${t.id})`).join('\n')
      parts.push(`- 最近任务:\n${taskList}`)
    }
  }

  switch (ctx.page) {
    case 'dashboard':
      parts.push('\n## 当前页面: 项目概览\n用户在查看项目仪表盘。你可以帮助：创建新任务、分析需求、查看项目状态。当用户描述一个需求时，主动引导需求访谈，深入了解细节后生成 PRD。')
      break
    case 'task-detail':
      parts.push(`\n## 当前页面: 任务详情\n任务: "${ctx.taskTitle}" (ID:${ctx.taskId}, 阶段:${ctx.taskStage})\n你可以帮助：讨论方案、编辑PRD、推进阶段。`)
      break
    case 'task-manager':
      parts.push('\n## 当前页面: 任务管理\n用户在查看/管理任务列表。可以帮助创建任务、批量操作、分析任务依赖。')
      break
    case 'files':
      parts.push('\n## 当前页面: 文件管理\n用户在浏览/编辑项目文件。可以帮助代码分析、修改建议。')
      break
    case 'git':
      parts.push('\n## 当前页面: Git 管理\n用户在查看 Git 状态。可以帮助分支管理、提交建议。')
      break
    case 'canvas':
      parts.push('\n## 当前页面: 需求画布\n用户在需求画布页面编辑 PRD。帮助分析需求、生成功能模块、推荐开发阶段。')
      break
  }

  parts.push('\n## 回复要求\n- 用中文回复\n- 回复简洁直接\n- 涉及代码用 Markdown 格式\n- 当用户描述需求时，主动追问细节')
  return parts.join('\n')
}

// ── 主组件 ──
export function FloatingAssistant() {
  const {
    isOpen, isMinimized, messages, currentReply, isGenerating,
    pageContext, position, toggle, minimize, restore, close,
    addMessage, setSystemPrompt, setPosition, setProjectCwd,
  } = useChatStore()
  const { send, stop } = useChatStream()
  const [input, setInput] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sessions, setSessions] = useState<AiSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null)
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null)

  // 拉取项目信息 + 会话列表
  useEffect(() => {
    if (!activeProjectId) { setProjectInfo(null); setSessions([]); return }
    const api = new HttpAdapter('local-http')
    const pid = Number(activeProjectId)
    Promise.all([
      api.getProjects(),
      api.getTasks(pid),
      api.getSessions(),
    ]).then(([projects, tasks, allSessions]) => {
      const proj = projects.find((p: Project) => p.id === pid)
      if (proj) {
        const repoUrl = (proj as Project & { repo_url: string }).repo_url || ''
        setProjectInfo({
          name: proj.name, repo_url: repoUrl,
          taskCount: tasks.length,
          tasks: tasks.slice(0, 10).map((t: Task) => ({ id: t.id, title: t.title, stage: t.stage, status: t.status })),
        })
        setProjectCwd(repoUrl || null)
        // 过滤当前项目的会话（cwd 匹配项目路径）
        const projectSessions = repoUrl
          ? allSessions.filter((s: AiSession) => s.cwd && s.cwd.startsWith(repoUrl))
          : allSessions
        setSessions(projectSessions)
      }
    }).catch(() => {})
  }, [activeProjectId, setProjectCwd])

  // 当 claude 返回 session_id 时，刷新会话列表
  const claudeSessionId = useChatStore((s) => s.claudeSessionId)
  useEffect(() => {
    if (!claudeSessionId || !projectInfo?.repo_url) return
    const api = new HttpAdapter('local-http')
    api.getSessions().then((allSessions) => {
      const projectSessions = allSessions.filter((s: AiSession) => s.cwd && s.cwd.startsWith(projectInfo.repo_url))
      setSessions(projectSessions)
      // 自动选中当前会话
      setActiveSessionId(claudeSessionId)
    }).catch(() => {})
  }, [claudeSessionId, projectInfo?.repo_url])

  // system prompt
  useEffect(() => {
    setSystemPrompt(buildSystemPrompt(pageContext, projectInfo))
  }, [pageContext, projectInfo, setSystemPrompt])

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentReply])

  // PRD 检测
  useEffect(() => {
    if (messages.length === 0) return
    const last = messages[messages.length - 1]
    if (last.role !== 'assistant') return
    const prdMatch = last.content.match(/---PRD---\s*([\s\S]*?)\s*---PRD---/)
    if (prdMatch) {
      try {
        const prd = prdMatch[1].trim()
        JSON.parse(prd)
        useChatStore.getState().setPrd(prd)
        useChatStore.getState().openPrdSidebar()
      } catch { /* invalid JSON */ }
    }
  }, [messages])

  // 快捷键：Ctrl+← / Ctrl+→ 切换会话
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (!isOpen || !e.ctrlKey || sessions.length === 0) return
      const idx = sessions.findIndex(s => s.session_id === activeSessionId)
      if (e.key === 'ArrowLeft' && idx > 0) {
        e.preventDefault()
        switchToSession(sessions[idx - 1].session_id)
      } else if (e.key === 'ArrowRight' && idx < sessions.length - 1) {
        e.preventDefault()
        switchToSession(sessions[idx + 1].session_id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, sessions, activeSessionId])

  // 拖拽移动
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

  // Resize
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const panel = panelRef.current
    if (!panel) return
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: panel.offsetWidth, startH: panel.offsetHeight }
    const handleMove = (ev: MouseEvent) => {
      if (!resizeRef.current || !panelRef.current) return
      panelRef.current.style.width = Math.max(350, resizeRef.current.startW + ev.clientX - resizeRef.current.startX) + 'px'
      panelRef.current.style.height = Math.max(300, resizeRef.current.startH + ev.clientY - resizeRef.current.startY) + 'px'
    }
    const handleUp = () => { resizeRef.current = null; document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp) }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [])

  // 切换到已有会话
  const switchToSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId)
    const store = useChatStore.getState()
    store.setMessages([])
    store.setCurrentReply('')
    store.setClaudeSessionId(sessionId)
    // 可以在这里从后端加载历史消息（transcript）
  }, [])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || isGenerating) return
    setInput('')
    addMessage({ id: Date.now(), task_id: 0, role: 'user', content: text, created_at: new Date().toISOString() })
    send(text)
  }, [input, isGenerating, addMessage, send])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // 新对话：清空状态，发第一条消息时自动创建会话
  const handleNewSession = useCallback(() => {
    setActiveSessionId(null)
    const store = useChatStore.getState()
    store.setMessages([])
    store.setCurrentReply('')
    store.setClaudeSessionId(null)
  }, [])

  const now = new Date()
  const formatTime = (ts: string) => {
    const d = new Date(ts)
    const diff = now.getTime() - d.getTime()
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
    return `${Math.floor(diff / 86400000)}天前`
  }

  return (
    <>
      {!isOpen && (
        <button className={styles.fab} onClick={toggle} title="AI 助手 (Ctrl+J)">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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
          <div className={styles.header} onMouseDown={handleDragStart} style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, borderRadius: '14px 14px 0 0' }}>
            <div className={styles.headerAvatar}>🤖</div>
            <span className={styles.headerTitle}>AI 助手</span>
            <span className={styles.headerOnline}>在线</span>
            <div className={styles.headerActions}>
              <button className={styles.headerBtn} onClick={() => setSidebarOpen(v => !v)} title="会话列表">☰</button>
              <button className={styles.headerBtn} onClick={isMinimized ? restore : minimize} title={isMinimized ? '展开' : '最小化'}>
                {isMinimized ? '□' : '—'}
              </button>
              <button className={styles.headerBtn} onClick={close} title="关闭">×</button>
            </div>
          </div>

          {!isMinimized && (
            <div style={{ display: 'flex', flex: 1, marginTop: 44 }}>
              {/* 左侧会话目录 */}
              {sidebarOpen && (
                <div className={styles.chatSidebar}>
                  <div className={styles.chatSidebarHeader}>
                    <span>会话</span>
                    <button className={styles.chatSidebarNewBtn} onClick={handleNewSession} title="新对话">+</button>
                  </div>
                  <div className={styles.chatSidebarList}>
                    {sessions.map(s => {
                      const statusColor = s.status === 'active' ? '#10b981' : s.status === 'idle' ? '#f59e0b' : '#6b7280'
                      const title = s.note?.alias || s.summary || s.session_id.slice(0, 8)
                      const isActive = s.session_id === activeSessionId
                      return (
                        <div
                          key={s.session_id}
                          className={`${styles.chatSidebarItem} ${isActive ? styles.chatSidebarItemActive : ''}`}
                          onClick={() => switchToSession(s.session_id)}
                        >
                          <span className={styles.chatSidebarDot} style={{ background: statusColor }} />
                          <div className={styles.chatSidebarItemInfo}>
                            <div className={styles.chatSidebarItemTitle}>{title}</div>
                            <div className={styles.chatSidebarItemMeta}>
                              {s.event_count} 事件 · {formatTime(s.last_seen_at || s.started_at)}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {sessions.length === 0 && (
                      <div style={{ padding: '12px 8px', fontSize: 11, color: '#444', textAlign: 'center' }}>
                        暂无会话记录<br/>发送消息开始对话
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 右侧聊天主体 */}
              <div className={styles.chatMain}>
                {/* Tab 栏 */}
                {sessions.length > 1 && (
                  <div className={styles.tabBar}>
                    {sessions.map(s => (
                      <div
                        key={s.id}
                        className={`${styles.tab} ${s.id === activeSessionId ? styles.tabActive : ''}`}
                        onClick={() => setActiveSessionId(s.id)}
                      >
                        {s.title}
                        {sessions.length > 1 && (
                          <button className={styles.tabClose} onClick={(e) => {
                            e.stopPropagation()
                            setSessions(prev => prev.filter(ss => ss.id !== s.id))
                            if (activeSessionId === s.id) {
                              const remaining = sessions.filter(ss => ss.id !== s.id)
                              if (remaining.length) setActiveSessionId(remaining[0].id)
                            }
                          }}>×</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 消息列表 */}
                <div className={styles.messages}>
                  {messages.length === 0 && !currentReply && (
                    <div className={styles.empty}>
                      {projectInfo ? (
                        <>项目 <strong>{projectInfo.name}</strong><br/>向我描述你的需求<br/>我会帮你分析、创建任务、生成 PRD</>
                      ) : (
                        <>请先选择一个项目</>
                      )}
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

                {/* 快捷键提示 */}
                {sessions.length > 1 && (
                  <div className={styles.shortcutHint}>
                    <kbd>Ctrl</kbd>+<kbd>←</kbd><kbd>→</kbd> 切换会话
                  </div>
                )}

                {/* 输入区 */}
                <div className={styles.inputArea}>
                  <textarea
                    className={styles.input}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="描述需求，或输入问题..."
                    rows={1}
                  />
                  {isGenerating ? (
                    <button className={styles.sendBtn} onClick={stop}>停止</button>
                  ) : (
                    <button className={styles.sendBtn} onClick={handleSend} disabled={!input.trim()}>发送</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Resize 手柄 */}
          {!isMinimized && <div className={styles.resizeHandle} onMouseDown={handleResizeStart} />}
        </div>
      )}
    </>
  )
}
