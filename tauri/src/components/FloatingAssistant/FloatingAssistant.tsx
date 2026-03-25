import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { IconX, IconMinus, IconMaximize, IconClock, IconFileText } from '../../ui/icon'
import { useChatStore, type PageContext } from '../../lib/store/chat'
import { useChatStream } from '../../hooks/useChatStream'
import { useAppStore } from '../../lib/store/app'
import { HttpAdapter } from '../../lib/api/http'
import type { AiSession, Project, Task, TranscriptMessage, TranscriptBlock } from '../../lib/api/types'
import { useSessionData } from '../SessionChat/useSessionData'
import styles from './FloatingAssistant.module.css'

// ── 简洁消息渲染器（无气泡，文档风格）──
function SlimMessageList({ messages }: { messages: TranscriptMessage[] }) {
  return (
    <>
      {messages.map((msg, i) => {
        const textContent = msg.blocks
          .filter((b: TranscriptBlock) => b.type === 'text')
          .map((b: TranscriptBlock) => b.text ?? '')
          .join('\n')
          .trim()
        const toolBlocks = msg.blocks.filter((b: TranscriptBlock) => b.type === 'tool_use')

        return (
          <div key={i} className={msg.role === 'user' ? styles.slimUser : styles.slimAi}>
            {msg.role === 'user' ? (
              <p className={styles.slimUserText}>{textContent}</p>
            ) : (
              <>
                {textContent && (
                  <div className={styles.slimAiContent}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent}</ReactMarkdown>
                  </div>
                )}
                {toolBlocks.length > 0 && (
                  <div className={styles.slimTools}>
                    {toolBlocks.map((b: TranscriptBlock, j: number) => (
                      <span key={j} className={styles.slimToolPill}>
                        {b.tool_name ?? 'tool'}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}
    </>
  )
}

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
  const [historyPos, setHistoryPos] = useState<{ top: number; right: number } | null>(null)

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

  // 拖拽移动（直接操作 DOM，避免每帧 React 重渲染）
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const panel = panelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: rect.left, startPosY: rect.top }
    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current || !panel) return
      const newX = Math.max(0, Math.min(window.innerWidth - 200, dragRef.current.startPosX + ev.clientX - dragRef.current.startX))
      const newY = Math.max(0, Math.min(window.innerHeight - 60, dragRef.current.startPosY + ev.clientY - dragRef.current.startY))
      panel.style.left = newX + 'px'
      panel.style.top = newY + 'px'
      panel.style.right = 'auto'
      panel.style.bottom = 'auto'
    }
    const handleUp = (ev: MouseEvent) => {
      if (dragRef.current) {
        const newX = Math.max(0, Math.min(window.innerWidth - 200, dragRef.current.startPosX + ev.clientX - dragRef.current.startX))
        const newY = Math.max(0, Math.min(window.innerHeight - 60, dragRef.current.startPosY + ev.clientY - dragRef.current.startY))
        setPosition({ x: newX, y: newY })
      }
      dragRef.current = null
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
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

  const handleOpenHistory = useCallback((session: AiSession) => {
    // 直接在当前 tab 加载该会话（一个弹窗展示一个会话）
    setShowHistory(false)
    const title = session.note?.alias || session.summary || session.session_id.slice(0, 8)
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, type: 'session', title, sessionId: session.session_id } : t))

    isFirstLoadRef.current = true
    sharedSelectSession(session.session_id)
    const store = useChatStore.getState()
    store.setCurrentReply('')
    store.setClaudeSessionId(session.session_id)
    apiRef.current.getTranscript(session.session_id).then(({ messages: msgs }) => {
      if (!msgs?.length) return
      if (useChatStore.getState().claudeSessionId === session.session_id) {
        useChatStore.getState().setMessages(msgs)
        tabCacheRef.current.set(activeTabId, { messages: msgs, sessionId: session.session_id })
      }
    }).catch(() => {})
  }, [activeTabId, sharedSelectSession])

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

  const handleCopy = useCallback(() => {
    const lastAi = [...messages].reverse().find(m => m.role === 'assistant')
    if (!lastAi) return
    const text = lastAi.blocks
      .filter(b => b.type === 'text')
      .map(b => (b as { type: string; text?: string }).text ?? '')
      .join('\n')
    navigator.clipboard.writeText(text).catch(() => {})
  }, [messages])

  const handleRetry = useCallback(() => {
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    if (!lastUser || isGenerating) return
    const text = lastUser.blocks
      .filter(b => b.type === 'text')
      .map(b => (b as { type: string; text?: string }).text ?? '')
      .join('\n')
    if (text) send(text)
  }, [messages, isGenerating, send])

  // Build streaming message for display
  const displayMessages = currentReply
    ? [...messages, makeTextMsg('assistant', currentReply)]
    : messages

  // 提取消息中引用的源文件（来自 Read tool 调用）
  const sourceFiles = useMemo(() => {
    const seen = new Set<string>()
    const files: string[] = []
    for (const msg of messages) {
      for (const b of msg.blocks as TranscriptBlock[]) {
        if (b.type === 'tool_use' && b.tool_name === 'Read' && b.tool_input?.file_path) {
          const name = String(b.tool_input.file_path).split('/').pop() ?? ''
          if (name && !seen.has(name)) { seen.add(name); files.push(name) }
        }
      }
    }
    return files.slice(0, 6)
  }, [messages])

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
            <span className={styles.headerTitle}>
              {tabs.find(t => t.id === activeTabId)?.title || 'AI 助手'}
            </span>
            <div className={styles.headerActions}>
              <button
                className={styles.headerBtn}
                onClick={(e) => { e.stopPropagation(); handleNewTab() }}
                title="新建会话"
                onMouseDown={e => e.stopPropagation()}
              >+</button>
              <div ref={historyRef} style={{ position: 'relative' }}>
                <button
                  className={`${styles.headerBtn} ${showHistory ? styles.headerBtnActive : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!showHistory && historyRef.current) {
                      const rect = historyRef.current.getBoundingClientRect()
                      setHistoryPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
                    }
                    setShowHistory(v => !v)
                  }}
                  onMouseDown={e => e.stopPropagation()}
                  title="历史会话"
                ><IconClock size={12} /></button>
              </div>
              <div className={styles.headerSep} />
              <button className={styles.headerBtn} onClick={isMinimized ? restore : minimize} title={isMinimized ? '展开' : '最小化'}>
                {isMinimized ? <IconMaximize size={12} /> : <IconMinus size={12} />}
              </button>
              <button className={styles.headerBtn} onClick={close} title="关闭"><IconX size={12} /></button>
            </div>
          </div>

          {!isMinimized && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>


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
                  <SlimMessageList messages={displayMessages} />
                  <div ref={messagesEndRef} />
                </div>

                {/* 操作按钮 */}
                {messages.length > 0 && !isGenerating && (
                  <div className={styles.actionRow}>
                    <button className={styles.actionBtn} onClick={handleCopy}>复制</button>
                    <button className={styles.actionBtn} onClick={handleRetry}>重试</button>
                  </div>
                )}

                {/* Sources 区域 */}
                {sourceFiles.length > 0 && (
                  <div className={styles.sourcesSection}>
                    <div className={styles.sourcesLabel}>{sourceFiles.length} 个引用文件</div>
                    <div className={styles.sourcePills}>
                      {sourceFiles.map(f => (
                        <span key={f} className={styles.sourcePill}>
                          <IconFileText size={10} />
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 输入区 */}
                <div className={styles.inputArea}>
                  <div className={styles.inputToolbar}>
                    <button className={styles.contextBtn}>+ 上下文</button>
                  </div>
                  <div className={styles.inputRow}>
                    <textarea
                      className={styles.input}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="向 AI 提问..."
                      rows={1}
                    />
                    {isGenerating ? (
                      <button className={styles.sendCircle} onClick={stop}>■</button>
                    ) : (
                      <button className={styles.sendCircle} onClick={handleSend} disabled={!input.trim()}>↑</button>
                    )}
                  </div>
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

      {/* 历史会话下拉（fixed，脱离 overflow:hidden 的面板） */}
      {showHistory && historyPos && (
        <div
          className={styles.historyDropdown}
          style={{ position: 'fixed', top: historyPos.top, right: historyPos.right, width: 300, maxHeight: 400, zIndex: 99999 }}
        >
          <div className={styles.historyHeader}>
            <span className={styles.historyHeaderLabel}>历史会话</span>
          </div>
          <div className={styles.historyList}>
            {sessions.length === 0 && (
              <div className={styles.historyEmpty}>暂无历史会话</div>
            )}
            {sessions.map(s => {
              const title = s.note?.alias || s.summary || s.session_id.slice(0, 8)
              const isCurrent = tabs.find(t => t.id === activeTabId)?.sessionId === s.session_id
              const dotCls = s.status === 'active'
                ? `${styles.historyDot} ${styles.historyDotActive}`
                : s.status === 'idle'
                ? `${styles.historyDot} ${styles.historyDotIdle}`
                : `${styles.historyDot} ${styles.historyDotStopped}`
              return (
                <button
                  key={s.session_id}
                  className={`${styles.historyRow} ${isCurrent ? styles.historyRowActive : ''}`}
                  onClick={() => handleOpenHistory(s)}
                >
                  <span className={dotCls} />
                  <div className={styles.historyRowBody}>
                    <div className={`${styles.historyTitle} ${isCurrent ? styles.historyTitleOpen : ''}`}>{title}</div>
                    <div className={styles.historyMeta}>
                      {s.event_count} 事件 · {formatTime(s.last_seen_at || s.started_at)}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
