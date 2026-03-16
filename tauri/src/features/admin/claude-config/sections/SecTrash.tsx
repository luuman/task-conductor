import { useState, useEffect, useCallback } from 'react'
import { api } from '../../../../lib/api'
import type { ClaudeConfig, ClaudeOverview, DisabledItem } from '../../../../lib/api/types'
import { SectionHeader } from '../shared'
import styles from '../claude-config.module.css'

interface SectionProps {
  config: ClaudeConfig | null
  overview: ClaudeOverview | null
  onConfigUpdate: (c: ClaudeConfig) => void
  showToast: (msg: string) => void
}

const TYPE_TAG_CLASS: Record<string, string> = {
  agent: 'tagBlue',
  command: 'tagGreen',
  rule: 'tagYellow',
  skill: 'tagGray',
}

export function SecTrash({ showToast }: SectionProps) {
  const [items, setItems] = useState<DisabledItem[]>([])

  const fetchItems = useCallback(async () => {
    try {
      const data = await api.claudeConfig.getDisabledItems()
      setItems(data)
    } catch {
      showToast('Failed to load disabled items')
    }
  }, [showToast])

  useEffect(() => { fetchItems() }, [fetchItems])

  const handleRestore = useCallback(async (type: string, name: string) => {
    try {
      await api.claudeConfig.restoreDisabledItem(type, name)
      await fetchItems()
      showToast(`Restored ${name}`)
    } catch {
      showToast('Failed to restore item')
    }
  }, [fetchItems, showToast])

  const handleDelete = useCallback(async (type: string, name: string) => {
    if (!confirm(`Permanently delete "${name}"?`)) return
    try {
      await api.claudeConfig.deleteDisabledItem(type, name)
      await fetchItems()
      showToast(`Deleted ${name}`)
    } catch {
      showToast('Failed to delete item')
    }
  }, [fetchItems, showToast])

  const handleRestoreAll = useCallback(async () => {
    try {
      for (const item of items) {
        await api.claudeConfig.restoreDisabledItem(item.type, item.name)
      }
      await fetchItems()
      showToast('All items restored')
    } catch {
      showToast('Failed to restore all items')
    }
  }, [items, fetchItems, showToast])

  const handleDeleteAll = useCallback(async () => {
    if (!confirm('Permanently delete all disabled items?')) return
    try {
      for (const item of items) {
        await api.claudeConfig.deleteDisabledItem(item.type, item.name)
      }
      await fetchItems()
      showToast('All items deleted')
    } catch {
      showToast('Failed to delete all items')
    }
  }, [items, fetchItems, showToast])

  return (
    <div className={styles.sectionWrap}>
      <SectionHeader
        icon="🗑️"
        title="回收站"
        right={
          items.length > 0 ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className={styles.btnGhost} onClick={handleRestoreAll} type="button">
                Restore All
              </button>
              <button className={styles.btnDanger} onClick={handleDeleteAll} type="button">
                Delete All
              </button>
            </div>
          ) : undefined
        }
      />

      {items.length === 0 ? (
        <div className={styles.sectionPlaceholder}>回收站为空</div>
      ) : (
        <div className={styles.card}>
          {items.map((item) => (
            <div key={`${item.type}-${item.name}`} className={styles.listItem}>
              <span className={styles[TYPE_TAG_CLASS[item.type] ?? 'tagGray']}>
                {item.type}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span className={styles.listName}>{item.name}</span>
                <div
                  className={styles.listMeta}
                  style={{
                    fontFamily: "'Geist Mono', monospace",
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.file_path}
                </div>
              </div>
              <button
                className={styles.btnGhost}
                onClick={() => handleRestore(item.type, item.name)}
                type="button"
              >
                Restore
              </button>
              <button
                className={styles.btnDanger}
                onClick={() => handleDelete(item.type, item.name)}
                type="button"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
