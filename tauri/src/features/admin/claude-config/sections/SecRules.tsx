import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../../../lib/api'
import type { ClaudeConfig, ClaudeOverview, RuleInfo, PresetItem } from '../../../../lib/api/types'
import { Toggle } from '../../../../ui/toggle'
import { EmptyState } from '../../../../ui/empty-state'
import { IconClipboard } from '../../../../ui/icon'
import { SectionHeader, DetailPanel, PresetGallery } from '../shared'
import styles from '../claude-config.module.css'

interface SectionProps {
  config: ClaudeConfig | null
  overview: ClaudeOverview | null
  onConfigUpdate: (c: ClaudeConfig) => void
  showToast: (msg: string) => void
}

export function SecRules({ showToast }: SectionProps) {
  const { t } = useTranslation()
  const [rules, setRules] = useState<RuleInfo[]>([])
  const [presets, setPresets] = useState<PresetItem[]>([])
  const [loading, setLoading] = useState(true)
  const [installingPreset, setInstallingPreset] = useState<string | null>(null)
  const [selectedRule, setSelectedRule] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  const loadRules = useCallback(async () => {
    try {
      const data = await api.claudeConfig.getRules()
      setRules(data)
      return data
    } catch {
      showToast(t('claudeConfig.rules.toggleFailed'))
      return []
    }
  }, [showToast, t])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [ruleData, presetData] = await Promise.all([
          api.claudeConfig.getRules(),
          api.claudeConfig.getRulePresets(),
        ])
        if (cancelled) return
        setRules(ruleData)
        const ruleNames = new Set(ruleData.map((r) => r.name))
        setPresets(presetData.map((p) => ({ ...p, installed: ruleNames.has(p.name) })))
      } catch {
        if (!cancelled) showToast(t('claudeConfig.rules.toggleFailed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [showToast, t])

  useEffect(() => {
    const ruleNames = new Set(rules.map((r) => r.name))
    setPresets((prev) => prev.map((p) => ({ ...p, installed: ruleNames.has(p.name) })))
  }, [rules])

  const handleToggle = useCallback(async (name: string, enabled: boolean) => {
    setRules((prev) => prev.map((r) => (r.name === name ? { ...r, enabled } : r)))
    try {
      await api.claudeConfig.toggleRule(name, enabled)
    } catch {
      setRules((prev) => prev.map((r) => (r.name === name ? { ...r, enabled: !enabled } : r)))
      showToast(t('claudeConfig.rules.toggleFailed'))
    }
  }, [showToast, t])

  const handleCreate = useCallback(async () => {
    const name = newName.trim()
    if (!name) return
    try {
      await api.claudeConfig.createRule(name)
      setNewName('')
      await loadRules()
    } catch {
      showToast(t('claudeConfig.rules.createFailed'))
    }
  }, [newName, loadRules, showToast, t])

  const handleInstallPreset = useCallback(async (name: string, content: string) => {
    setInstallingPreset(name)
    try {
      const preset = presets.find((p) => p.name === name)
      await api.claudeConfig.createRule(name, preset?.content || content)
      await loadRules()
    } catch {
      showToast(t('claudeConfig.rules.createFailed'))
    } finally {
      setInstallingPreset(null)
    }
  }, [presets, loadRules, showToast, t])

  const handleDelete = useCallback(async (name: string) => {
    try {
      await api.claudeConfig.deleteRule(name)
      setRules((prev) => prev.filter((r) => r.name !== name))
      if (selectedRule === name) setSelectedRule(null)
    } catch {
      showToast(t('claudeConfig.rules.deleteFailed'))
    }
  }, [selectedRule, showToast, t])

  const selected = selectedRule ? rules.find((r) => r.name === selectedRule) : null

  if (loading) {
    return (
      <div className={styles.sectionWrap}>
        <SectionHeader icon="&#x1f4d0;" title={t('claudeConfig.rules.title')} />
        <div className={styles.sectionSkeleton}>
          <div className={styles.sectionPlaceholder}>{t('claudeConfig.rules.loading')}</div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.sectionWrap}>
      <SectionHeader icon="&#x1f4d0;" title={t('claudeConfig.rules.title')} />

      {/* Create form */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          className={styles.formInput}
          type="text"
          placeholder={t('claudeConfig.rules.namePlaceholder')}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
          style={{ flex: 1 }}
        />
        <button
          className={styles.btnPrimary}
          onClick={handleCreate}
          disabled={!newName.trim()}
          type="button"
        >
          {t('common.create')}
        </button>
      </div>

      {/* Preset Gallery */}
      {presets.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <PresetGallery
            presets={presets}
            onInstall={handleInstallPreset}
            loading={installingPreset}
          />
        </div>
      )}

      {/* Rule list + detail */}
      <div style={{ display: 'flex', gap: 16 }}>
        <div className={styles.card} style={{ flex: selected ? '0 0 50%' : '1 1 100%' }}>
          {rules.length === 0 ? (
            <EmptyState icon={<IconClipboard size={24} />} title={t('claudeConfig.rules.empty')} />
          ) : (
            rules.map((rule) => (
              <div
                key={rule.name}
                className={styles.listItem}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedRule(rule.name === selectedRule ? null : rule.name)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.listName}>{rule.name}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <span className={styles.tagGray}>{rule.scope}</span>
                  </div>
                </div>
                <Toggle
                  checked={rule.enabled}
                  onChange={(checked) => handleToggle(rule.name, checked)}
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  className={styles.btnDanger}
                  onClick={(e) => { e.stopPropagation(); handleDelete(rule.name) }}
                  type="button"
                  style={{ padding: '4px 8px' }}
                >
                  {t('common.delete')}
                </button>
              </div>
            ))
          )}
        </div>

        {selected && (
          <div style={{ flex: '0 0 50%' }}>
            <DetailPanel
              title={selected.name}
              path={selected.path}
              content={selected.content}
              onClose={() => setSelectedRule(null)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default SecRules
