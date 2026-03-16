import { useState, useEffect, useCallback } from 'react'
import { api } from '../../../../lib/api'
import type { ClaudeConfig, ClaudeOverview, RuleInfo, PresetItem } from '../../../../lib/api/types'
import { Toggle } from '../../../../ui/toggle'
import { SectionHeader, DetailPanel, PresetGallery } from '../shared'
import styles from '../claude-config.module.css'

interface SectionProps {
  config: ClaudeConfig | null
  overview: ClaudeOverview | null
  onConfigUpdate: (c: ClaudeConfig) => void
  showToast: (msg: string) => void
}

export function SecRules({ showToast }: SectionProps) {
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
      showToast('Failed to load rules')
      return []
    }
  }, [showToast])

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
        if (!cancelled) showToast('Failed to load rules')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [showToast])

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
      showToast(`Failed to toggle ${name}`)
    }
  }, [showToast])

  const handleCreate = useCallback(async () => {
    const name = newName.trim()
    if (!name) return
    try {
      await api.claudeConfig.createRule(name)
      setNewName('')
      await loadRules()
      showToast(`Rule "${name}" created`)
    } catch {
      showToast(`Failed to create rule "${name}"`)
    }
  }, [newName, loadRules, showToast])

  const handleInstallPreset = useCallback(async (name: string, content: string) => {
    setInstallingPreset(name)
    try {
      const preset = presets.find((p) => p.name === name)
      await api.claudeConfig.createRule(name, preset?.content || content)
      await loadRules()
      showToast(`Rule "${name}" installed`)
    } catch {
      showToast(`Failed to install "${name}"`)
    } finally {
      setInstallingPreset(null)
    }
  }, [presets, loadRules, showToast])

  const handleDelete = useCallback(async (name: string) => {
    try {
      await api.claudeConfig.deleteRule(name)
      setRules((prev) => prev.filter((r) => r.name !== name))
      if (selectedRule === name) setSelectedRule(null)
      showToast(`Rule "${name}" deleted`)
    } catch {
      showToast(`Failed to delete "${name}"`)
    }
  }, [selectedRule, showToast])

  const selected = selectedRule ? rules.find((r) => r.name === selectedRule) : null

  if (loading) {
    return (
      <div className={styles.sectionWrap}>
        <SectionHeader icon="&#x1f4d0;" title="Rules" />
        <div className={styles.sectionSkeleton}>
          <div className={styles.sectionPlaceholder}>Loading rules...</div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.sectionWrap}>
      <SectionHeader icon="&#x1f4d0;" title="Rules" />

      {/* Create form */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          className={styles.formInput}
          type="text"
          placeholder="Rule name"
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
          Create
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
            <div className={styles.sectionPlaceholder}>No rules found</div>
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
                  Delete
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
