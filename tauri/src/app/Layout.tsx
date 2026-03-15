import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { AppShell, TopBar, Sidebar, Panel } from '../layouts'
import { IconFileText, IconPlus, IconLayoutGrid } from '../ui/icon'
import sidebarStyles from '../layouts/Sidebar/sidebar.module.css'
import shellStyles from '../layouts/AppShell/app-shell.module.css'

const WORKSPACE_ITEMS = [
  { key: 'tasks', label: 'Tasks', icon: <IconFileText size={16} /> },
]

export function Layout() {
  const navigate = useNavigate()
  const location = useLocation()

  const activeKey = location.pathname.split('/').pop() ?? ''

  return (
    <AppShell>
      <TopBar
        logo="TaskConductor"
        breadcrumb={[{ label: 'Workspace' }]}
      />
      <Sidebar
        header={
          <>
            <span className={sidebarStyles.headerTitle}>Pages</span>
            <button className={sidebarStyles.headerAction} aria-label="New page">
              <IconPlus size={14} />
            </button>
          </>
        }
        items={WORKSPACE_ITEMS}
        activeKey={activeKey}
        onSelect={(key) => navigate(`/${key}`)}
        footer={
          <button className={sidebarStyles.footerBtn} onClick={() => navigate('/admin')}>
            <IconLayoutGrid size={16} />
            <span>Admin Console</span>
          </button>
        }
      />
      <div className={shellStyles.main}>
        <div className={shellStyles.content}>
          <Outlet />
        </div>
        <Panel>
          <div className={shellStyles.panelPlaceholder}>
            Panel content (logs, terminal)
          </div>
        </Panel>
      </div>
    </AppShell>
  )
}
