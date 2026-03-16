import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell, TopBar, Sidebar, Panel } from '../layouts'
import { IconLayoutGrid, IconLogo } from '../ui/icon'
import { ProjectSwitcher } from '../components/ProjectSwitcher'
import { useAppStore } from '../lib/store/app'
import { useNotificationStore } from '../lib/store/notifications'
import { NotificationPanel } from '../components/NotificationPanel'
import { api } from '../lib/api'
import type { Task } from '../lib/api/types'
import sidebarStyles from '../layouts/Sidebar/sidebar.module.css'
import shellStyles from '../layouts/AppShell/app-shell.module.css'

const STAGE_ICONS: Record<string, string> = {
  input: '📋',
  analysis: '🔍',
  prd: '📄',
  ui: '🎨',
  plan: '📐',
  dev: '⚡',
  test: '🧪',
  deploy: '🚀',
  monitor: '📊',
  done: '✅',
}

export function Layout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { activeProjectId } = useAppStore()
  const togglePanel = useNotificationStore(s => s.togglePanel)
  const unreadCount = useNotificationStore(s => s.items.filter(n => !n.read).length)

  const [tasks, setTasks] = useState<Task[]>([])

  useEffect(() => {
    if (!activeProjectId) return
    loadTasks()
  }, [activeProjectId])

  async function loadTasks() {
    if (!activeProjectId) return
    try {
      const taskList = await api.getTasks(Number(activeProjectId))
      setTasks(taskList)
    } catch {
      setTasks([])
    }
  }

  // 侧边栏 = 项目的需求/任务列表，带阶段图标
  const sidebarItems = tasks.map((task) => ({
    key: String(task.id),
    label: task.title,
    icon: <span style={{ fontSize: 14 }}>{STAGE_ICONS[task.current_stage] ?? '📋'}</span>,
  }))

  // 从路径中提取当前 task id
  const pathParts = location.pathname.split('/')
  const activeKey = pathParts[1] === 'task' ? pathParts[2] ?? '' : ''

  // 面包屑
  const activeTask = tasks.find((task) => String(task.id) === activeKey)
  const breadcrumb = activeTask ? [{ label: activeTask.title }] : []

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
        onSelect={(key) => navigate(`/task/${key}`)}
        footer={
          <button
            className={sidebarStyles.footerBtn}
            onClick={() => navigate('/admin')}
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
