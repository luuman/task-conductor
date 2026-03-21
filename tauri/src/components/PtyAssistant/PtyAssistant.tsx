import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { usePtyChatStore } from '../../lib/store/pty-chat'
import { usePtyStream } from '../../hooks/usePtyStream'
import { useAppStore } from '../../lib/store/app'
import { HttpAdapter } from '../../lib/api/http'
import type { Project } from '../../lib/api/types'
import styles from './pty-assistant.module.css'

export function PtyAssistant() {
  const {
    isOpen, isMinimized, ptyAlive,
    position, toggle, minimize, restore, close, setPosition,
  } = usePtyChatStore()
  const { connect, write, resize, disconnect, reconnect } = usePtyStream()
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const termContainerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const [projectCwd, setProjectCwd] = useState<string | null>(null)
  const apiRef = useRef(new HttpAdapter('local-http'))
  const hasConnectedRef = useRef(false)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

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

  // 关闭时清理终端和连接
  useEffect(() => {
    if (!isOpen) {
      // 面板关闭 → 清理一切
      disconnect()
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      termRef.current?.dispose()
      termRef.current = null
      fitAddonRef.current = null
      hasConnectedRef.current = false
    }
  }, [isOpen, disconnect])

  // 初始化 xterm
  useEffect(() => {
    if (!isOpen || isMinimized) return
    const container = termContainerRef.current
    if (!container) return

    // 已有终端则跳过
    if (termRef.current) {
      requestAnimationFrame(() => fitAddonRef.current?.fit())
      return
    }

    const term = new Terminal({
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
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)

    term.open(container)
    termRef.current = term
    fitAddonRef.current = fitAddon

    // 初始 fit
    requestAnimationFrame(() => {
      fitAddon.fit()

      // 用户输入 → WebSocket → PTY
      term.onData((data) => {
        write(data)
      })

      // 连接 PTY
      if (!hasConnectedRef.current) {
        hasConnectedRef.current = true
        connect({
          cwd: projectCwd || undefined,
          cols: term.cols,
          rows: term.rows,
          onData: (data) => {
            term.write(data)
          },
        })
      }
    })

    // 监听容器大小变化
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (fitAddonRef.current && termRef.current) {
          fitAddonRef.current.fit()
          resize(termRef.current.cols, termRef.current.rows)
        }
      })
    })
    observer.observe(container)
    resizeObserverRef.current = observer

    return () => {
      observer.disconnect()
    }
  }, [isOpen, isMinimized]) // eslint-disable-line react-hooks/exhaustive-deps

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      disconnect()
      termRef.current?.dispose()
      termRef.current = null
    }
  }, [disconnect])

  // Ctrl+Shift+J 快捷键
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
      if (edges.right) s.width = Math.max(400, start.w + dx) + 'px'
      if (edges.bottom) s.height = Math.max(300, start.h + dy) + 'px'
      if (edges.left) {
        const newW = Math.max(400, start.w - dx)
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
      // 触发 resize
      requestAnimationFrame(() => fitAddonRef.current?.fit())
    }
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit()
        if (termRef.current) resize(termRef.current.cols, termRef.current.rows)
      })
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [resize])

  const handleReconnect = useCallback(() => {
    termRef.current?.clear()
    hasConnectedRef.current = true
    reconnect({
      cwd: projectCwd || undefined,
      cols: termRef.current?.cols || 120,
      rows: termRef.current?.rows || 40,
      onData: (data) => {
        termRef.current?.write(data)
      },
    })
  }, [reconnect, projectCwd])

  return (
    <>
      {!isOpen && (
        <button className={styles.fab} onClick={toggle} title="PTY 终端 (Ctrl+Shift+J)">
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
            <span className={styles.headerTitle}>Claude Terminal</span>
            <span className={styles.headerBadge}>PTY</span>
            <span className={`${styles.headerStatus} ${ptyAlive ? styles.statusAlive : styles.statusDead}`}>
              {ptyAlive ? '运行中' : '未连接'}
            </span>
            <div className={styles.headerSpacer} />
            <div className={styles.headerActions}>
              {!ptyAlive && (
                <button className={styles.headerBtn} onClick={handleReconnect} title="重连">↻</button>
              )}
              <button className={styles.headerBtn} onClick={isMinimized ? restore : minimize} title={isMinimized ? '展开' : '最小化'}>
                {isMinimized ? '□' : '—'}
              </button>
              <button className={styles.headerBtn} onClick={close} title="关闭">×</button>
            </div>
          </div>

          {/* 终端区域 */}
          {!isMinimized && (
            <div className={styles.termContainer} ref={termContainerRef} />
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
