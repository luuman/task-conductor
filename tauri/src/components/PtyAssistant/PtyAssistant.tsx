import { useCallback, useEffect, useRef } from 'react'
import { IconZap, IconMenu, IconX, IconMinus, IconMaximize } from '../../ui/icon'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { usePtyChatStore, generateSessionId, type PtySession } from '../../lib/store/pty-chat'
import { usePtyStream } from '../../hooks/usePtyStream'
import { useAppStore } from '../../lib/store/app'
import { HttpAdapter } from '../../lib/api/http'
import type { Project } from '../../lib/api/types'
import styles from './pty-assistant.module.css'

const TERM_OPTIONS = {
  cursorBlink: true,
  fontSize: 13,
  fontFamily: "'Geist Mono', 'Cascadia Code', 'Fira Code', monospace",
  theme: {
    background: '#0d0d14',
    foreground: '#d4d4d8',
    cursor: '#10b981',
    selectionBackground: 'rgba(16, 185, 129, 0.25)',
    black: '#09090b',
    red: '#ef4444',
    green: '#10b981',
    yellow: '#f59e0b',
    blue: '#3b82f6',
    magenta: '#a855f7',
    cyan: '#06b6d4',
    white: '#d4d4d8',
    brightBlack: '#52525b',
    brightRed: '#f87171',
    brightGreen: '#34d399',
    brightYellow: '#fbbf24',
    brightBlue: '#60a5fa',
    brightMagenta: '#c084fc',
    brightCyan: '#22d3ee',
    brightWhite: '#fafafa',
  },
  allowTransparency: true,
  scrollback: 5000,
} as const

