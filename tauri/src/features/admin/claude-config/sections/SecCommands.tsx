import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../../../lib/api'
import type { ClaudeConfig, ClaudeOverview, CommandInfo, PresetItem } from '../../../../lib/api/types'
import { Toggle } from '../../../../ui/toggle'
import { SectionHeader, DetailPanel, PresetGallery } from '../shared'
import styles from '../claude-config.module.css'

interface SectionProps {
  config: ClaudeConfig | null
  overview: ClaudeOverview | null
  onConfigUpdate: (c: ClaudeConfig) => void
  showToast: (msg: string) => void
}

export function SecCommands({ showToast }: SectionProps) {
  const { t } = useTranslation()
  const [commands, setCommands] = useState<CommandInfo[]>([])
  const [presets, setPresets] = useState<PresetItem[]>([])
  const [loading, setLoading] = useState(true)
  const [installingPreset, setInstallingPreset] = useState<string | null>(null)
  const [selectedCommand, setSelectedCommand] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  const loadCommands = useCallback(async () => {
    try {
      const data = await api.claudeConfig.getCommands()
      setCommands(data)
      return data
    } catch {
      showToast(t('claudeConfig.commands.toggleFailed'))
      return []
    }
  }, [showToast, t])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [cmdData, presetData] = await Promise.all([
          api.claudeConfig.getCommands(),
          api.claudeConfig.getCommandPresets(),
        ])
        if (cancelled) return
        setCommands(cmdData)
        const cmdNames = new Set(cmdData.map((c) => c.name))
        setPresets(presetData.map((p) => ({ ...p, installed: cmdNames.has(p.name) })))
      } catch {
        if (!cancelled) showToast(t('claudeConfig.commands.toggleFailed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [showToast, t])

  useEffect(() => {
    const cmdNames = new Set(commands.map((c) => c.name))
    setPresets((prev) => prev.map((p) => ({ ...p, installed: cmdNames.has(p.name) })))
  }, [commands])

  const handleToggle = useCallback(async (name: string, enabled: boolean) => {
    setCommands((prev) => prev.map((c) => (c.name === name ? { ...c, enabled } : c)))
    try {
      await api.claudeConfig.toggleCommand(name, enabled)
    } catch {
      setCommands((prev) => prev.map((c) => (c.name === name ? { ...c, enabled: !enabled } : c)))
      showToast(t('claudeConfig.commands.toggleFailed'))
    }
  }, [showToast, t])

  const handleCreate = useCallback(async () => {
    const name = newName.trim()
    if (!name) return
    try {
      await api.claudeConfig.createCommand(name)
      setNewName('')
      await loadCommands()
    } catch {
      showToast(t('claudeConfig.commands.createFailed'))
    }
  }, [newName, loadCommands, showToast, t])

  const handleInstallPreset = useCallback(async (name: string, content: string) => {
    setInstallingPreset(name)
    try {
      const preset = presets.find((p) => p.name === name)
      await api.claudeConfig.createCommand(name, preset?.content || content)
      await loadCommands()
    } catch {
      showToast(t('claudeConfig.commands.createFailed'))
    } finally {
      setInstallingPreset(null)
    }
  }, [presets, loadCommands, showToast, t])

  const handleDelete = useCallback(async (name: string) => {
    try {
      await api.claudeConfig.deleteCommand(name)
      setCommands((prev) => prev.filter((c) => c.name !== name))
      if (selectedCommand === name) setSelectedCommand(null)
    } catch {
      showToast(t('claudeConfig.commands.deleteFailed'))
    }
  }, [selectedCommand, showToast, t])

  const selected = selectedCommand ? commands.find((c) => c.name === selectedCommand) : null

  if (loading) {
    return (
      <div className={styles.sectionWrap}>
        <SectionHeader icon="&#x1f4dd;" title={t('claudeConfig.commands.title')} />
        <div className={styles.sectionSkeleton}>
          <div className={styles.sectionPlaceholder}>{t('claudeConfig.commands.loading')}</div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.sectionWrap}>
      <SectionHeader icon="&#x1f4dd;" title={t('claudeConfig.commands.title')} />

      {/* Create form */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          className={styles.formInput}
          type="text"
          placeholder={t('claudeConfig.commands.namePlaceholder')}
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

      {/* Command list + detail */}
      <div style={{ display: 'flex', gap: 16 }}>
        <div className={styles.card} style={{ flex: selected ? '0 0 50%' : '1 1 100%' }}>
          {commands.length === 0 ? (
            <div className={styles.sectionPlaceholder}>{t('claudeConfig.commands.empty')}</div>
          ) : (
            commands.map((cmd) => (
              <div
                key={cmd.name}
                className={styles.listItem}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedCommand(cmd.name === selectedCommand ? null : cmd.name)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.listName}>/{cmd.name}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <span className={styles.tagGray}>{cmd.scope}</span>
                  </div>
                </div>
                <Toggle
                  checked={cmd.enabled}
                  onChange={(checked) => handleToggle(cmd.name, checked)}
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  className={styles.btnDanger}
                  onClick={(e) => { e.stopPropagation(); handleDelete(cmd.name) }}
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
              title={`/${selected.name}`}
              path={selected.path}
              content={selected.content}
              onClose={() => setSelectedCommand(null)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default SecCommands
