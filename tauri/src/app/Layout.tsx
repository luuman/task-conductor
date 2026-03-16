import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell, TopBar, Sidebar, Panel } from '../layouts'
import { IconFileText, IconLayoutGrid, IconLogo, IconFolder } from '../ui/icon'
import { ProjectSwitcher } from '../components/ProjectSwitcher'
import { useAppStore } from '../lib/store/app'
import { useNotificationStore } from '../lib/store/notifications'
import { NotificationPanel } from '../components/NotificationPanel'
import { api } from '../lib/api'
import type { FileItem } from '../lib/api/types'
import sidebarStyles from '../layouts/Sidebar/sidebar.module.css'
import shellStyles from '../layouts/AppShell/app-shell.module.css'

export function Layout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { activeProjectId, clearActiveProject } = useAppStore()
  const togglePanel = useNotificationStore(s => s.togglePanel)
  const unreadCount = useNotificationStore(s => s.items.filter(n => !n.read).length)

  const [files, setFiles] = useState<FileItem[]>([])

  // 加载当前项目的文件列表
  useEffect(() => {
    if (!activeProjectId) return
    loadFiles()
  }, [activeProjectId])

  async function loadFiles() {
    if (!activeProjectId) return
    try {
      const result = await api.getProjectFiles(Number(activeProjectId))
      setFiles(result.items)
    } catch {
      setFiles([])
    }
  }

  // 侧边栏导航项 = 项目根目录的文件/文件夹
  const sidebarItems = files.map((f) => ({
    key: f.path,
    label: f.name,
    icon: f.is_dir ? <IconFolder size={16} /> : <IconFileText size={16} />,
  }))

  // 从路径提取当前选中文件
  const pathParts = location.pathname.split('/')
  const activeKey = pathParts[1] === 'file' ? decodeURIComponent(pathParts.slice(2).join('/')) : ''

  // 面包屑
  const activeFile = files.find((f) => f.path === activeKey)
  const breadcrumb = activeFile ? [{ label: activeFile.name }] : []

  return (
  <>
    <AppShell>
      <TopBar
        logoIcon={<IconLogo size={22} />}
        logo="TaskConductor"
        breadcrumb={breadcrumb}
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
        onSelect={(key) => navigate(`/file/${encodeURIComponent(key)}`)}
        footer={
          <>
            <button
              className={sidebarStyles.footerBtn}
              onClick={clearActiveProject}
            >
              <IconLayoutGrid size={16} />
              <span className={sidebarStyles.footerBtnLabel}>{t('project.switch')}</span>
            </button>
          </>
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
