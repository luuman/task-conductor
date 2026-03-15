import { useState, useCallback, type ReactNode } from 'react'
import { ShellContext, type ShellContextValue } from './ShellContext'
import styles from './app-shell.module.css'

export interface AppShellProps {
  children: ReactNode
}

const DEFAULT_PANEL_HEIGHT = 200

export function AppShell({ children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelHeight, setPanelHeight] = useState(DEFAULT_PANEL_HEIGHT)

  const toggleSidebar = useCallback(() => setSidebarCollapsed((v) => !v), [])
  const togglePanel = useCallback(() => setPanelOpen((v) => !v), [])

  const value: ShellContextValue = {
    sidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebar,
    panelOpen,
    setPanelOpen,
    togglePanel,
    panelHeight,
    setPanelHeight,
  }

  return (
    <ShellContext.Provider value={value}>
      <div
        className={styles.shell}
        data-sidebar-collapsed={sidebarCollapsed}
      >
        {children}
      </div>
    </ShellContext.Provider>
  )
}
