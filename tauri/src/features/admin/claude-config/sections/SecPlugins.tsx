import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../../../lib/api'
import type { ClaudeConfig, ClaudeOverview } from '../../../../lib/api/types'
import { Toggle } from '../../../../ui/toggle'
import { SectionHeader } from '../shared'
import { EmptyState } from '../../../../ui/empty-state'
import { IconBlocks } from '../../../../ui/icon'
import styles from '../claude-config.module.css'

interface SectionProps {
  config: ClaudeConfig | null
  overview: ClaudeOverview | null
  onConfigUpdate: (c: ClaudeConfig) => void
  showToast: (msg: string) => void
}

export function SecPlugins({ config, overview, onConfigUpdate, showToast }: SectionProps) {
  const { t } = useTranslation()
  const plugins = config?.enabled_plugins ?? {}
  const pluginIds = Object.keys(plugins)

  const installedMap = new Map(
    (overview?.installed_plugins ?? []).map((p) => [p.plugin_id, p])
  )

  const handleToggle = useCallback(async (id: string, enabled: boolean) => {
    try {
      const result = await api.claudeConfig.updatePlugin(id, enabled)
      onConfigUpdate(result)
    } catch {
      showToast(t('claudeConfig.plugins.toggleFailed'))
    }
  }, [onConfigUpdate, showToast, t])

  const handleDelete = useCallback(async (id: string) => {
    try {
      const result = await api.claudeConfig.deletePlugin(id)
      onConfigUpdate(result)
    } catch {
      showToast(t('claudeConfig.plugins.deleteFailed'))
    }
  }, [onConfigUpdate, showToast, t])

  return (
    <div className={styles.sectionWrap}>
      <SectionHeader icon="&#x1F9E9;" title={t('claudeConfig.plugins.title')} />

      {pluginIds.length === 0 ? (
        <EmptyState icon={<IconBlocks size={24} />} title={t('claudeConfig.plugins.empty')} />
      ) : (
        <div className={styles.card}>
          {pluginIds.map((id) => {
            const meta = installedMap.get(id)
            const enabled = plugins[id] ?? false
            const parts = id.split('@')
            const name = parts[0] || id
            const publisher = parts.length > 1 ? parts[parts.length - 1] : ''

            return (
              <div key={id} className={styles.listItem}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={styles.listName}>{name}</span>
                    {publisher && <span className={styles.tagGray}>@{publisher}</span>}
                    {meta?.version && <span className={styles.tagBlue}>{meta.version}</span>}
                    {meta?.scope && <span className={styles.tagGreen}>{meta.scope}</span>}
                  </div>
                </div>
                <Toggle checked={enabled} onChange={(v) => handleToggle(id, v)} />
                <button
                  className={styles.btnDanger}
                  onClick={() => handleDelete(id)}
                  type="button"
                >
                  {t('common.delete')}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default SecPlugins
