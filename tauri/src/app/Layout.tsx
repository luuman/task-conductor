import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell, TopBar, Sidebar, Panel } from '../layouts'
import { IconFileText, IconLayoutGrid, IconLogo, IconMonitor, IconMessage, IconFolder, IconGitBranch } from '../ui/icon'
import sidebarStyles from '../layouts/Sidebar/sidebar.module.css'
import shellStyles from '../layouts/AppShell/app-shell.module.css'

export function Layout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  const activeKey = location.pathname.split('/').pop() ?? ''

  const workspaceItems = [
    { key: 'task-manager', label: t('layout.tasks'), icon: <IconFileText size={16} /> },
    { key: 'sessions', label: t('layout.sessions'), icon: <IconMonitor size={16} /> },
    { key: 'chat', label: t('layout.chat'), icon: <IconMessage size={16} /> },
    { key: 'files', label: t('layout.files'), icon: <IconFolder size={16} /> },
    { key: 'git', label: t('layout.git'), icon: <IconGitBranch size={16} /> },
  ]

  return (
    <AppShell>
      <TopBar
        logoIcon={<IconLogo size={22} />}
        logo="TaskConductor"
        breadcrumb={[{ label: t('layout.workspace') }]}
        userName="User"
      />
      <Sidebar
        items={workspaceItems}
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
