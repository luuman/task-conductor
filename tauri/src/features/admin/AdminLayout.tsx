import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell, TopBar, Sidebar } from '../../layouts'
import { IconLogo, IconMonitor, IconSettings, IconSearch } from '../../ui/icon'
import { useNotificationStore } from '../../lib/store/notifications'
import { NotificationPanel } from '../../components/NotificationPanel'
import sidebarStyles from '../../layouts/Sidebar/sidebar.module.css'
import shellStyles from '../../layouts/AppShell/app-shell.module.css'

const NAV_ITEMS = [
  { key: '/admin',              icon: '📊', i18n: 'admin.nav.dashboard' },
  { key: '/admin/claude-config', icon: '🤖', i18n: 'admin.nav.claude_config' },
  { key: '/admin/settings',     icon: '⚙️', i18n: 'admin.nav.settings' },
  { key: '/admin/sessions',     icon: '📡', i18n: 'admin.nav.sessions' },
]

export default function AdminLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const togglePanel = useNotificationStore(s => s.togglePanel)
  const unreadCount = useNotificationStore(s => s.items.filter(n => !n.read).length)

  const activeKey = NAV_ITEMS.find(item => item.key === location.pathname)?.key
    ?? NAV_ITEMS[0].key

  const sidebarItems = NAV_ITEMS.map(item => ({
    key: item.key,
    label: t(item.i18n),
    icon: <span style={{ fontSize: 14 }}>{item.icon}</span>,
  }))

  return (
    <>
      <AppShell>
        <TopBar
          logoIcon={<IconLogo size={22} />}
          logo="TaskConductor"
          breadcrumb={[{ label: t('admin.title') }]}
          userName="User"
          onSearchClick={() => navigate('/admin/sessions')}
          onSettingsClick={() => navigate('/admin/settings')}
          unreadCount={unreadCount}
          onNotificationClick={togglePanel}
        />
        <Sidebar
          header={
            <span className={sidebarStyles.headerTitle}>{t('admin.title')}</span>
          }
          items={sidebarItems}
          activeKey={activeKey}
          onSelect={(key) => navigate(key)}
          footer={
            <button
              className={sidebarStyles.footerBtn}
              onClick={() => {
                if (window.opener) {
                  window.close()
                } else {
                  navigate('/')
                }
              }}
            >
              <IconMonitor size={16} />
              <span className={sidebarStyles.footerBtnLabel}>{t('admin.back_to_workspace')}</span>
            </button>
          }
        />
        <div className={shellStyles.main}>
          <div className={shellStyles.content}>
            <Outlet />
          </div>
        </div>
      </AppShell>
      <NotificationPanel />
    </>
  )
}
