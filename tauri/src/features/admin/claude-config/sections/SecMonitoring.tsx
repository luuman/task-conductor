import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../../../lib/api'
import type { ClaudeConfig, ClaudeOverview, ProjectDetails } from '../../../../lib/api/types'
import { SectionHeader, ActivityChart } from '../shared'
import { EmptyState } from '../../../../ui/empty-state'
import { IconFolder } from '../../../../ui/icon'
import styles from '../claude-config.module.css'

interface SectionProps {
  config: ClaudeConfig | null
  overview: ClaudeOverview | null
  onConfigUpdate: (c: ClaudeConfig) => void
  showToast: (msg: string) => void
}

export function SecMonitoring({ overview }: SectionProps) {
  const { t } = useTranslation()
  const [projectDetails, setProjectDetails] = useState<Record<string, ProjectDetails>>({})

  useEffect(() => {
    if (!overview?.projects?.length) return
    const load = async () => {
      const results = await Promise.allSettled(
        overview.projects.map((p) => api.claudeConfig.getProjectDetails(p.dir_name))
      )
      const details: Record<string, ProjectDetails> = {}
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          details[overview.projects[i].dir_name] = r.value
        }
      })
      setProjectDetails(details)
    }
    load()
  }, [overview?.projects])

  const statsCards = [
    { label: t('claudeConfig.monitoring.messages'), value: overview?.total_messages ?? 0 },
    { label: t('claudeConfig.monitoring.toolCalls'), value: overview?.total_tool_calls ?? 0 },
    { label: t('claudeConfig.monitoring.sessions'), value: overview?.total_sessions ?? 0 },
    { label: t('claudeConfig.monitoring.activeDays'), value: overview?.active_days ?? 0 },
    { label: t('claudeConfig.monitoring.skills'), value: overview?.skills?.length ?? 0 },
    { label: t('claudeConfig.monitoring.mcpServers'), value: overview?.mcp_servers?.length ?? 0 },
    { label: t('claudeConfig.monitoring.plugins'), value: overview?.installed_plugins?.length ?? 0 },
    { label: t('claudeConfig.monitoring.projects'), value: overview?.projects?.length ?? 0 },
  ]

  return (
    <div className={styles.sectionWrap}>
      <SectionHeader icon="&#x1F4C8;" title={t('claudeConfig.monitoring.title')} />

      {/* Stats grid */}
      <div className={styles.cardGrid} style={{ marginBottom: 16 }}>
        {statsCards.map((s) => (
          <div key={s.label} className={styles.card}>
            <div className={styles.cardBody}>
              <div className={styles.formLabel}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--tc-foreground)', marginTop: 4 }}>
                {s.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Activity chart */}
      {overview && overview.daily_activity.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <ActivityChart data={overview.daily_activity} />
        </div>
      )}

      {/* Project grid */}
      {overview && overview.projects.length === 0 && (
        <EmptyState icon="\uD83D\uDCC2" title={t('claudeConfig.monitoring.noProjects', 'No projects')} />
      )}
      {overview && overview.projects.length > 0 && (
        <>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--tc-foreground)', marginBottom: 10 }}>
            {t('claudeConfig.monitoring.projectGrid')}
          </h3>
          <div className={styles.cardGrid}>
            {overview.projects.map((p) => {
              const details = projectDetails[p.dir_name]
              return (
                <div key={p.dir_name} className={styles.card}>
                  <div className={styles.cardBody}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span className={styles.listName}>{p.dir_name}</span>
                      {p.has_claude_md && <span className={styles.tagGreen}>CLAUDE.md</span>}
                      {p.has_memory && <span className={styles.tagBlue}>Memory</span>}
                    </div>
                    {details ? (
                      <div className={styles.listMeta}>
                        <div>{t('claudeConfig.monitoring.sessions')}: {details.session_count}</div>
                        <div>Last active: {details.last_active || '-'}</div>
                        {details.description && (
                          <div style={{ marginTop: 4 }}>{details.description}</div>
                        )}
                      </div>
                    ) : (
                      <div className={styles.listMeta}>{t('claudeConfig.about.loading')}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default SecMonitoring
