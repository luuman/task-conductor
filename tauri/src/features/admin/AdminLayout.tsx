import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { AppShell, TopBar, Sidebar } from '../../layouts'
import { IconLogo, IconLayoutGrid, IconSettings, IconSearch, IconMonitor, IconArrowLeft } from '../../ui/icon'
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
  ...(import.meta.env.DEV ? [
    { key: '/admin/dev', icon: <IconLayoutGrid size={18} />, i18n: 'admin.nav.dev_tools', shortcut: `${modKey}5`, devOnly: true },
  ] : []),
]

export default function AdminLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const togglePanel = useNotificationStore(s => s.togglePanel)
  const unreadCount = useNotificationStore(s => s.items.filter(n => !n.read).length)

  const [cmdOpen, setCmdOpen] = useState(false)
  const handleCmdClose = useCallback(() => setCmdOpen(false), [])
  const [sessionCount, setSessionCount] = useState<number | null>(null)

  // Fetch session count for badge
  useEffect(() => {
    let cancelled = false
    const fetchCount = async () => {
      try {
        const token = localStorage.getItem('tc_token')
        const res = await fetch('/api/sessions', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (res.ok && !cancelled) {
          const data = await res.json()
          if (Array.isArray(data)) {
            setSessionCount(data.length)
          }
        }
      } catch {
        // ignore
      }
    }
    fetchCount()
    return () => { cancelled = true }
  }, [])

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
    shortcut: item.shortcut,
    badge: item.key === '/admin/sessions' && sessionCount != null && sessionCount > 0
      ? String(sessionCount)
      : undefined,
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
            <>
              {/* User info */}
              <div className={sidebarStyles.userInfo}>
                <div className={sidebarStyles.userAvatar}>U</div>
                <div className={sidebarStyles.userMeta}>
                  <span className={sidebarStyles.userName}>User</span>
                  <span className={sidebarStyles.userRole}>Admin</span>
                </div>
              </div>
              {/* Back button */}
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
                <IconArrowLeft size={16} />
                <span className={sidebarStyles.footerBtnLabel}>{t('admin.back_to_workspace')}</span>
              </button>
            </>
          }
        />
        <div className={shellStyles.main}>
          <div className={shellStyles.content}>
            <Outlet />
          </div>
        </div>
      </AppShell>
      <NotificationPanel />
      <CommandMenu open={cmdOpen} onClose={handleCmdClose} />
    </>
  )
}
