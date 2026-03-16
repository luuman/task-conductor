import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'dark' | 'light' | 'system'

interface AppStore {
  theme: Theme
  sidebarCollapsed: boolean
  activeProjectId: string | null
  recentProjectIds: string[]
  setTheme(theme: Theme): void
  setSidebarCollapsed(collapsed: boolean): void
  setActiveProjectId(id: string | null): void
  clearActiveProject(): void
}

const MAX_RECENT = 10

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      sidebarCollapsed: false,
      activeProjectId: null,
      recentProjectIds: [],
      setTheme: (theme) => set({ theme }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setActiveProjectId: (id) => {
        if (!id) {
          set({ activeProjectId: null })
          return
        }
        const recent = get().recentProjectIds.filter((r) => r !== id)
        recent.unshift(id)
        set({
          activeProjectId: id,
          recentProjectIds: recent.slice(0, MAX_RECENT),
        })
      },
      clearActiveProject: () => set({ activeProjectId: null }),
    }),
    { name: 'tc-app-settings' }
  )
)
