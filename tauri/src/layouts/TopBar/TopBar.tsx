import type { ReactNode } from 'react'
import { useShell } from '../AppShell/ShellContext'
import { IconChevronLeft, IconChevronRight, IconSearch, IconBell, IconSettings, IconMessage, IconUser } from '../../ui/icon'
import styles from './top-bar.module.css'

export interface BreadcrumbItem {
  label: string
  href?: string
  icon?: ReactNode
}

export interface TopBarProps {
  logo?: ReactNode
  logoIcon?: ReactNode
  breadcrumb?: BreadcrumbItem[]
  breadcrumbPrefix?: ReactNode
  actions?: ReactNode
  userName?: string
  userRole?: string
  unreadCount?: number
  onSearchClick?: () => void
  onSettingsClick?: () => void
  onMessageClick?: () => void
  onNotificationClick?: () => void
}

export function TopBar({ logo, logoIcon, breadcrumb, breadcrumbPrefix, actions, userName, userRole, unreadCount, onSearchClick, onSettingsClick, onMessageClick, onNotificationClick }: TopBarProps) {
  const { sidebarCollapsed, toggleSidebar } = useShell()

  return (
    <header className={styles.topbar}>
      <div className={`${styles.left} ${sidebarCollapsed ? styles.leftCollapsed : ''}`}>
        {!sidebarCollapsed && (
          <div className={styles.logoWrap}>
            {logoIcon && <span className={styles.logoIcon}>{logoIcon}</span>}
            {logo && <span className={styles.logoText}>{logo}</span>}
          </div>
        )}
        <button
          className={styles.toggleBtn}
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <IconChevronRight size={16} /> : <IconChevronLeft size={16} />}
        </button>
      </div>

      <div className={styles.center}>
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className={styles.breadcrumb}>
            {breadcrumb.map((item, i) => (
              <span key={i} className={styles.breadcrumbItem}>
                {i > 0 && <span className={styles.breadcrumbSep}>/</span>}
                {item.icon}
                <span>{item.label}</span>
              </span>
            ))}
          </nav>
        )}
      </div>

      <div className={styles.right}>
        {actions}
        <button className={styles.iconBtn} aria-label="Search" onClick={onSearchClick}>
          <IconSearch size={18} />
        </button>
        <button className={styles.iconBtn} aria-label="Settings" onClick={onSettingsClick}>
          <IconSettings size={18} />
        </button>
        <button className={styles.iconBtn} aria-label="Messages" onClick={onMessageClick}>
          <IconMessage size={18} />
        </button>
        <button className={`${styles.iconBtn} ${styles.bellWrap}`} aria-label="Notifications" onClick={onNotificationClick}>
          <IconBell size={18} />
          {(unreadCount ?? 0) > 0 && (
            <span className={styles.bellBadge}>
              {(unreadCount ?? 0) > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
        <div className={styles.userSection}>
          <div className={styles.avatar}>
            <IconUser size={16} />
          </div>
          {userName && (
            <div className={styles.userInfo}>
              <span className={styles.userName}>{userName}</span>
              {userRole && <span className={styles.userRole}>{userRole}</span>}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
