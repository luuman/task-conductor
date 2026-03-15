import { createContext, useContext } from 'react'

export interface ShellContextValue {
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
  togglePanel: () => void
  panelHeight: number
  setPanelHeight: (height: number) => void
}

export const ShellContext = createContext<ShellContextValue | null>(null)

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext)
  if (!ctx) {
    throw new Error('useShell must be used within an AppShell')
  }
  return ctx
}
