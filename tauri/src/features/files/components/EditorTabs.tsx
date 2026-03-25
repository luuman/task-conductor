import { useCallback } from 'react'
import { useEditorTabs } from '../hooks/useEditorTabs'
import { IconX } from '../../../ui/icon'
import styles from './editor-tabs.module.css'

export function EditorTabs() {
  const { openTabs, activeTabPath, unsavedPaths, setActiveTab, closeTab } = useEditorTabs()

  const handleClose = useCallback((e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    closeTab(path)
  }, [closeTab])

  if (openTabs.length === 0) return null

  return (
    <div className={styles.tabs}>
      {openTabs.map((tab) => {
        const isActive = tab.path === activeTabPath
        const isUnsaved = unsavedPaths.includes(tab.path)

        return (
          <button
            key={tab.path}
            className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.path)}
            title={tab.path}
          >
            {isUnsaved && <span className={styles.unsavedDot} />}
            <span className={styles.tabName}>{tab.name}</span>
            <span
              className={styles.closeBtn}
              onClick={(e) => handleClose(e, tab.path)}
            >
              ×
            </span>
          </button>
        )
      })}
    </div>
  )
}
