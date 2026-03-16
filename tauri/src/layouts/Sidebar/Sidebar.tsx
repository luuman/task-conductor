import type { ReactNode } from 'react'
import { useShell } from '../AppShell/ShellContext'
import styles from './sidebar.module.css'

export interface SidebarItem {
  key: string
  label: string
  icon?: ReactNode
  badge?: ReactNode
  shortcut?: string
}

export interface SidebarProps {
  header?: ReactNode
  items: SidebarItem[]
  footer?: ReactNode
  activeKey?: string
  onSelect?: (key: string) => void
}

export function Sidebar({ header, items, footer, activeKey, onSelect }: SidebarProps) {
  const { sidebarCollapsed } = useShell()

  return (
    <aside className={`${styles.sidebar} ${sidebarCollapsed ? styles.collapsed : ''}`}>
      {header && <div className={styles.header}>{header}</div>}

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
              title={sidebarCollapsed ? item.label : undefined}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect?.(item.key)
                }
              }}
            >
              {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
              <span className={styles.itemLabel}>{item.label}</span>
            </div>
          )
        })}
      </nav>

      {footer && <div className={styles.footer}>{footer}</div>}
    </aside>
  )
}
