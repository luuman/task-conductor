import { Suspense, useCallback, useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell, Sidebar, Panel } from '../layouts'
import {
  IconLayoutGrid, IconLogo, IconFileText, IconMonitor,
  IconMessage, IconSettings, IconFolder, IconGitBranch, IconBlocks,
  IconBot, IconTerminal,
} from '../ui/icon'
import { useTheme } from '../ui/theme/useTheme'
import { useNotificationStore } from '../lib/store/notifications'
import { NotificationPanel } from '../components/NotificationPanel'
import { CommandMenu } from '../components/CommandMenu'
import { FloatingAssistant } from '../components/FloatingAssistant'
import { PtyAssistant } from '../components/PtyAssistant/PtyAssistant'
import { PrdSidebar } from '../components/PrdSidebar'
import { ProjectSwitcher } from '../components/ProjectSwitcher'
import { useChatStore } from '../lib/store/chat'
import { usePtyChatStore } from '../lib/store/pty-chat'
import { useAppStore } from '../lib/store/app'
import sidebarStyles from '../layouts/Sidebar/sidebar.module.css'
import shellStyles from '../layouts/AppShell/app-shell.module.css'

export function Layout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { mode, setMode } = useTheme()
  const togglePanel = useNotificationStore(s => s.togglePanel)
  const unreadCount = useNotificationStore(s => s.items.filter(n => !n.read).length)
  const [cmdOpen, setCmdOpen] = useState(false)
  const setPageContext = useChatStore((s) => s.setPageContext)
  const toggleChat = useChatStore((s) => s.toggle)
  const chatOpen = useChatStore((s) => s.isOpen)
  const togglePty = usePtyChatStore((s) => s.toggle)
  const ptyOpen = usePtyChatStore((s) => s.isOpen)
  const activeProjectId = useAppStore((s) => s.activeProjectId)

  // 页面上下文感知
  useEffect(() => {
    const path = location.pathname
    let page = 'dashboard'
    const taskMatch = path.match(/^\/task\/(\d+)/)
    if (taskMatch) {
      page = 'task-detail'
      setPageContext({ page, projectId: Number(activeProjectId), taskId: Number(taskMatch[1]) })
      return
    }
    if (path.startsWith('/task-manager')) page = 'task-manager'
    else if (path.startsWith('/files')) page = 'files'
    else if (path.startsWith('/git')) page = 'git'
    else if (path.startsWith('/sessions')) page = 'sessions'
    else if (path.startsWith('/settings')) page = 'settings'
    else if (path.startsWith('/chat')) page = 'chat'
    setPageContext({ page, projectId: Number(activeProjectId) || undefined })
  }, [location.pathname, activeProjectId, setPageContext])

  const handleCmdClose = useCallback(() => setCmdOpen(false), [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // 侧边栏 = 导航菜单（首页、任务、会话、文件、Git、设置）
  const sidebarItems = [
    { key: '/',            label: t('nav.dashboard'),     icon: <IconLayoutGrid size={16} /> },
    { key: '/versions',     label: '版本规划',              icon: <IconBlocks size={16} /> },
    { key: '/task-manager', label: t('layout.tasks'),     icon: <IconFileText size={16} /> },
    { key: '/sessions',    label: t('layout.sessions'),   icon: <IconMonitor size={16} /> },
    { key: '/chat',        label: t('layout.chat'),       icon: <IconMessage size={16} /> },
    { key: '/files',       label: t('layout.files'),      icon: <IconFolder size={16} /> },
    { key: '/git',         label: t('layout.git'),        icon: <IconGitBranch size={16} /> },
    { key: '/pipeline',    label: t('pipeline.title'),    icon: <IconGitBranch size={16} /> },
    { key: '/settings',    label: t('nav.settings'),      icon: <IconSettings size={16} /> },
  ]

  // 当前激活的导航项
  const activeKey = sidebarItems.find(
    (item) => item.key !== '/' && location.pathname.startsWith(item.key)
  )?.key ?? (location.pathname === '/' ? '/' : '')

  return (
  <>
    <AppShell>
      <Sidebar
        items={sidebarItems}
        activeKey={activeKey}
        onSelect={(key) => navigate(key)}
        logoIcon={<IconLogo size={18} />}
        mode={mode}
        onModeToggle={() => setMode(mode === 'dark' ? 'light' : 'dark')}
        notificationCount={unreadCount}
        onNotificationClick={togglePanel}
        footer={
          <>
            <button
              className={`${sidebarStyles.iconBtn} ${chatOpen ? sidebarStyles.iconBtnActive : ''}`}
              onClick={toggleChat}
              title="AI 助手 (Ctrl+J)"
            >
              <IconBot size={16} />
            </button>
            <button
              className={`${sidebarStyles.iconBtn} ${ptyOpen ? sidebarStyles.iconBtnActive : ''}`}
              onClick={togglePty}
              title="Claude Terminal (Ctrl+Shift+J)"
            >
              <IconTerminal size={16} />
            </button>
            <button
              className={sidebarStyles.iconBtn}
              onClick={() => window.open('/admin', '_blank', 'width=1200,height=800')}
              title={t('project.global_manage')}
            >
              <IconLayoutGrid size={16} />
            </button>
          </>
        }
      />
      <div className={shellStyles.main}>
        <div className={shellStyles.content}>
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </div>
        <Panel>
          <div className={shellStyles.panelPlaceholder}>
            {t('layout.panel_placeholder')}
          </div>
        </Panel>
      </div>
    </AppShell>
    <NotificationPanel />
    <CommandMenu open={cmdOpen} onClose={handleCmdClose} />
    <FloatingAssistant />
    <PtyAssistant />
    <PrdSidebar />
  </>
  )
}
