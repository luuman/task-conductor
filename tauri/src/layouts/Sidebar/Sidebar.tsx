import type { ReactNode } from 'react'
import styles from './sidebar.module.css'

export interface SidebarItem {
  key: string
  label: string
  icon?: ReactNode
}

export interface SidebarProps {
  items: SidebarItem[]
  footer?: ReactNode
  activeKey?: string
  onSelect?: (key: string) => void
  logoIcon?: ReactNode
  notificationCount?: number
  onNotificationClick?: () => void
}

export function Sidebar({
  items,
  footer,
  activeKey,
  onSelect,
  logoIcon,
  notificationCount = 0,
  onNotificationClick,
}: SidebarProps) {
  return (
    <aside className={styles.sidebar}>
      {logoIcon && <div className={styles.logo}>{logoIcon}</div>}

      <nav className={styles.list}>
        {items.map((item) => {
          const isActive = item.key === activeKey
          return (
            <div
              key={item.key}
              className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
              onClick={() => onSelect?.(item.key)}
              role="button"
              tabIndex={0}
              title={item.label}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect?.(item.key)
                }
              }}
            >
              {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
            </div>
          )
        })}
      </nav>

      <div className={styles.divider} />
      <div className={styles.bottom}>
        {onNotificationClick && (
          <button
            className={styles.iconBtn}
            onClick={onNotificationClick}
            title="通知"
          >
            <span className={styles.bellWrap}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 01-3.46 0"/>
              </svg>
              {notificationCount > 0 && (
                <span className={styles.badge}>
                  {notificationCount > 99 ? '99+' : notificationCount}
                </span>
              )}
            </span>
          </button>
        )}
        {footer}
      </div>
    </aside>
  )
}
