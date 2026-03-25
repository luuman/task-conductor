import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useChatStore, type PageContext } from '../../lib/store/chat'
import { useChatStream } from '../../hooks/useChatStream'
import { useAppStore } from '../../lib/store/app'
import { HttpAdapter } from '../../lib/api/http'
import type { AiSession, Project, Task, TranscriptMessage } from '../../lib/api/types'
import { ChatMessageList } from '../ChatRenderer'
import { useSessionData } from '../SessionChat/useSessionData'
import styles from './FloatingAssistant.module.css'

interface ProjectInfo {
  name: string
  repo_url: string
  taskCount: number
  tasks: { id: number; title: string; stage: string; status: string }[]
}

// ── Tab 类型 ──
interface ChatTab {
  id: string
  type: 'new' | 'session'
  title: string
  sessionId?: string
  savedMessages?: TranscriptMessage[]
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
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

function makeTextMsg(role: 'user' | 'assistant', text: string): TranscriptMessage {
  return {
    role,
    ts: new Date().toISOString(),
    blocks: [{ type: 'text', text }],
  }
}

// ── 主组件 ──
export function FloatingAssistant() {
  const {
    isOpen, isMinimized, messages, currentReply, isGenerating,
    pageContext, position, minimize, restore, close,
    addMessage, setSystemPrompt, setPosition, setProjectCwd,
  } = useChatStore()
  const { send, stop } = useChatStream()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isFirstLoadRef = useRef(true)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null)
  const repoUrlRef = useRef('')
  const apiRef = useRef(new HttpAdapter('local-http'))

