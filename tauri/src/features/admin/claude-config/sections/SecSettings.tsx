import { useState, useMemo, useCallback } from 'react'
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
  label: string
  type: 'select' | 'string' | 'number' | 'boolean'
  options?: string[]
  placeholder?: string
  group: string
}

const COMMON_SETTINGS: SettingDef[] = [
  { key: 'model', label: '默认模型', type: 'select', options: ['', 'opus', 'sonnet', 'haiku'], group: 'model' },
  { key: 'effortLevel', label: '推理等级', type: 'select', options: ['', 'low', 'medium', 'high'], group: 'model' },
  { key: 'language', label: '回复语言', type: 'string', placeholder: 'chinese', group: 'behavior' },
  { key: 'outputStyle', label: '输出风格', type: 'string', placeholder: 'Concise', group: 'behavior' },
  { key: 'alwaysThinkingEnabled', label: '始终思考', type: 'boolean', group: 'behavior' },
  { key: 'showTurnDuration', label: '显示轮次时长', type: 'boolean', group: 'behavior' },
  { key: 'cleanupPeriodDays', label: '清理周期(天)', type: 'number', placeholder: '30', group: 'session' },
  { key: 'plansDirectory', label: '计划目录', type: 'string', placeholder: './plans', group: 'session' },
  { key: 'forceLoginMethod', label: '强制登录方式', type: 'select', options: ['', 'claudeai', 'console'], group: 'security' },
  { key: 'autoUpdatesChannel', label: '更新频道', type: 'select', options: ['', 'latest', 'stable'], group: 'ui' },
  { key: 'spinnerTipsEnabled', label: '加载提示', type: 'boolean', group: 'ui' },
  { key: 'terminalProgressBarEnabled', label: '终端进度条', type: 'boolean', group: 'ui' },
  { key: 'prefersReducedMotion', label: '减少动画', type: 'boolean', group: 'ui' },
  { key: 'respectGitignore', label: '遵守 .gitignore', type: 'boolean', group: 'ui' },
  { key: 'includeCoAuthoredBy', label: 'Git Co-Author', type: 'boolean', group: 'ui' },
  { key: 'enableAllProjectMcpServers', label: '自动启用项目 MCP', type: 'boolean', group: 'advanced' },
  { key: 'teammateMode', label: 'Teammate 模式', type: 'select', options: ['', 'auto', 'in-process', 'tmux'], group: 'advanced' },
]

const COMMON_SETTING_KEYS = new Set(COMMON_SETTINGS.map((s) => s.key))

const GROUP_LABELS: Record<string, string> = {
  model: '模型',
  behavior: '行为',
  session: '会话',
  security: '安全',
  ui: '界面',
  advanced: '高级',
}

function getSettingValue(config: ClaudeConfig | null, key: string): unknown {
  if (!config) return ''
  return config.other[key] ?? config.raw[key] ?? ''
}

export function SecSettings({ config, onConfigUpdate, showToast }: SecSettingsProps) {
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
      showToast(`Failed to update ${key}`)
    }
  }, [onConfigUpdate, showToast])

  const handleDeleteOther = useCallback(async (key: string) => {
    try {
      const result = await api.claudeConfig.deleteOtherKey(key)
      onConfigUpdate(result)
      showToast(`Deleted ${key}`)
    } catch {
      showToast(`Failed to delete ${key}`)
    }
  }, [onConfigUpdate, showToast])

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
      showToast(`Added ${newKey.trim()}`)
    } catch {
      showToast(`Failed to add ${newKey}`)
    }
  }, [newKey, newValue, onConfigUpdate, showToast])

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
        <select
          className={styles.formSelect}
          value={String(value ?? '')}
          onChange={(e) => handleSave(setting.key, e.target.value || undefined)}
        >
          {setting.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt || '(default)'}
            </option>
          ))}
        </select>
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
      <SectionHeader icon="&#x2699;&#xfe0f;" title="设置" />

      {/* Common Settings grouped */}
      {Object.entries(groupedSettings).map(([group, settings]) => (
        <div key={group} className={styles.card} style={{ marginBottom: 12 }}>
          <div className={styles.cardHeader}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tc-foreground)' }}>
              {GROUP_LABELS[group] ?? group}
            </span>
          </div>
          <div className={styles.cardBody} style={{ padding: '4px 16px' }}>
            {settings.map((s) => (
              <div key={s.key} className={styles.formRow}>
                <span className={styles.formLabel}>{s.label}</span>
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
            其他字段
          </span>
        </div>
        <div className={styles.cardBody}>
          {otherFields.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)', padding: '8px 0' }}>
              No custom fields
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
                          showToast('Invalid JSON')
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
                    Delete
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
                placeholder="Key"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                style={{ width: 140 }}
              />
              <input
                className={styles.formInput}
                type="text"
                placeholder="Value (JSON or string)"
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
                Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
