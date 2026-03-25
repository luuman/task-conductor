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
  mode?: 'dark' | 'light'
  onModeToggle?: () => void
}

export function Sidebar({
  items,
  footer,
  activeKey,
  onSelect,
  logoIcon,
  notificationCount = 0,
  onNotificationClick,
  mode = 'dark',
  onModeToggle,
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
        {onModeToggle && (
          <button
            className={styles.iconBtn}
            onClick={onModeToggle}
            title={mode === 'dark' ? '切换亮色模式' : '切换暗色模式'}
          >
            {mode === 'dark' ? (
              /* Sun icon */
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4"/>
                <line x1="12" y1="2" x2="12" y2="4"/>
                <line x1="12" y1="20" x2="12" y2="22"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="2" y1="12" x2="4" y2="12"/>
                <line x1="20" y1="12" x2="22" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              /* Moon icon */
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
              </svg>
            )}
          </button>
        )}
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
