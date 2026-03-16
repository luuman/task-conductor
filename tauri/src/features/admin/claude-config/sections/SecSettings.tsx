import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../../../lib/api'
import type { ClaudeConfig } from '../../../../lib/api/types'
import { Toggle } from '../../../../ui/toggle'
import { SectionHeader } from '../shared'
import styles from '../claude-config.module.css'

interface SecSettingsProps {
  config: ClaudeConfig | null
  overview: unknown
  onConfigUpdate: (c: ClaudeConfig) => void
  showToast: (msg: string) => void
}

interface SettingDef {
  key: string
  labelKey: string
  type: 'select' | 'string' | 'number' | 'boolean'
  options?: string[]
  placeholder?: string
  group: string
}

const COMMON_SETTINGS: SettingDef[] = [
  { key: 'model', labelKey: 'claudeConfig.settings.model', type: 'select', options: ['', 'opus', 'sonnet', 'haiku'], group: 'model' },
  { key: 'effortLevel', labelKey: 'claudeConfig.settings.effortLevel', type: 'select', options: ['', 'low', 'medium', 'high'], group: 'model' },
  { key: 'language', labelKey: 'claudeConfig.settings.language', type: 'string', placeholder: 'chinese', group: 'behavior' },
  { key: 'outputStyle', labelKey: 'claudeConfig.settings.outputStyle', type: 'string', placeholder: 'Concise', group: 'behavior' },
  { key: 'alwaysThinkingEnabled', labelKey: 'claudeConfig.settings.alwaysThinking', type: 'boolean', group: 'behavior' },
  { key: 'showTurnDuration', labelKey: 'claudeConfig.settings.showTurnDuration', type: 'boolean', group: 'behavior' },
  { key: 'cleanupPeriodDays', labelKey: 'claudeConfig.settings.cleanupPeriod', type: 'number', placeholder: '30', group: 'session' },
  { key: 'plansDirectory', labelKey: 'claudeConfig.settings.plansDirectory', type: 'string', placeholder: './plans', group: 'session' },
  { key: 'forceLoginMethod', labelKey: 'claudeConfig.settings.forceLoginMethod', type: 'select', options: ['', 'claudeai', 'console'], group: 'security' },
  { key: 'autoUpdatesChannel', labelKey: 'claudeConfig.settings.autoUpdatesChannel', type: 'select', options: ['', 'latest', 'stable'], group: 'ui' },
  { key: 'spinnerTipsEnabled', labelKey: 'claudeConfig.settings.spinnerTips', type: 'boolean', group: 'ui' },
  { key: 'terminalProgressBarEnabled', labelKey: 'claudeConfig.settings.terminalProgressBar', type: 'boolean', group: 'ui' },
  { key: 'prefersReducedMotion', labelKey: 'claudeConfig.settings.reducedMotion', type: 'boolean', group: 'ui' },
  { key: 'respectGitignore', labelKey: 'claudeConfig.settings.respectGitignore', type: 'boolean', group: 'ui' },
  { key: 'includeCoAuthoredBy', labelKey: 'claudeConfig.settings.coAuthor', type: 'boolean', group: 'ui' },
  { key: 'enableAllProjectMcpServers', labelKey: 'claudeConfig.settings.enableProjectMcp', type: 'boolean', group: 'advanced' },
  { key: 'teammateMode', labelKey: 'claudeConfig.settings.teammateMode', type: 'select', options: ['', 'auto', 'in-process', 'tmux'], group: 'advanced' },
]

const COMMON_SETTING_KEYS = new Set(COMMON_SETTINGS.map((s) => s.key))

const GROUP_LABEL_KEYS: Record<string, string> = {
  model: 'claudeConfig.settings.groupModel',
  behavior: 'claudeConfig.settings.groupBehavior',
  session: 'claudeConfig.settings.groupSession',
  security: 'claudeConfig.settings.groupSecurity',
  ui: 'claudeConfig.settings.groupUi',
  advanced: 'claudeConfig.settings.groupAdvanced',
}

function getSettingValue(config: ClaudeConfig | null, key: string): unknown {
  if (!config) return ''
  return config.other[key] ?? config.raw[key] ?? ''
}

