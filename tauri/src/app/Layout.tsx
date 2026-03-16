import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell, TopBar, Sidebar, Panel } from '../layouts'
import { IconFileText, IconLayoutGrid, IconLogo } from '../ui/icon'
import sidebarStyles from '../layouts/Sidebar/sidebar.module.css'
import shellStyles from '../layouts/AppShell/app-shell.module.css'

export function Layout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  const activeKey = location.pathname.split('/').pop() ?? ''

  // 当前项目的内容列表（后续从 API 动态加载）
  const projectItems = [
    { key: 'tasks/1', label: '需求分析', icon: <IconFileText size={16} /> },
    { key: 'tasks/2', label: '技术方案', icon: <IconFileText size={16} /> },
    { key: 'tasks/3', label: 'UI 设计稿', icon: <IconFileText size={16} /> },
    { key: 'tasks/4', label: '开发计划', icon: <IconFileText size={16} /> },
    { key: 'tasks/5', label: '测试用例', icon: <IconFileText size={16} /> },
  ]

  return (
    <AppShell>
      <TopBar
        logoIcon={<IconLogo size={22} />}
        logo="TaskConductor"
        breadcrumb={[{ label: 'Demo Project' }]}
        userName="User"
      />
      <Sidebar
        items={projectItems}
        activeKey={activeKey}
        onSelect={(key) => navigate(`/${key}`)}
        footer={
          <button className={sidebarStyles.footerBtn} onClick={() => navigate('/admin')}>
            <IconLayoutGrid size={16} />
            <span className={sidebarStyles.footerBtnLabel}>{t('layout.admin_console')}</span>
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
  )
}
