import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell, TopBar, Sidebar, Panel } from '../layouts'
import { IconFileText, IconPlus, IconLayoutGrid, IconLogo } from '../ui/icon'
import sidebarStyles from '../layouts/Sidebar/sidebar.module.css'
import shellStyles from '../layouts/AppShell/app-shell.module.css'

export function Layout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  const activeKey = location.pathname.split('/').pop() ?? ''

  const workspaceItems = [
    { key: 'tasks', label: t('layout.tasks'), icon: <IconFileText size={16} /> },
  ]

  return (
    <AppShell>
      <TopBar
        logo="TaskConductor"
        breadcrumb={[{ label: t('layout.workspace') }]}
        userName="User"
      />
      <Sidebar
        header={
          <>
            <span className={sidebarStyles.headerTitle}>{t('layout.pages')}</span>
            <button className={sidebarStyles.headerAction} aria-label={t('layout.new_page')}>
              <IconPlus size={14} />
            </button>
          </>
        }
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