export function SecSettings({ config, onConfigUpdate, showToast }: SecSettingsProps) {
  const { t } = useTranslation()
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  // Group common settings
  const groupedSettings = useMemo(() => {
    const groups: Record<string, SettingDef[]> = {}
    for (const s of COMMON_SETTINGS) {
      if (!groups[s.group]) groups[s.group] = []
      groups[s.group].push(s)
    }
    return groups
  }, [])

  // Other (non-common) fields from config.other
  const otherFields = useMemo(() => {
    if (!config) return []
    return Object.keys(config.other)
      .filter((k) => !COMMON_SETTING_KEYS.has(k))
      .map((k) => ({ key: k, value: config.other[k] }))
  }, [config])

  const handleSave = useCallback(async (key: string, value: unknown) => {
    try {
      // If value is empty/undefined, delete the key
      if (value === '' || value === undefined || value === null) {
        const result = await api.claudeConfig.deleteOtherKey(key)
        onConfigUpdate(result)
        return
      }
      const result = await api.claudeConfig.updateOtherKey(key, value)
      onConfigUpdate(result)
    } catch {
      showToast(t('claudeConfig.settings.updateFailed', { key }))
    }
  }, [onConfigUpdate, showToast, t])

  const handleDeleteOther = useCallback(async (key: string) => {
    try {
      const result = await api.claudeConfig.deleteOtherKey(key)
      onConfigUpdate(result)
      showToast(t('claudeConfig.settings.deleted', { key }))
    } catch {
      showToast(t('claudeConfig.settings.deleteFailed', { key }))
    }
  }, [onConfigUpdate, showToast, t])

  const handleAddOther = useCallback(async () => {
    if (!newKey.trim()) return
    try {
      // Try to parse as JSON, fallback to string
      let parsed: unknown = newValue
      try {
        parsed = JSON.parse(newValue)
      } catch {
        // keep as string
      }
      const result = await api.claudeConfig.updateOtherKey(newKey.trim(), parsed)
      onConfigUpdate(result)
      setNewKey('')
      setNewValue('')
      showToast(t('claudeConfig.settings.added', { key: newKey.trim() }))
    } catch {
      showToast(t('claudeConfig.settings.addFailed', { key: newKey }))
    }
  }, [newKey, newValue, onConfigUpdate, showToast, t])

  const renderSettingControl = (setting: SettingDef) => {
    const value = getSettingValue(config, setting.key)

    if (setting.type === 'boolean') {
      return (
        <Toggle
          checked={Boolean(value)}
          onChange={(checked) => handleSave(setting.key, checked)}
        />
      )
    }

    if (setting.type === 'select') {
      return (
        <div className={styles.btnGroup}>
          {setting.options?.map((opt) => (
            <button
              key={opt}
              className={`${styles.btnGroupItem} ${String(value ?? '') === opt ? styles.btnGroupItemActive : ''}`}
              onClick={() => handleSave(setting.key, opt || undefined)}
              type="button"
            >
              {opt || t('claudeConfig.settings.default')}
            </button>
          ))}
        </div>
      )
    }

    if (setting.type === 'number') {
      return (
        <input
          className={styles.formInput}
          type="number"
          value={value === '' ? '' : String(value)}
          placeholder={setting.placeholder}
          onBlur={(e) => {
            const num = e.target.value ? Number(e.target.value) : undefined
            handleSave(setting.key, num)
          }}
          onChange={() => {}}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          style={{ width: 120 }}
        />
      )
    }

    // string
    return (
      <input
        className={styles.formInput}
        type="text"
        defaultValue={String(value ?? '')}
        placeholder={setting.placeholder}
        onBlur={(e) => handleSave(setting.key, e.target.value || undefined)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        style={{ width: 180 }}
      />
    )
  }

  return (
    <div className={styles.sectionWrap}>
      <SectionHeader icon="&#x2699;&#xfe0f;" title={t('claudeConfig.settings.title')} />

      {/* Common Settings grouped */}
      {Object.entries(groupedSettings).map(([group, settings]) => (
        <div key={group} className={styles.card} style={{ marginBottom: 12 }}>
          <div className={styles.cardHeader}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tc-foreground)' }}>
              {t(GROUP_LABEL_KEYS[group] ?? group)}
            </span>
          </div>
          <div className={styles.cardBody} style={{ padding: '4px 16px' }}>
            {settings.map((s) => (
              <div key={s.key} className={styles.formRow}>
                <span className={styles.formLabel}>{t(s.labelKey)}</span>
                {renderSettingControl(s)}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Other Fields (dynamic key-value editor) */}
      <div className={styles.card} style={{ marginTop: 16 }}>
        <div className={styles.cardHeader}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tc-foreground)' }}>
            {t('claudeConfig.settings.otherFields')}
          </span>
        </div>
        <div className={styles.cardBody}>
          {otherFields.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)', padding: '8px 0' }}>
              {t('claudeConfig.settings.noCustomFields')}
            </div>
          )}
          {otherFields.map((field) => {
            const isJson = typeof field.value === 'object' && field.value !== null
            const displayValue = isJson ? JSON.stringify(field.value, null, 2) : String(field.value ?? '')
            return (
              <div key={field.key} className={styles.formRow}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                  <span className={styles.formLabel} style={{ fontWeight: 500 }}>{field.key}</span>
                  <span className={styles.tagGray}>{isJson ? 'json' : typeof field.value}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isJson ? (
                    <textarea
                      className={styles.formTextarea}
                      defaultValue={displayValue}
                      style={{ minHeight: 60, width: 240 }}
                      onBlur={(e) => {
                        try {
                          handleSave(field.key, JSON.parse(e.target.value))
                        } catch {
                          showToast(t('claudeConfig.settings.invalidJson'))
                        }
                      }}
                    />
                  ) : (
                    <input
                      className={styles.formInput}
                      type="text"
                      defaultValue={displayValue}
                      onBlur={(e) => handleSave(field.key, e.target.value || undefined)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      }}
                      style={{ width: 180 }}
                    />
                  )}
                  <button
                    className={styles.btnDanger}
                    onClick={() => handleDeleteOther(field.key)}
                    type="button"
                    style={{ padding: '4px 8px' }}
                  >
                    {t('claudeConfig.settings.delete')}
                  </button>
                </div>
              </div>
            )
          })}

          {/* Add new field */}
          <div style={{ borderTop: '1px solid var(--tc-border)', marginTop: 8, paddingTop: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className={styles.formInput}
                type="text"
                placeholder={t('claudeConfig.settings.keyPlaceholder')}
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                style={{ width: 140 }}
              />
              <input
                className={styles.formInput}
                type="text"
                placeholder={t('claudeConfig.settings.valuePlaceholder')}
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                className={styles.btnPrimary}
                onClick={handleAddOther}
                disabled={!newKey.trim()}
                type="button"
              >
                {t('claudeConfig.settings.add')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SecSettings
