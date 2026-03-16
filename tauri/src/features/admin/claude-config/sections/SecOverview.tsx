import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
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

function parseMdSections(content: string): Array<{ title: string; body: string }> {
  const sections: Array<{ title: string; body: string }> = []
  const lines = content.split('\n')
  let currentTitle = ''
  let currentBody: string[] = []

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentTitle || currentBody.length > 0) {
        sections.push({ title: currentTitle, body: currentBody.join('\n').trim() })
      }
      currentTitle = line.replace(/^##\s+/, '')
      currentBody = []
    } else if (line.startsWith('# ') && sections.length === 0 && !currentTitle) {
      // Top-level heading becomes first section
      currentTitle = line.replace(/^#\s+/, '')
    } else {
      currentBody.push(line)
    }
  }
  if (currentTitle || currentBody.length > 0) {
    sections.push({ title: currentTitle, body: currentBody.join('\n').trim() })
  }
  return sections
}

export function SecOverview({ overview, showToast }: SecOverviewProps) {
  const { t } = useTranslation()
  const [mdContent, setMdContent] = useState('')
  const [mdPath, setMdPath] = useState('')
  const [mdEditing, setMdEditing] = useState(false)
  const [mdSaving, setMdSaving] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0, 1]))

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
      showToast(t('claudeConfig.overview.mdSaved'))
    } catch {
      showToast(t('claudeConfig.overview.mdSaveFailed'))
    } finally {
      setMdSaving(false)
    }
  }, [mdContent, showToast, t])

  const mdSections = useMemo(() => parseMdSections(mdContent), [mdContent])

  const toggleSection = useCallback((index: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  const kpiCards = [
    { label: t('claudeConfig.overview.cliVersion'), value: overview?.cli_version ?? '-' },
    { label: t('claudeConfig.overview.totalMessages'), value: overview?.total_messages ?? 0 },
    { label: t('claudeConfig.overview.totalToolCalls'), value: overview?.total_tool_calls ?? 0 },
    { label: t('claudeConfig.overview.totalSessions'), value: overview?.total_sessions ?? 0 },
    { label: t('claudeConfig.overview.activeDays'), value: overview?.active_days ?? 0 },
  ]

  return (
    <div className={styles.sectionWrap}>
      <SectionHeader icon="&#x1f4ca;" title={t('claudeConfig.overview.title')} />

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
                {t('claudeConfig.overview.edit')}
              </button>
            ) : (
              <>
                <button
                  className={styles.btnGhost}
                  onClick={() => setMdEditing(false)}
                  type="button"
                >
                  {t('claudeConfig.overview.cancel')}
                </button>
                <button
                  className={styles.btnPrimary}
                  onClick={handleSaveMd}
                  disabled={mdSaving}
                  type="button"
                >
                  {mdSaving ? t('claudeConfig.overview.saving') : t('claudeConfig.overview.save')}
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
            <div className={styles.mdSections}>
              {mdSections.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)' }}>
                  {t('claudeConfig.overview.noContent')}
                </div>
              )}
              {mdSections.map((section, index) => (
                <div key={index} className={styles.mdSectionCard}>
                  <button
                    className={styles.mdSectionHeader}
                    onClick={() => toggleSection(index)}
                    type="button"
                  >
                    <span className={styles.mdSectionChevron}>
                      {expandedSections.has(index) ? '\u25BE' : '\u25B8'}
                    </span>
                    <span className={styles.mdSectionTitle}>
                      {section.title || t('claudeConfig.overview.untitled')}
                    </span>
                  </button>
                  {expandedSections.has(index) && section.body && (
                    <div className={styles.mdSectionBody}>
                      <MdPreview content={section.body} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SecOverview
