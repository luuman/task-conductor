import { useCallback } from 'react'
import { api } from '../../../../lib/api'
import type { ClaudeConfig, ClaudeOverview } from '../../../../lib/api/types'
import { Toggle } from '../../../../ui/toggle'
import { SectionHeader } from '../shared'
import styles from '../claude-config.module.css'

interface SectionProps {
  config: ClaudeConfig | null
  overview: ClaudeOverview | null
  onConfigUpdate: (c: ClaudeConfig) => void
  showToast: (msg: string) => void
}

export function SecPlugins({ config, overview, onConfigUpdate, showToast }: SectionProps) {
  const plugins = config?.enabled_plugins ?? {}
  const pluginIds = Object.keys(plugins)

  const installedMap = new Map(
    (overview?.installed_plugins ?? []).map((p) => [p.plugin_id, p])
  )

  const handleToggle = useCallback(async (id: string, enabled: boolean) => {
    try {
      const result = await api.claudeConfig.updatePlugin(id, enabled)
      onConfigUpdate(result)
      showToast(`${id} ${enabled ? 'enabled' : 'disabled'}`)
    } catch {
      showToast('Failed to update plugin')
    }
  }, [onConfigUpdate, showToast])

  const handleDelete = useCallback(async (id: string) => {
    try {
      const result = await api.claudeConfig.deletePlugin(id)
      onConfigUpdate(result)
      showToast(`Deleted ${id}`)
    } catch {
      showToast('Failed to delete plugin')
    }
  }, [onConfigUpdate, showToast])

  return (
    <div className={styles.sectionWrap}>
      <SectionHeader icon="🧩" title="插件" />

      {pluginIds.length === 0 ? (
        <div className={styles.sectionPlaceholder}>No plugins installed</div>
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
                  Delete
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
