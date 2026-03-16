import { useCallback, useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell, TopBar, Sidebar, Panel } from '../layouts'
import {
  IconLayoutGrid, IconLogo, IconFileText, IconMonitor,
  IconMessage, IconSettings, IconFolder, IconGitBranch,
} from '../ui/icon'
import { ProjectSwitcher } from '../components/ProjectSwitcher'
import { useNotificationStore } from '../lib/store/notifications'
import { NotificationPanel } from '../components/NotificationPanel'
import { CommandMenu } from '../components/CommandMenu'
import sidebarStyles from '../layouts/Sidebar/sidebar.module.css'
import shellStyles from '../layouts/AppShell/app-shell.module.css'

export function Layout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const togglePanel = useNotificationStore(s => s.togglePanel)
  const unreadCount = useNotificationStore(s => s.items.filter(n => !n.read).length)
  const [cmdOpen, setCmdOpen] = useState(false)

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
    { key: '/task-manager', label: t('layout.tasks'),     icon: <IconFileText size={16} /> },
    { key: '/sessions',    label: t('layout.sessions'),   icon: <IconMonitor size={16} /> },
    { key: '/chat',        label: t('layout.chat'),       icon: <IconMessage size={16} /> },
    { key: '/files',       label: t('layout.files'),      icon: <IconFolder size={16} /> },
    { key: '/git',         label: t('layout.git'),        icon: <IconGitBranch size={16} /> },
    { key: '/settings',    label: t('nav.settings'),      icon: <IconSettings size={16} /> },
  ]

  // 当前激活的导航项
  const activeKey = sidebarItems.find(
    (item) => item.key !== '/' && location.pathname.startsWith(item.key)
  )?.key ?? (location.pathname === '/' ? '/' : '')

  return (
  <>
    <AppShell>
      <TopBar
        logoIcon={<IconLogo size={22} />}
        logo="TaskConductor"
        breadcrumb={[]}
        breadcrumbPrefix={<ProjectSwitcher />}
        userName="User"
        onSearchClick={() => navigate('/sessions')}
        onSettingsClick={() => navigate('/settings')}
        onMessageClick={() => navigate('/chat')}
        unreadCount={unreadCount}
        onNotificationClick={togglePanel}
      />
      <Sidebar
        items={sidebarItems}
        activeKey={activeKey}
        onSelect={(key) => navigate(key)}
        footer={
          <button
            className={sidebarStyles.footerBtn}
            onClick={() => window.open('/admin', '_blank', 'width=1200,height=800')}
          >
            <IconLayoutGrid size={16} />
            <span className={sidebarStyles.footerBtnLabel}>{t('project.global_manage')}</span>
          </button>
        }
      />
      <div className={shellStyles.main}>
        <div className={shellStyles.content}>
          <Outlet />
        </div>
        <Panel>
          <div className={shellStyles.panelPlaceholder}>
            {t('layout.panel_placeholder')}
          </div>
        </Panel>
      </div>
    </AppShell>
    <NotificationPanel />
  </>
  )
}
