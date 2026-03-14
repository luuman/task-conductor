import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'dark' | 'light' | 'system'

interface AppStore {
  theme: Theme
  sidebarCollapsed: boolean
  activeProjectId: string | null
  setTheme(theme: Theme): void
  setSidebarCollapsed(collapsed: boolean): void
  setActiveProjectId(id: string | null): void
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      theme: 'dark',
      sidebarCollapsed: false,
      activeProjectId: null,
      setTheme: (theme) => set({ theme }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setActiveProjectId: (id) => set({ activeProjectId: id }),
    }),
    { name: 'tc-app-settings' }
  )
)
