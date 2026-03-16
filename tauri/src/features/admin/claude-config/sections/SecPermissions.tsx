import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()

  const handleChange = useCallback(
    async (value: unknown) => {
      try {
        const result = await api.claudeConfig.updatePermissions(
          value as Record<string, unknown>
        )
        onConfigUpdate(result)
        showToast(t('claudeConfig.permissions.updated'))
      } catch {
        showToast(t('claudeConfig.permissions.updateFailed'))
      }
    },
    [onConfigUpdate, showToast, t]
  )

  return (
    <div className={styles.sectionWrap}>
      <SectionHeader icon="&#x1F512;" title={t('claudeConfig.permissions.title')} />
      <div className={styles.card}>
        <div className={styles.cardBody}>
          <JsonEditor
            value={config?.permissions ?? {}}
            onChange={handleChange}
            label={t('claudeConfig.permissions.title')}
          />
        </div>
      </div>
    </div>
  )
}

export default SecPermissions
