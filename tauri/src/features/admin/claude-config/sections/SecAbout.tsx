import { useState, useEffect, useCallback } from 'react'
import { api } from '../../../../lib/api'
import type { ClaudeConfig, ClaudeOverview, ClaudeSystemInfo } from '../../../../lib/api/types'
import { SectionHeader } from '../shared'
import styles from '../claude-config.module.css'

interface SectionProps {
  config: ClaudeConfig | null
  overview: ClaudeOverview | null
  onConfigUpdate: (c: ClaudeConfig) => void
  showToast: (msg: string) => void
}

export function SecAbout({ showToast }: SectionProps) {
  const [info, setInfo] = useState<ClaudeSystemInfo | null>(null)
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'latest' | 'available'>('idle')
  const [latestVersion, setLatestVersion] = useState('')

  useEffect(() => {
    api.claudeConfig.getSystemInfo().then(setInfo).catch(() => {
      showToast('Failed to load system info')
    })
  }, [showToast])

  const handleCheckUpdate = useCallback(async () => {
    if (!info) return
    setUpdateStatus('checking')
    try {
      const res = await fetch('https://registry.npmjs.org/@anthropic-ai/claude-code/latest')
      const data = await res.json()
      const latest = data.version as string
      setLatestVersion(latest)
      setUpdateStatus(latest === info.cli_version ? 'latest' : 'available')
    } catch {
      showToast('Failed to check for updates')
      setUpdateStatus('idle')
    }
  }, [info, showToast])

  if (!info) {
    return (
      <div className={styles.sectionWrap}>
        <SectionHeader icon="ℹ️" title="关于" />
        <div className={styles.sectionPlaceholder}>Loading...</div>
      </div>
    )
  }

  const infoGrid: Array<{ label: string; value: string | number }> = [
    { label: 'Config Path', value: info.config_path },
    { label: 'Cache Dir', value: info.cache_dir },
    { label: 'Cache Size', value: `${info.cache_size_mb} MB` },
    { label: 'History Size', value: `${info.history_size_mb} MB` },
    { label: 'Platform', value: info.platform },
    { label: 'Python Version', value: info.python_version },
    { label: 'Sessions', value: info.session_count },
    { label: 'Projects', value: info.project_count },
    { label: 'Skills', value: info.skill_count },
    { label: 'MCP Servers', value: info.mcp_server_count },
  ]

  return (
    <div className={styles.sectionWrap}>
      <SectionHeader icon="ℹ️" title="关于" />

      {/* CLI Version */}
      <div className={styles.card} style={{ marginBottom: 16 }}>
        <div className={styles.cardBody}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className={styles.formLabel}>CLI Version</span>
            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--tc-foreground)' }}>
              {info.cli_version}
            </span>
            <button
              className={styles.btnGhost}
              onClick={handleCheckUpdate}
              disabled={updateStatus === 'checking'}
              type="button"
            >
              {updateStatus === 'checking' ? 'Checking...' : 'Check Update'}
            </button>
            {updateStatus === 'latest' && (
              <span className={styles.tagGreen}>Already latest</span>
            )}
            {updateStatus === 'available' && (
              <span className={styles.tagYellow}>
                Update available: {latestVersion} — npm update -g @anthropic-ai/claude-code
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Info grid */}
      <div
        className={styles.card}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
        }}
      >
        {infoGrid.map((item) => (
          <div key={item.label} className={styles.listItem}>
            <span className={styles.formLabel} style={{ minWidth: 100, flexShrink: 0 }}>
              {item.label}
            </span>
            <span
              style={{
                fontSize: 13,
                color: 'var(--tc-foreground)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