export function PtyAssistant() {
  const {
    isOpen, isMinimized, position, sidebarOpen, sessions, activeSessionId,
    toggle, minimize, restore, close, setPosition, setSidebarOpen,
    addSession, removeSession, setActiveSession,
  } = usePtyChatStore()
  const { connectSession, writeToSession, resizeSession, disconnectSession, disconnectAll } = usePtyStream()

  // sessionId → { term, fitAddon, container }
  const termMapRef = useRef<Map<string, { term: Terminal; fitAddon: FitAddon }>>(new Map())
  const termContainerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const projectCwdRef = useRef<string | null>(null)
  const apiRef = useRef(new HttpAdapter('local-http'))

  // 拉取项目 cwd
  useEffect(() => {
    if (!activeProjectId) { projectCwdRef.current = null; return }
    apiRef.current.getProjects().then((projects) => {
      const proj = projects.find((p: Project) => p.id === Number(activeProjectId))
      if (proj) {
        projectCwdRef.current = (proj as Project & { repo_url: string }).repo_url || null
      }
    }).catch(() => {})
  }, [activeProjectId])

  // 创建新会话
  const createNewSession = useCallback(() => {
    const id = generateSessionId()
    const session: PtySession = {
      id,
      label: `终端 ${sessions.length + 1}`,
      alive: false,
      createdAt: Date.now(),
    }
    addSession(session)
    return id
  }, [sessions.length, addSession])

  // 挂载终端到 DOM 并连接
  const mountTerminal = useCallback((sessionId: string) => {
    const container = termContainerRef.current
    if (!container) return

    // 已有终端 → 显示它
    const existing = termMapRef.current.get(sessionId)
    if (existing) {
      // 隐藏所有终端，显示当前
      container.childNodes.forEach((child) => {
        (child as HTMLElement).style.display = 'none'
      })
      const el = container.querySelector(`[data-session="${sessionId}"]`) as HTMLElement
      if (el) {
        el.style.display = 'block'
        requestAnimationFrame(() => existing.fitAddon.fit())
      }
      return
    }

    // 创建终端 wrapper
    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-session', sessionId)
    wrapper.style.width = '100%'
    wrapper.style.height = '100%'

    // 隐藏其他终端
    container.childNodes.forEach((child) => {
      (child as HTMLElement).style.display = 'none'
    })
    container.appendChild(wrapper)

    const term = new Terminal(TERM_OPTIONS)
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(wrapper)
    termMapRef.current.set(sessionId, { term, fitAddon })

    requestAnimationFrame(() => {
      fitAddon.fit()

      // 用户输入 → WebSocket
      term.onData((data) => {
        writeToSession(sessionId, data)
      })

      // 连接 PTY
      connectSession(sessionId, {
        cwd: projectCwdRef.current || undefined,
        cols: term.cols,
        rows: term.rows,
        onData: (data) => term.write(data),
      })
    })
  }, [connectSession, writeToSession])

  // 切换活跃会话
  const switchSession = useCallback((sessionId: string) => {
    setActiveSession(sessionId)
    // 延迟一帧确保 DOM 更新
    requestAnimationFrame(() => mountTerminal(sessionId))
  }, [setActiveSession, mountTerminal])

  // 关闭（删除）会话
  const closeSession = useCallback((sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    disconnectSession(sessionId)
    const entry = termMapRef.current.get(sessionId)
    if (entry) {
      entry.term.dispose()
      termMapRef.current.delete(sessionId)
    }
    // 删除 DOM
    const container = termContainerRef.current
    const el = container?.querySelector(`[data-session="${sessionId}"]`)
    el?.remove()
    removeSession(sessionId)
  }, [disconnectSession, removeSession])

  // 面板打开时，确保有至少一个会话
  useEffect(() => {
    if (!isOpen || isMinimized) return

    if (sessions.length === 0) {
      const id = createNewSession()
      requestAnimationFrame(() => mountTerminal(id))
    } else if (activeSessionId) {
      requestAnimationFrame(() => mountTerminal(activeSessionId))
    }
  }, [isOpen, isMinimized]) // eslint-disable-line react-hooks/exhaustive-deps

  // 监听容器大小变化 → 自动 fit
  useEffect(() => {
    if (!isOpen || isMinimized) return
    const container = termContainerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      const sid = usePtyChatStore.getState().activeSessionId
      if (!sid) return
      const entry = termMapRef.current.get(sid)
      if (entry) {
        requestAnimationFrame(() => {
          entry.fitAddon.fit()
          resizeSession(sid, entry.term.cols, entry.term.rows)
        })
      }
    })
    observer.observe(container)
    resizeObserverRef.current = observer
    return () => observer.disconnect()
  }, [isOpen, isMinimized, resizeSession])

  // 组件卸载 → 全部清理
  useEffect(() => {
    return () => {
      disconnectAll()
      termMapRef.current.forEach(({ term }) => term.dispose())
      termMapRef.current.clear()
    }
  }, [disconnectAll])

  // Ctrl+Shift+J
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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

  // Resize
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
      if (edges.right) s.width = Math.max(400, start.w + dx) + 'px'
      if (edges.bottom) s.height = Math.max(300, start.h + dy) + 'px'
      if (edges.left) {
        const newW = Math.max(400, start.w - dx)
        s.width = newW + 'px'
        s.left = (start.l + start.w - newW) + 'px'
        s.right = 'auto'; s.bottom = 'auto'; s.top = start.t + 'px'
      }
      if (edges.top) {
        const newH = Math.max(300, start.h - dy)
        s.height = newH + 'px'
        s.top = (start.t + start.h - newH) + 'px'
        s.right = 'auto'; s.bottom = 'auto'; s.left = start.l + 'px'
      }
    }
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
      // refit
      const sid = usePtyChatStore.getState().activeSessionId
      if (sid) {
        const entry = termMapRef.current.get(sid)
        if (entry) {
          requestAnimationFrame(() => {
            entry.fitAddon.fit()
            resizeSession(sid, entry.term.cols, entry.term.rows)
          })
        }
      }
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [resizeSession])

  const handleNewSession = useCallback(() => {
    const id = createNewSession()
    requestAnimationFrame(() => mountTerminal(id))
  }, [createNewSession, mountTerminal])

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
            <div className={styles.headerAvatar}><IconZap size={16} /></div>
            <span className={styles.headerTitle}>Claude Terminal</span>
            <span className={styles.headerBadge}>PTY</span>
            {activeSessionId && (
              <span className={`${styles.headerStatus} ${
                sessions.find(s => s.id === activeSessionId)?.alive ? styles.statusAlive : styles.statusDead
              }`}>
                {sessions.find(s => s.id === activeSessionId)?.alive ? '运行中' : '连接中'}
              </span>
            )}
            <div className={styles.headerSpacer} />
            <div className={styles.headerActions}>
              <button className={styles.headerBtn} onClick={() => setSidebarOpen(!sidebarOpen)} title="会话列表">☰</button>
              <button className={styles.headerBtn} onClick={handleNewSession} title="新终端">+</button>
              <button className={styles.headerBtn} onClick={isMinimized ? restore : minimize} title={isMinimized ? '展开' : '最小化'}>
                {isMinimized ? '□' : '—'}
              </button>
              <button className={styles.headerBtn} onClick={close} title="隐藏">×</button>
            </div>
          </div>

          {!isMinimized && (
            <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              {/* 侧边栏 */}
              {sidebarOpen && (
                <div className={styles.sidebar}>
                  <div className={styles.sidebarHeader}>
                    <span>会话</span>
                    <button className={styles.sidebarNewBtn} onClick={handleNewSession} title="新终端">+</button>
                  </div>
                  <div className={styles.sidebarList}>
                    {sessions.map(s => (
                      <div
                        key={s.id}
                        className={`${styles.sidebarItem} ${s.id === activeSessionId ? styles.sidebarItemActive : ''}`}
                        onClick={() => switchSession(s.id)}
                      >
                        <span className={styles.sidebarDot} style={{ background: s.alive ? '#10b981' : '#52525b' }} />
                        <span className={styles.sidebarLabel}>{s.label}</span>
                        <button
                          className={styles.sidebarCloseBtn}
                          onClick={(e) => closeSession(s.id, e)}
                          title="关闭会话"
                        >×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 终端区域 */}
              <div className={styles.termContainer} ref={termContainerRef} />
            </div>
          )}

          {/* Resize 手柄 */}
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
