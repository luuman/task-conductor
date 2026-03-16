import { useEditorStore } from '../../../lib/store/editor'

export function useEditorTabs() {
  const openTabs = useEditorStore((s) => s.openTabs)
  const activeTabPath = useEditorStore((s) => s.activeTabPath)
  const unsavedPaths = useEditorStore((s) => s.unsavedPaths)
  const openFile = useEditorStore((s) => s.openFile)
  const closeTab = useEditorStore((s) => s.closeTab)
  const setActiveTab = useEditorStore((s) => s.setActiveTab)
  const markUnsaved = useEditorStore((s) => s.markUnsaved)
  const markSaved = useEditorStore((s) => s.markSaved)
  const hasUnsaved = useEditorStore((s) => s.hasUnsaved)

  return {
    openTabs,
    activeTabPath,
    unsavedPaths,
    openFile,
    closeTab,
    setActiveTab,
    markUnsaved,
    markSaved,
    hasUnsaved,
    isUnsaved: (path: string) => unsavedPaths.includes(path),
    activeTab: openTabs.find((t) => t.path === activeTabPath) ?? null,
  }
}