  // ── Tab 状态 ──
  const [tabs, setTabs] = useState<ChatTab[]>(() => [{ id: uid(), type: 'new', title: '新对话' }])
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].id)
  const tabCacheRef = useRef(new Map<string, { messages: TranscriptMessage[], sessionId: string | null }>())

  // ── 历史会话下拉 ──
  const [showHistory, setShowHistory] = useState(false)
  const historyRef = useRef<HTMLDivElement>(null)

  // Use shared session data hook
  const {
    sessions,
    selectSession: sharedSelectSession,
    selectedId: _activeSessionId,
    clearSelection: sharedClearSelection,
  } = useSessionData({ filterByCwd: repoUrlRef.current || undefined })

  // 关闭历史下拉
  useEffect(() => {
    if (!showHistory) return
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) setShowHistory(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showHistory])

  // 拉取项目信息
  useEffect(() => {
    if (!activeProjectId) { setProjectInfo(null); return }
    const pid = Number(activeProjectId)
    Promise.all([
      apiRef.current.getProjects(),
      apiRef.current.getTasks(pid),
    ]).then(([projects, tasks]) => {
      const proj = projects.find((p: Project) => p.id === pid)
      if (proj) {
        const repoUrl = (proj as Project & { repo_url: string }).repo_url || ''
        repoUrlRef.current = repoUrl
        setProjectInfo({
          name: proj.name, repo_url: repoUrl,
          taskCount: tasks.length,
          tasks: tasks.slice(0, 10).map((t: Task) => ({ id: t.id, title: t.title, stage: t.stage, status: t.status })),
        })
        setProjectCwd(repoUrl || null)
      }
    }).catch(() => {})
  }, [activeProjectId, setProjectCwd])

  // 当 claude 返回 session_id 时，选中该会话
  const claudeSessionId = useChatStore((s) => s.claudeSessionId)
  useEffect(() => {
    if (!claudeSessionId) return
    sharedSelectSession(claudeSessionId)
  }, [claudeSessionId, sharedSelectSession])

  // system prompt
  useEffect(() => {
    setSystemPrompt(buildSystemPrompt(pageContext, projectInfo))
  }, [pageContext, projectInfo, setSystemPrompt])

  // 滚动到底部：首次加载直接定位，后续新消息平滑滚动
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

  // PRD 检测
  useEffect(() => {
    if (messages.length === 0) return
    const last = messages[messages.length - 1]
    if (last.role !== 'assistant') return
    const content = last.blocks
      .filter(b => b.type === 'text')
      .map(b => b.text || '')
      .join('\n')
    const prdMatch = content.match(/---PRD---\s*([\s\S]*?)\s*---PRD---/)
    if (prdMatch) {
      try {
        const prd = prdMatch[1].trim()
        JSON.parse(prd)
        useChatStore.getState().setPrd(prd)
        useChatStore.getState().openPrdSidebar()
      } catch { /* invalid JSON */ }
    }
  }, [messages])

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
      const newX = dragRef.current.startPosX + ev.clientX - dragRef.current.startX
      const newY = dragRef.current.startPosY + ev.clientY - dragRef.current.startY
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 200, newX)),
        y: Math.max(0, Math.min(window.innerHeight - 60, newY)),
      })
    }
    const handleUp = () => { dragRef.current = null; document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp) }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [setPosition])

  // 8方向 Resize（带边界 clamp）
  const handleEdgeResize = useCallback((e: React.MouseEvent, edges: { top?: boolean; bottom?: boolean; left?: boolean; right?: boolean }) => {
    e.preventDefault()
    e.stopPropagation()
    const panel = panelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    const start = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height, l: rect.left, t: rect.top }
    const vw = window.innerWidth
    const vh = window.innerHeight

    const handleMove = (ev: MouseEvent) => {
      if (!panelRef.current) return
      const dx = ev.clientX - start.x
      const dy = ev.clientY - start.y
      const s = panelRef.current.style

      if (edges.right) {
        const maxW = vw - start.l
        s.width = Math.max(350, Math.min(start.w + dx, maxW)) + 'px'
      }
      if (edges.bottom) {
        const maxH = vh - start.t
        s.height = Math.max(300, Math.min(start.h + dy, maxH)) + 'px'
      }
      if (edges.left) {
        const maxExpand = start.l + start.w - 350
        const clampedDx = Math.max(-start.l, Math.min(dx, maxExpand))
        const newW = Math.max(350, start.w - clampedDx)
        const newL = Math.max(0, start.l + start.w - newW)
        s.width = newW + 'px'
        s.left = newL + 'px'
        s.right = 'auto'
        s.bottom = 'auto'
        s.top = start.t + 'px'
      }
      if (edges.top) {
        const maxExpand = start.t + start.h - 300
        const clampedDy = Math.max(-start.t, Math.min(dy, maxExpand))
        const newH = Math.max(300, start.h - clampedDy)
        const newT = Math.max(0, start.t + start.h - newH)
        s.height = newH + 'px'
        s.top = newT + 'px'
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

  // ── Tab 操作 ──
  const saveCurrentTab = useCallback(() => {
    const store = useChatStore.getState()
    tabCacheRef.current.set(activeTabId, {
      messages: [...store.messages],
      sessionId: store.claudeSessionId,
    })
  }, [activeTabId])

  const switchTab = useCallback((newTabId: string) => {
    if (newTabId === activeTabId) return
    // 保存当前 tab
    saveCurrentTab()
    // 加载新 tab
    const cached = tabCacheRef.current.get(newTabId)
    const store = useChatStore.getState()
    if (cached) {
      store.setMessages(cached.messages)
      store.setClaudeSessionId(cached.sessionId)
    } else {
      store.setMessages([])
      store.setClaudeSessionId(null)
    }
    store.setCurrentReply('')
    isFirstLoadRef.current = true
    setActiveTabId(newTabId)
  }, [activeTabId, saveCurrentTab])

  const handleNewTab = useCallback(() => {
    saveCurrentTab()
    const tab: ChatTab = { id: uid(), type: 'new', title: '新对话' }
    setTabs(prev => [...prev, tab])
    const store = useChatStore.getState()
    store.setMessages([])
    store.setCurrentReply('')
    store.setClaudeSessionId(null)
    sharedClearSelection()
    isFirstLoadRef.current = true
    setActiveTabId(tab.id)
  }, [saveCurrentTab, sharedClearSelection])

  const handleCloseTab = useCallback((tabId: string) => {
    setTabs(prev => {
      if (prev.length <= 1) return prev
      const idx = prev.findIndex(t => t.id === tabId)
      const filtered = prev.filter(t => t.id !== tabId)
      tabCacheRef.current.delete(tabId)
      if (tabId === activeTabId) {
        const newActive = filtered[Math.min(idx, filtered.length - 1)] || filtered[0]
        // 加载新激活 tab
        const cached = tabCacheRef.current.get(newActive.id)
        const store = useChatStore.getState()
        if (cached) {
          store.setMessages(cached.messages)
          store.setClaudeSessionId(cached.sessionId)
        } else {
          store.setMessages([])
          store.setClaudeSessionId(null)
        }
        store.setCurrentReply('')
        isFirstLoadRef.current = true
        setActiveTabId(newActive.id)
      }
      return filtered
    })
  }, [activeTabId])

  const handleOpenHistory = useCallback((session: AiSession) => {
    // 已打开则直接切换
    const existing = tabs.find(t => t.sessionId === session.session_id)
    if (existing) {
      switchTab(existing.id)
      setShowHistory(false)
      return
    }
    // 保存当前 tab
    saveCurrentTab()
    // 创建新 tab
    const tab: ChatTab = {
      id: uid(),
      type: 'session',
      title: session.note?.alias || session.summary || session.session_id.slice(0, 8),
      sessionId: session.session_id,
    }
    setTabs(prev => [...prev, tab])
    setActiveTabId(tab.id)
    setShowHistory(false)

    // 加载历史消息
    isFirstLoadRef.current = true
    sharedSelectSession(session.session_id)
    const store = useChatStore.getState()
    store.setCurrentReply('')
    store.setClaudeSessionId(session.session_id)
    apiRef.current.getTranscript(session.session_id).then(({ messages: msgs }) => {
      if (!msgs?.length) return
      if (useChatStore.getState().claudeSessionId === session.session_id) {
        useChatStore.getState().setMessages(msgs)
        tabCacheRef.current.set(tab.id, { messages: msgs, sessionId: session.session_id })
      }
    }).catch(() => {})
  }, [tabs, saveCurrentTab, switchTab, sharedSelectSession])

  // 首条消息时更新 tab 标题
  useEffect(() => {
    if (messages.length !== 1 || messages[0].role !== 'user') return
    const text = messages[0].blocks.filter(b => b.type === 'text').map(b => b.text || '').join(' ').trim()
    if (!text) return
    const title = text.slice(0, 20) + (text.length > 20 ? '...' : '')
    setTabs(prev => prev.map(t => t.id === activeTabId && t.type === 'new' ? { ...t, title } : t))
  }, [messages, activeTabId])

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

  // Build streaming message for display
  const displayMessages = currentReply
    ? [...messages, makeTextMsg('assistant', currentReply)]
    : messages

  const formatTime = (ts: string) => {
    const now = new Date()
    const d = new Date(ts)
    const diff = now.getTime() - d.getTime()
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
    return `${Math.floor(diff / 86400000)}天前`
  }

  return (
    <>
      {isOpen && (
        <div
          ref={panelRef}
          className={`${styles.panel} ${isMinimized ? styles.panelMinimized : ''}`}
          style={position.x >= 0 ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined}
        >
          {/* 头部 */}
          <div className={styles.header} onMouseDown={handleDragStart}>
            <div className={styles.headerAvatar}>🤖</div>
            <span className={styles.headerTitle}>AI 助手</span>
            <span className={styles.headerOnline}>在线</span>
            <div className={styles.headerActions}>
              <button className={styles.headerBtn} onClick={isMinimized ? restore : minimize} title={isMinimized ? '展开' : '最小化'}>
                {isMinimized ? '□' : '—'}
              </button>
              <button className={styles.headerBtn} onClick={close} title="关闭">×</button>
            </div>
          </div>

          {!isMinimized && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

              {/* ── Tab 栏 ── */}
              <div className={styles.tabBar}>
                {tabs.map(tab => (
                  <div
                    key={tab.id}
                    className={`${styles.tab} ${tab.id === activeTabId ? styles.tabActive : ''}`}
                    onClick={() => switchTab(tab.id)}
                    title={tab.title}
                  >
                    {isGenerating && tab.id === activeTabId && (
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4477ff', animation: 'pulse 2s infinite', flexShrink: 0 }} />
                    )}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{tab.title}</span>
                    {tabs.length > 1 && (
                      <button
                        className={styles.tabClose}
                        onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id) }}
                      >×</button>
                    )}
                  </div>
                ))}
                {/* 右侧按钮 */}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                  <button
                    className={styles.tab}
                    onClick={handleNewTab}
                    title="新建会话"
                    style={{ color: 'var(--tc-accent, #007acc)' }}
                  >+</button>
                  <div ref={historyRef} style={{ position: 'relative' }}>
                    <button
                      className={styles.tab}
                      onClick={() => setShowHistory(v => !v)}
                      title="历史会话"
                      style={{ color: showHistory ? '#fff' : undefined }}
                    >⏱</button>
                    {showHistory && (
                      <div style={{
                        position: 'absolute', top: '100%', right: 0, marginTop: 4,
                        width: 300, maxHeight: 400, background: '#111119',
                        border: '1px solid var(--tc-border, #2a2a3a)', borderRadius: 10,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 20,
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                      }}>
                        <div style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#888', borderBottom: '1px solid #1e1e2e' }}>
                          历史会话
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
                          {sessions.length === 0 && (
                            <div style={{ padding: '20px 12px', fontSize: 12, color: '#444', textAlign: 'center' }}>
                              暂无历史会话
                            </div>
                          )}
                          {sessions.map(s => {
                            const statusColor = s.status === 'active' ? '#10b981' : s.status === 'idle' ? '#f59e0b' : '#6b7280'
                            const title = s.note?.alias || s.summary || s.session_id.slice(0, 8)
                            const alreadyOpen = tabs.some(t => t.sessionId === s.session_id)
                            return (
                              <div
                                key={s.session_id}
                                onClick={() => handleOpenHistory(s)}
                                style={{
                                  padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                                  marginBottom: 3, display: 'flex', alignItems: 'center', gap: 10,
                                  transition: 'background .1s',
                                  minHeight: 44,
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#1a1a28')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                              >
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{
                                    fontSize: 13, color: alreadyOpen ? 'var(--tc-accent, #007acc)' : '#ccc',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    lineHeight: '18px',
                                  }}>{title}</div>
                                  <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>
                                    {s.event_count} 事件 · {formatTime(s.last_seen_at || s.started_at)}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── 聊天主体 ── */}
              <div className={styles.chatMain}>
                {/* 消息列表 */}
                <div className={styles.messages}>
                  {displayMessages.length === 0 && (
                    <div className={styles.empty}>
                      {projectInfo ? (
                        <>项目 <strong>{projectInfo.name}</strong><br/>向我描述你的需求<br/>我会帮你分析、创建任务、生成 PRD</>
                      ) : (
                        <>请先选择一个项目</>
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
