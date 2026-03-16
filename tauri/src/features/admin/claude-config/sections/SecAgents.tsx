import { useState, useEffect, useCallback } from 'react'
import { api } from '../../../../lib/api'
import type { ClaudeConfig, ClaudeOverview, AgentInfo, PresetItem } from '../../../../lib/api/types'
import { Toggle } from '../../../../ui/toggle'
import { SectionHeader, DetailPanel, PresetGallery } from '../shared'
import styles from '../claude-config.module.css'

interface SectionProps {
  config: ClaudeConfig | null
  overview: ClaudeOverview | null
  onConfigUpdate: (c: ClaudeConfig) => void
  showToast: (msg: string) => void
}

export function SecAgents({ showToast }: SectionProps) {
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [presets, setPresets] = useState<PresetItem[]>([])
  const [loading, setLoading] = useState(true)
  const [installingPreset, setInstallingPreset] = useState<string | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  const loadAgents = useCallback(async () => {
    try {
      const data = await api.claudeConfig.getAgents()
      setAgents(data)
      return data
    } catch {
      showToast('Failed to load agents')
      return []
    }
  }, [showToast])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [agentData, presetData] = await Promise.all([
          api.claudeConfig.getAgents(),
          api.claudeConfig.getAgentPresets(),
        ])
        if (cancelled) return
        setAgents(agentData)
        const agentNames = new Set(agentData.map((a) => a.name))
        setPresets(presetData.map((p) => ({ ...p, installed: agentNames.has(p.name) })))
      } catch {
        if (!cancelled) showToast('Failed to load agents')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [showToast])

  // Update presets installed status when agents change
  useEffect(() => {
    const agentNames = new Set(agents.map((a) => a.name))
    setPresets((prev) => prev.map((p) => ({ ...p, installed: agentNames.has(p.name) })))
  }, [agents])

  const handleToggle = useCallback(async (name: string, enabled: boolean) => {
    setAgents((prev) => prev.map((a) => (a.name === name ? { ...a, enabled } : a)))
    try {
      await api.claudeConfig.toggleAgent(name, enabled)
    } catch {
      setAgents((prev) => prev.map((a) => (a.name === name ? { ...a, enabled: !enabled } : a)))
      showToast(`Failed to toggle ${name}`)
    }
  }, [showToast])

  const handleCreate = useCallback(async () => {
    const name = newName.trim()
    if (!name) return
    try {
      await api.claudeConfig.createAgent(name)
      setNewName('')
      await loadAgents()
      showToast(`Agent "${name}" created`)
    } catch {
      showToast(`Failed to create agent "${name}"`)
    }
  }, [newName, loadAgents, showToast])

  const handleInstallPreset = useCallback(async (name: string, content: string) => {
    setInstallingPreset(name)
    try {
      const preset = presets.find((p) => p.name === name)
      await api.claudeConfig.createAgent(name, preset?.content || content)
      await loadAgents()
      showToast(`Agent "${name}" installed`)
    } catch {
      showToast(`Failed to install "${name}"`)
    } finally {
      setInstallingPreset(null)
    }
  }, [presets, loadAgents, showToast])

  const handleDelete = useCallback(async (name: string) => {
    try {
      await api.claudeConfig.deleteAgent(name)
      setAgents((prev) => prev.filter((a) => a.name !== name))
      if (selectedAgent === name) setSelectedAgent(null)
      showToast(`Agent "${name}" deleted`)
    } catch {
      showToast(`Failed to delete "${name}"`)
    }
  }, [selectedAgent, showToast])

  const selected = selectedAgent ? agents.find((a) => a.name === selectedAgent) : null

  if (loading) {
    return (
      <div className={styles.sectionWrap}>
        <SectionHeader icon="&#x1f916;" title="Agents" />
        <div className={styles.sectionSkeleton}>
          <div className={styles.sectionPlaceholder}>Loading agents...</div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.sectionWrap}>
      <SectionHeader icon="&#x1f916;" title="Agents" />

      {/* Create form */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          className={styles.formInput}
          type="text"
          placeholder="Agent name"
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

      {/* Agent list + detail */}
      <div style={{ display: 'flex', gap: 16 }}>
        <div className={styles.card} style={{ flex: selected ? '0 0 50%' : '1 1 100%' }}>
          {agents.length === 0 ? (
            <div className={styles.sectionPlaceholder}>No agents found</div>
          ) : (
            agents.map((agent) => (
              <div
                key={agent.name}
                className={styles.listItem}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedAgent(agent.name === selectedAgent ? null : agent.name)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.listName}>{agent.name}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <span className={styles.tagGray}>{agent.scope}</span>
                  </div>
                </div>
                <Toggle
                  checked={agent.enabled}
                  onChange={(checked) => handleToggle(agent.name, checked)}
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  className={styles.btnDanger}
                  onClick={(e) => { e.stopPropagation(); handleDelete(agent.name) }}
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
              metadata={selected.metadata}
              content={selected.content}
              onClose={() => setSelectedAgent(null)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
