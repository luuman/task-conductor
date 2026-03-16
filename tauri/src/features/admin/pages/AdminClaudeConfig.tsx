import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../../ui/skeleton/Skeleton'
import { Toggle } from '../../../ui/toggle'
import { api } from '../../../lib/api'
import type { Settings, ClaudeUsage } from '../../../lib/api/types'
import styles from '../admin.module.css'

const ALL_STAGES = ['input', 'analysis', 'prd', 'ui', 'plan', 'dev', 'test', 'deploy', 'monitor']

export default function AdminClaudeConfig() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [usage, setUsage] = useState<ClaudeUsage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }, [])

  useEffect(() => {
    Promise.all([
      api.getSettings().catch(() => null),
      api.getClaudeUsage().catch(() => null),
    ]).then(([s, u]) => {
      if (s) setSettings(s)
      else setError('Failed to load settings')
      setUsage(u)
    })
  }, [])

  const loading = settings === null && error === null

  const updateSetting = useCallback(async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    if (!settings) return
    const prev = { ...settings }
    const next = { ...settings, [key]: value }
    setSettings(next)
    try {
      const updated = await api.updateSettings({ [key]: value })
      setSettings(updated)
      showToast(t('settings.toast.saved'))
    } catch {
      setSettings(prev)
      showToast(t('settings.toast.saveFailed'))
    }
  }, [settings, showToast, t])

  const toggleApprovalStage = useCallback((stage: string) => {
    if (!settings) return
    const current = settings.pipeline_approval_stages
    const next = current.includes(stage)
      ? current.filter(s => s !== stage)
      : [...current, stage]
    updateSetting('pipeline_approval_stages', next)
  }, [settings, updateSetting])

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {toast && <div className={styles.toast}>{toast}</div>}

        <div className={styles.header}>
          <h1 className={styles.headerTitle}>{t('admin.claude_config.title')}</h1>
          <p className={styles.headerHint}>{t('admin.claude_config.hint')}</p>
        </div>

        {error && <p style={{ color: 'var(--tc-error)', fontSize: 13 }}>{error}</p>}

        {/* Claude 使用统计 */}
        <div className={styles.kpiGrid}>
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className={styles.kpiCard}>
                  <Skeleton variant="text" width="60%" height={12} />
                  <Skeleton variant="text" width="40%" height={24} />
                </div>
              ))
            : <>
                <div className={styles.kpiCard}>
                  <span className={styles.kpiLabel}>{t('admin.claude_config.total_sessions')}</span>
                  <span className={styles.kpiValue}>{usage?.sessions.total ?? 0}</span>
                </div>
                <div className={styles.kpiCard}>
                  <span className={styles.kpiLabel}>{t('admin.claude_config.active_sessions')}</span>
                  <span className={styles.kpiValue}>{usage?.sessions.active ?? 0}</span>
                </div>
                <div className={styles.kpiCard}>
                  <span className={styles.kpiLabel}>{t('admin.claude_config.recent_tools')}</span>
                  <span className={styles.kpiValue}>{usage?.recent_tools.length ?? 0}</span>
                </div>
              </>
          }
        </div>

        {/* 流水线审批阶段 */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>{t('settings.pipeline.title')}</div>
            <div className={styles.sectionHint}>{t('settings.pipeline.hint')}</div>
          </div>
          <div className={styles.sectionBody}>
            {loading
              ? Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className={styles.formRow}>
                    <Skeleton variant="text" width="30%" height={12} />
                    <Skeleton variant="rect" width={200} height={28} borderRadius={6} />
                  </div>
                ))
              : <>
                  <div className={styles.formCol}>
                    <span className={styles.fieldLabel}>{t('settings.pipeline.approvalStages')}</span>
                    <div className={styles.stageTags}>
                      {ALL_STAGES.map(stage => (
                        <button
                          key={stage}
                          className={
                            settings?.pipeline_approval_stages.includes(stage)
                              ? styles.stageTagActive
                              : styles.stageTag
                          }
                          onClick={() => toggleApprovalStage(stage)}
                        >
                          {stage}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.perfLabel}>{t('settings.pipeline.maxRetries')}</span>
                    <span className={styles.perfValue}>{settings?.pipeline_max_retries}</span>
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.perfLabel}>{t('settings.pipeline.confidenceThreshold')}</span>
                    <span className={styles.perfValue}>{settings?.pipeline_confidence_threshold}</span>
                  </div>
                </>
            }
          </div>
        </div>

        {/* 观测层配置 */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>{t('settings.observe.title')}</div>
            <div className={styles.sectionHint}>{t('settings.observe.hint')}</div>
          </div>
          <div className={styles.sectionBody}>
            {loading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className={styles.formRow}>
                    <Skeleton variant="text" width="30%" height={12} />
                    <Skeleton variant="rect" width={40} height={20} borderRadius={10} />
                  </div>
                ))
              : <>
                  <div className={styles.formRow}>
                    <span className={styles.perfLabel}>{t('settings.observe.sessionLimit')}</span>
                    <span className={styles.perfValue}>{settings?.observe_session_limit}</span>
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.perfLabel}>{t('settings.observe.eventLimit')}</span>
                    <span className={styles.perfValue}>{settings?.observe_event_limit}</span>
                  </div>
                  <div className={styles.toggleRow}>
                    <span className={styles.perfLabel}>{t('settings.observe.autoCleanup')}</span>
                    <Toggle
                      checked={settings?.observe_auto_cleanup ?? false}
                      onChange={v => updateSetting('observe_auto_cleanup', v)}
                    />
                  </div>
                </>
            }
          </div>
        </div>

        {/* 通知配置 */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>{t('settings.notification.title')}</div>
            <div className={styles.sectionHint}>{t('settings.notification.hint')}</div>
          </div>
          <div className={styles.sectionBody}>
            {loading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className={styles.formRow}>
                    <Skeleton variant="text" width="30%" height={12} />
                    <Skeleton variant="rect" width={40} height={20} borderRadius={10} />
                  </div>
                ))
              : <>
                  <div className={styles.toggleRow}>
                    <span className={styles.perfLabel}>{t('settings.notification.ttsEnabled')}</span>
                    <Toggle
                      checked={settings?.notify_tts_enabled ?? false}
                      onChange={v => updateSetting('notify_tts_enabled', v)}
                    />
                  </div>
                  <div className={styles.toggleRow}>
                    <span className={styles.perfLabel}>{t('settings.notification.webhookEnabled')}</span>
                    <Toggle
                      checked={settings?.notify_webhook_enabled ?? false}
                      onChange={v => updateSetting('notify_webhook_enabled', v)}
                    />
                  </div>
                  <div className={styles.toggleRow}>
                    <span className={styles.perfLabel}>{t('settings.notification.browserEnabled')}</span>
                    <Toggle
                      checked={settings?.notify_browser_enabled ?? false}
                      onChange={v => updateSetting('notify_browser_enabled', v)}
                    />
                  </div>
                </>
            }
          </div>
        </div>
      </div>
    </div>
  )
}
