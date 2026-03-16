import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell, TopBar, Sidebar, Panel } from '../layouts'
import { IconFileText, IconLayoutGrid, IconLogo } from '../ui/icon'
import { useAppStore } from '../lib/store/app'
import { useNotificationStore } from '../lib/store/notifications'
import { NotificationPanel } from '../components/NotificationPanel'
import { api } from '../lib/api'
import type { Task } from '../lib/api/types'
import sidebarStyles from '../layouts/Sidebar/sidebar.module.css'
import shellStyles from '../layouts/AppShell/app-shell.module.css'

export function Layout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { activeProjectId, clearActiveProject } = useAppStore()
  const togglePanel = useNotificationStore(s => s.togglePanel)

  const [tasks, setTasks] = useState<Task[]>([])
  const [projectName, setProjectName] = useState('')

  // 加载当前项目的任务列表
  useEffect(() => {
    if (!activeProjectId) return
    loadProjectData()
  }, [activeProjectId])

  async function loadProjectData() {
    if (!activeProjectId) return
    try {
      const projects = await api.getProjects()
      const project = projects.find((p) => String(p.id) === activeProjectId)
      if (project) {
        setProjectName(project.name)
        const taskList = await api.getTasks(project.id)
        setTasks(taskList)
      }
    } catch {
      // 静默失败，显示空列表
    }
  }

  // 侧边栏导航项 = 当前项目的任务
  const sidebarItems = tasks.map((task) => ({
    key: String(task.id),
    label: task.title,
    icon: <IconFileText size={16} />,
  }))

  // 从路径中提取当前 task id
  const pathParts = location.pathname.split('/')
  const activeKey = pathParts[1] === 'tasks' ? pathParts[2] ?? '' : ''

  // 面包屑
  const activeTask = tasks.find((t) => String(t.id) === activeKey)
  const breadcrumb = [
    { label: projectName || t('layout.workspace') },
    ...(activeTask ? [{ label: activeTask.title }] : []),
  ]

  return (
    <AppShell>
      <TopBar
        logoIcon={<IconLogo size={22} />}
        logo="TaskConductor"
        breadcrumb={breadcrumb}
        userName="User"
        onSearchClick={() => navigate('/sessions')}
        onSettingsClick={() => navigate('/settings')}
        onMessageClick={() => navigate('/chat')}
        onNotificationClick={togglePanel}
      />
      <Sidebar
        items={sidebarItems}
        activeKey={activeKey}
        onSelect={(key) => navigate(`/tasks/${key}`)}
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
