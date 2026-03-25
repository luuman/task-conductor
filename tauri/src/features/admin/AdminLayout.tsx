import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { AppShell, Sidebar } from '../../layouts'
import { IconLogo, IconLayoutGrid, IconSettings, IconSearch, IconMonitor, IconArrowLeft, IconGitBranch, IconActivity } from '../../ui/icon'
import { useTheme } from '../../ui/theme/useTheme'
import { useNotificationStore } from '../../lib/store/notifications'
import { NotificationPanel } from '../../components/NotificationPanel'
import { CommandMenu } from '../../components/CommandMenu'
import sidebarStyles from '../../layouts/Sidebar/sidebar.module.css'
import shellStyles from '../../layouts/AppShell/app-shell.module.css'

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent)
const modKey = isMac ? '\u2318' : 'Ctrl+'

const NAV_ITEMS: Array<{ key: string; icon: React.ReactNode; i18n: string; shortcut: string; devOnly?: boolean }> = [
  { key: '/admin',              icon: <IconLayoutGrid size={18} />, i18n: 'admin.nav.dashboard',     shortcut: `${modKey}1` },
  { key: '/admin/claude-config', icon: <IconSettings size={18} />,  i18n: 'admin.nav.claude_config', shortcut: `${modKey}2` },
  { key: '/admin/settings',     icon: <IconMonitor size={18} />,    i18n: 'admin.nav.settings',      shortcut: `${modKey}3` },
  { key: '/admin/sessions',     icon: <IconSearch size={18} />,     i18n: 'admin.nav.sessions',      shortcut: `${modKey}4` },
  { key: '/admin/mindmap',      icon: <IconGitBranch size={18} />,  i18n: 'admin.nav.mindmap',       shortcut: `${modKey}5` },
  { key: '/admin/server',      icon: <IconActivity size={18} />,   i18n: 'admin.nav.server',        shortcut: `${modKey}6` },
  ...(import.meta.env.DEV ? [
    { key: '/admin/dev', icon: <IconLayoutGrid size={18} />, i18n: 'admin.nav.dev_tools', shortcut: `${modKey}7`, devOnly: true },
  ] : []),
]

export default function AdminLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { mode, setMode } = useTheme()
  const togglePanel = useNotificationStore(s => s.togglePanel)
  const unreadCount = useNotificationStore(s => s.items.filter(n => !n.read).length)

  const [cmdOpen, setCmdOpen] = useState(false)
  const handleCmdClose = useCallback(() => setCmdOpen(false), [])
  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (!mod) return
      if (e.key === 'k') {
        e.preventDefault()
        setCmdOpen(prev => !prev)
        return
      }
      const idx = parseInt(e.key, 10)
      if (idx >= 1 && idx <= NAV_ITEMS.length) {
        e.preventDefault()
        navigate(NAV_ITEMS[idx - 1].key)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  const activeKey = NAV_ITEMS.find(item => item.key === location.pathname)?.key
    ?? NAV_ITEMS[0].key

  const sidebarItems = NAV_ITEMS.map(item => ({
    key: item.key,
    label: t(item.i18n),
    icon: item.icon,
  }))

  return (
    <>
      <AppShell>
        <Sidebar
          items={sidebarItems}
          activeKey={activeKey}
          onSelect={(key) => navigate(key)}
          logoIcon={<IconLogo size={18} />}
          notificationCount={unreadCount}
          onNotificationClick={togglePanel}
          footer={
            <button
              className={sidebarStyles.iconBtn}
              onClick={() => { if (window.opener) { window.close() } else { navigate('/') } }}
              title={t('admin.back_to_workspace')}
            >
              <IconArrowLeft size={16} />
            </button>
          }
        />
        <div className={shellStyles.main}>
          <div className={shellStyles.content}>
            <Suspense fallback={null}>
              <Outlet />
            </Suspense>
          </div>
        </div>
      </AppShell>
      <NotificationPanel />
      <CommandMenu open={cmdOpen} onClose={handleCmdClose} />
    </>
  )
}
