import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../../../lib/api'
import type { ClaudeConfig, ClaudeOverview, DisabledItem } from '../../../../lib/api/types'
import { SectionHeader } from '../shared'
import { EmptyState } from '../../../../ui/empty-state'
import { IconTrash } from '../../../../ui/icon'
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
  const { t } = useTranslation()
  const [items, setItems] = useState<DisabledItem[]>([])

  const fetchItems = useCallback(async () => {
    try {
      const data = await api.claudeConfig.getDisabledItems()
      setItems(data)
    } catch {
      showToast(t('claudeConfig.trash.restoreFailed'))
    }
  }, [showToast, t])

  useEffect(() => { fetchItems() }, [fetchItems])

  const handleRestore = useCallback(async (type: string, name: string) => {
    try {
      await api.claudeConfig.restoreDisabledItem(type, name)
      await fetchItems()
    } catch {
      showToast(t('claudeConfig.trash.restoreFailed'))
    }
  }, [fetchItems, showToast, t])

  const handleDelete = useCallback(async (type: string, name: string) => {
    if (!confirm(t('claudeConfig.trash.confirmDeleteAll'))) return
    try {
      await api.claudeConfig.deleteDisabledItem(type, name)
      await fetchItems()
    } catch {
      showToast(t('claudeConfig.trash.deleteFailed'))
    }
  }, [fetchItems, showToast, t])

  const handleRestoreAll = useCallback(async () => {
    try {
      for (const item of items) {
        await api.claudeConfig.restoreDisabledItem(item.type, item.name)
      }
      await fetchItems()
    } catch {
      showToast(t('claudeConfig.trash.restoreFailed'))
    }
  }, [items, fetchItems, showToast, t])

  const handleDeleteAll = useCallback(async () => {
    if (!confirm(t('claudeConfig.trash.confirmDeleteAll'))) return
    try {
      for (const item of items) {
        await api.claudeConfig.deleteDisabledItem(item.type, item.name)
      }
      await fetchItems()
    } catch {
      showToast(t('claudeConfig.trash.deleteFailed'))
    }
  }, [items, fetchItems, showToast, t])

  return (
    <div className={styles.sectionWrap}>
      <SectionHeader
        icon="&#x1F5D1;&#xFE0F;"
        title={t('claudeConfig.trash.title')}
        right={
          items.length > 0 ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className={styles.btnGhost} onClick={handleRestoreAll} type="button">
                {t('claudeConfig.trash.restoreAll')}
              </button>
              <button className={styles.btnDanger} onClick={handleDeleteAll} type="button">
                {t('claudeConfig.trash.deleteAll')}
              </button>
            </div>
          ) : undefined
        }
      />

      {items.length === 0 ? (
        <EmptyState icon={<IconTrash size={24} />} title={t('claudeConfig.trash.empty')} />
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
                {t('claudeConfig.trash.restore')}
              </button>
              <button
                className={styles.btnDanger}
                onClick={() => handleDelete(item.type, item.name)}
                type="button"
              >
                {t('claudeConfig.trash.deletePermanent')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SecTrash
