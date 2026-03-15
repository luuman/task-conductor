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
  breadcrumb?: BreadcrumbItem[]
  actions?: ReactNode
}

export function TopBar({ logo, breadcrumb, actions }: TopBarProps) {
  const { sidebarCollapsed, toggleSidebar } = useShell()

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        {logo && <span className={styles.logo}>{logo}</span>}
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
        <button className={styles.iconBtn} aria-label="Search">
          <IconSearch size={16} />
        </button>
        <button className={styles.iconBtn} aria-label="Settings">
          <IconSettings size={16} />
        </button>
        <button className={styles.iconBtn} aria-label="Messages">
          <IconMessage size={16} />
        </button>
        <button className={styles.iconBtn} aria-label="Notifications">
          <IconBell size={16} />
        </button>
        <div className={styles.avatar}>
          <IconUser size={14} />
        </div>
      </div>
    </header>
  )
}
