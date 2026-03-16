import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const [info, setInfo] = useState<ClaudeSystemInfo | null>(null)
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'latest' | 'available'>('idle')
  const [latestVersion, setLatestVersion] = useState('')

  useEffect(() => {
    api.claudeConfig.getSystemInfo().then(setInfo).catch(() => {
      showToast(t('claudeConfig.about.checkFailed'))
    })
  }, [showToast, t])

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
      showToast(t('claudeConfig.about.checkFailed'))
      setUpdateStatus('idle')
    }
  }, [info, showToast, t])

  if (!info) {
    return (
      <div className={styles.sectionWrap}>
        <SectionHeader icon="&#x2139;&#xFE0F;" title={t('claudeConfig.about.title')} />
        <div className={styles.sectionPlaceholder}>{t('claudeConfig.about.loading')}</div>
      </div>
    )
  }

  const infoGrid: Array<{ label: string; value: string | number }> = [
    { label: t('claudeConfig.about.configPath'), value: info.config_path },
    { label: t('claudeConfig.about.cacheDir'), value: info.cache_dir },
    { label: t('claudeConfig.about.cacheSize'), value: `${info.cache_size_mb} MB` },
    { label: t('claudeConfig.about.historySize'), value: `${info.history_size_mb} MB` },
    { label: t('claudeConfig.about.platform'), value: info.platform },
    { label: t('claudeConfig.about.pythonVersion'), value: info.python_version },
    { label: t('claudeConfig.about.sessionCount'), value: info.session_count },
    { label: t('claudeConfig.about.projectCount'), value: info.project_count },
    { label: t('claudeConfig.about.skillCount'), value: info.skill_count },
    { label: t('claudeConfig.about.mcpCount'), value: info.mcp_server_count },
  ]

  return (
    <div className={styles.sectionWrap}>
      <SectionHeader icon="&#x2139;&#xFE0F;" title={t('claudeConfig.about.title')} />

      {/* CLI Version */}
      <div className={styles.card} style={{ marginBottom: 16 }}>
        <div className={styles.cardBody}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className={styles.formLabel}>{t('claudeConfig.about.title')}</span>
            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--tc-foreground)' }}>
              {info.cli_version}
            </span>
            <button
              className={styles.btnGhost}
              onClick={handleCheckUpdate}
              disabled={updateStatus === 'checking'}
              type="button"
            >
              {updateStatus === 'checking' ? t('claudeConfig.about.checking') : t('claudeConfig.about.checkUpdate')}
            </button>
            {updateStatus === 'latest' && (
              <span className={styles.tagGreen}>{t('claudeConfig.about.latest')}</span>
            )}
            {updateStatus === 'available' && (
              <span className={styles.tagYellow}>
                {t('claudeConfig.about.updateAvailable')}: {latestVersion} — npm update -g @anthropic-ai/claude-code
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

export default SecAbout
