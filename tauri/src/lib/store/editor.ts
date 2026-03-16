import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EditorTab } from '../api/types'

interface EditorState {
  openTabs: EditorTab[]
  activeTabPath: string | null
  unsavedPaths: string[]
  explorerWidth: number

  openFile: (tab: EditorTab) => void
  closeTab: (path: string) => void
  setActiveTab: (path: string) => void
  markUnsaved: (path: string) => void
  markSaved: (path: string) => void
  hasUnsaved: () => boolean
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      openTabs: [],
      activeTabPath: null,
      unsavedPaths: [],
      explorerWidth: 220,

      openFile: (tab) => {
        const { openTabs } = get()
        const exists = openTabs.some((t) => t.path === tab.path)
        if (!exists) {
          set({ openTabs: [...openTabs, tab], activeTabPath: tab.path })
        } else {
          set({ activeTabPath: tab.path })
        }
      },

      closeTab: (path) => {
        const { openTabs, activeTabPath, unsavedPaths } = get()
        const filtered = openTabs.filter((t) => t.path !== path)
        const newActive =
          activeTabPath === path
            ? filtered[filtered.length - 1]?.path ?? null
            : activeTabPath
        set({
          openTabs: filtered,
          activeTabPath: newActive,
          unsavedPaths: unsavedPaths.filter((p) => p !== path),
        })
      },

      setActiveTab: (path) => set({ activeTabPath: path }),

      markUnsaved: (path) => {
        const { unsavedPaths } = get()
        if (!unsavedPaths.includes(path)) {
          set({ unsavedPaths: [...unsavedPaths, path] })
        }
      },

      markSaved: (path) => {
        set({ unsavedPaths: get().unsavedPaths.filter((p) => p !== path) })
      },

      hasUnsaved: () => get().unsavedPaths.length > 0,
    }),
    {
      name: 'tc-editor',
      partialize: (state) => ({
        openTabs: state.openTabs,
        activeTabPath: state.activeTabPath,
        explorerWidth: state.explorerWidth,
      }),
    }
  )
)
