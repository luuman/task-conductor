import { useState, useEffect, useCallback } from 'react'
import { api } from '../../../../lib/api'
import type { ClaudeConfig, ClaudeOverview } from '../../../../lib/api/types'
import { SectionHeader, ActivityChart, MdPreview } from '../shared'
import styles from '../claude-config.module.css'

interface SecOverviewProps {
  config: ClaudeConfig | null
  overview: ClaudeOverview | null
  onConfigUpdate: (c: ClaudeConfig) => void
  showToast: (msg: string) => void
}

export function SecOverview({ overview, showToast }: SecOverviewProps) {
  const [mdContent, setMdContent] = useState('')
  const [mdPath, setMdPath] = useState('')
  const [mdEditing, setMdEditing] = useState(false)
  const [mdSaving, setMdSaving] = useState(false)

  // Load CLAUDE.md
  useEffect(() => {
    api.claudeConfig.getClaudeMd().then(({ content, path }) => {
      setMdContent(content)
      setMdPath(path)
    }).catch(() => {})
  }, [])

  const handleSaveMd = useCallback(async () => {
    setMdSaving(true)
    try {
      const result = await api.claudeConfig.updateClaudeMd(mdContent)
      setMdContent(result.content)
      setMdEditing(false)
      showToast('CLAUDE.md saved')
    } catch {
      showToast('Failed to save CLAUDE.md')
    } finally {
      setMdSaving(false)
    }
  }, [mdContent, showToast])

  const kpiCards = [
    { label: 'CLI Version', value: overview?.cli_version ?? '-' },
    { label: 'Total Messages', value: overview?.total_messages ?? 0 },
    { label: 'Total Tool Calls', value: overview?.total_tool_calls ?? 0 },
    { label: 'Total Sessions', value: overview?.total_sessions ?? 0 },
    { label: 'Active Days', value: overview?.active_days ?? 0 },
  ]

  return (
    <div className={styles.sectionWrap}>
      <SectionHeader icon="&#x1f4ca;" title="概览" />

      {/* KPI Cards */}
      <div className={styles.cardGrid} style={{ marginBottom: 16 }}>
        {kpiCards.map((kpi) => (
          <div key={kpi.label} className={styles.card}>
            <div className={styles.cardBody}>
              <div className={styles.formLabel}>{kpi.label}</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--tc-foreground)', marginTop: 4 }}>
                {kpi.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Activity Chart */}
      {overview && overview.daily_activity.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <ActivityChart data={overview.daily_activity} />
        </div>
      )}

      {/* CLAUDE.md Editor */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tc-foreground)' }}>
            CLAUDE.md
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {mdPath && (
              <span className={styles.formLabel} style={{ marginRight: 8 }}>{mdPath}</span>
            )}
            {!mdEditing ? (
              <button
                className={styles.btnGhost}
                onClick={() => setMdEditing(true)}
                type="button"
              >
                Edit
              </button>
            ) : (
              <>
                <button
                  className={styles.btnGhost}
                  onClick={() => setMdEditing(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className={styles.btnPrimary}
                  onClick={handleSaveMd}
                  disabled={mdSaving}
                  type="button"
                >
                  {mdSaving ? 'Saving...' : 'Save'}
                </button>
              </>
            )}
          </div>
        </div>
        <div className={styles.cardBody}>
          {mdEditing ? (
            <textarea
              className={styles.formTextarea}
              value={mdContent}
              onChange={(e) => setMdContent(e.target.value)}
              style={{ minHeight: 300 }}
            />
          ) : (
            <MdPreview content={mdContent} />
          )}
        </div>
      </div>
    </div>
  )
}
