import { useCallback } from 'react'
import { api } from '../../../../lib/api'
import type { ClaudeConfig, ClaudeOverview } from '../../../../lib/api/types'
import { JsonEditor } from '../../../../ui/json-editor'
import { SectionHeader } from '../shared'
import styles from '../claude-config.module.css'

interface SecPermissionsProps {
  config: ClaudeConfig | null
  overview: ClaudeOverview | null
  onConfigUpdate: (c: ClaudeConfig) => void
  showToast: (msg: string) => void
}

export function SecPermissions({ config, onConfigUpdate, showToast }: SecPermissionsProps) {
  const handleChange = useCallback(
    async (value: unknown) => {
      try {
        const result = await api.claudeConfig.updatePermissions(
          value as Record<string, unknown>
        )
        onConfigUpdate(result)
        showToast('Permissions saved')
      } catch {
        showToast('Failed to save permissions')
      }
    },
    [onConfigUpdate, showToast]
  )

  return (
    <div className={styles.sectionWrap}>
      <SectionHeader icon="🔒" title="权限" />
      <div className={styles.card}>
        <div className={styles.cardBody}>
          <JsonEditor
            value={config?.permissions ?? {}}
            onChange={handleChange}
            label="Permissions"
          />
        </div>
      </div>
    </div>
  )
}
