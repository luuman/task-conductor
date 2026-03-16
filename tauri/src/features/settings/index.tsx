import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import { useTheme } from '../../ui/theme/useTheme'
import { useAuthStore } from '../../lib/store/auth'
import { api } from '../../lib/api'
import type { Settings } from '../../lib/api'
import styles from './settings.module.css'

const ALL_STAGES = ['input', 'analysis', 'prd', 'ui', 'plan', 'dev', 'test', 'deploy', 'monitor']

type TokenStatus = 'checking' | 'valid' | 'invalid'

export default function SettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { theme, setTheme, themes } = useTheme()
  const { logout } = useAuthStore()

  const [settings, setSettings] = useState<Settings | null>(null)
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>('checking')
  const [checking, setChecking] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [restarting, setRestarting] = useState(false)

  // 加载设置
  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {})
    checkToken()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const checkToken = useCallback(async () => {
    setChecking(true)
    setTokenStatus('checking')
    try {
      await api.healthCheck()
      setTokenStatus('valid')
    } catch {
      setTokenStatus('invalid')
    } finally {
      setChecking(false)
    }
  }, [])

  // 自动保存某个设置字段
  const updateSetting = useCallback(async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(prev => prev ? { ...prev, [key]: value } : prev)
    try {
      const updated = await api.updateSettings({ [key]: value })
      setSettings(updated)
    } catch {
      // 失败时重新加载
      api.getSettings().then(setSettings).catch(() => {})
    }
  }, [])

  const toggleApprovalStage = useCallback((stage: string) => {
    if (!settings) return
    const current = settings.pipeline_approval_stages
    const next = current.includes(stage)
      ? current.filter(s => s !== stage)
      : [...current, stage]
    updateSetting('pipeline_approval_stages', next)
  }, [settings, updateSetting])

  const handleChangePin = useCallback(async () => {
    if (!newPin || newPin.length < 4) return
    try {
      await api.updatePin(newPin)
      setNewPin('')
      alert(t('settings.security.pinUpdated'))
    } catch {
      alert(t('settings.security.pinFailed'))
    }
  }, [newPin, t])

  const handleExportDb = useCallback(async () => {
    try {
      const res = await api.exportDb()
      alert(`${t('settings.data.exportDb')}: ${res.path}\n${res.size_mb} MB`)
    } catch { /* */ }
  }, [t])

  const handleClearSessions = useCallback(async () => {
    if (!confirm(t('settings.data.clearSessionsConfirm'))) return
    try { await api.clearSessions() } catch { /* */ }
  }, [t])

  const handleClearTasks = useCallback(async () => {
    if (!confirm(t('settings.data.clearTasksConfirm'))) return
    try { await api.clearCompletedTasks() } catch { /* */ }
  }, [t])

  const handleRestart = useCallback(async () => {
    if (!confirm(t('settings.restart.confirm'))) return
    setRestarting(true)
    try { await api.restartService() } catch { /* */ }
    setTimeout(() => window.location.reload(), 3000)
  }, [t])

  const handleDisconnect = useCallback(() => {
    logout()
    navigate('/login')
  }, [logout, navigate])

  const handleLanguageChange = useCallback((lng: string) => {
    i18n.changeLanguage(lng)
    localStorage.setItem('tc_language', lng)
  }, [])

  if (!settings) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <p style={{ color: 'var(--tc-foreground-secondary)', fontSize: 13 }}>{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* 页面标题 */}
        <div className={styles.header}>
          <h1 className={styles.headerTitle}>{t('settings.title')}</h1>
          <p className={styles.headerHint}>{t('settings.hint')}</p>
        </div>

        {/* ── 外观设置 ── */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t('settings.appearance.title')}</h2>
            <p className={styles.sectionHint}>{t('settings.appearance.hint')}</p>
          </div>
          <div className={styles.sectionBody}>
            {/* 主题 */}
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>{t('settings.appearance.theme')}</span>
              <div className={styles.pillGroup}>
                {themes.map(name => (
                  <button
                    key={name}
                    className={theme === name ? styles.pillActive : styles.pill}
                    onClick={() => setTheme(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            {/* 语言 */}
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>{t('settings.appearance.language')}</span>
              <div className={styles.pillGroup}>
                {(['zh', 'en'] as const).map(lng => (
                  <button
                    key={lng}
                    className={i18n.language === lng ? styles.pillActive : styles.pill}
                    onClick={() => handleLanguageChange(lng)}
                  >
                    {t(`settings.appearance.lang_${lng}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── 通知设置 ── */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t('settings.notification.title')}</h2>
            <p className={styles.sectionHint}>{t('settings.notification.hint')}</p>
          </div>
          <div className={styles.sectionBody}>
            <ToggleRow
              label={t('settings.notification.ttsEnabled')}
              value={settings.notify_tts_enabled}
              onChange={v => updateSetting('notify_tts_enabled', v)}
            />
            {settings.notify_tts_enabled && (
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>{t('settings.notification.ttsPipePath')}</span>
                <input
                  className={styles.fieldInput}
                  value={settings.notify_tts_pipe_path}
                  onChange={e => updateSetting('notify_tts_pipe_path', e.target.value)}
                  placeholder="/path/to/speak-pipe"
                  spellCheck={false}
                />
              </div>
            )}
            <ToggleRow
              label={t('settings.notification.webhookEnabled')}
              value={settings.notify_webhook_enabled}
              onChange={v => updateSetting('notify_webhook_enabled', v)}
            />
            {settings.notify_webhook_enabled && (
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>{t('settings.notification.webhookUrl')}</span>
                <input
                  className={styles.fieldInput}
                  value={settings.notify_webhook_url}
                  onChange={e => updateSetting('notify_webhook_url', e.target.value)}
                  placeholder="https://hooks.example.com/..."
                  spellCheck={false}
                />
              </div>
            )}
            <ToggleRow
              label={t('settings.notification.browserEnabled')}
              value={settings.notify_browser_enabled}
              onChange={v => updateSetting('notify_browser_enabled', v)}
            />
          </div>
        </div>

        {/* ── 流水线配置 ── */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t('settings.pipeline.title')}</h2>
            <p className={styles.sectionHint}>{t('settings.pipeline.hint')}</p>
          </div>
          <div className={styles.sectionBody}>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>{t('settings.pipeline.approvalStages')}</span>
              <div className={styles.stageTags}>
                {ALL_STAGES.map(stage => (
                  <button
                    key={stage}
                    className={
                      settings.pipeline_approval_stages.includes(stage)
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
            <NumberRow
              label={t('settings.pipeline.maxRetries')}
              value={settings.pipeline_max_retries}
              onChange={v => updateSetting('pipeline_max_retries', v)}
              min={1} max={10}
            />
            <NumberRow
              label={t('settings.pipeline.confidenceThreshold')}
              value={settings.pipeline_confidence_threshold}
              onChange={v => updateSetting('pipeline_confidence_threshold', v)}
              min={0} max={1} step={0.1}
            />
          </div>
        </div>

        {/* ── 观测层设置 ── */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t('settings.observe.title')}</h2>
            <p className={styles.sectionHint}>{t('settings.observe.hint')}</p>
          </div>
          <div className={styles.sectionBody}>
            <NumberRow
              label={t('settings.observe.sessionLimit')}
              value={settings.observe_session_limit}
              onChange={v => updateSetting('observe_session_limit', v)}
              min={10} max={500}
            />
            <NumberRow
              label={t('settings.observe.eventLimit')}
              value={settings.observe_event_limit}
              onChange={v => updateSetting('observe_event_limit', v)}
              min={50} max={1000}
            />
            <ToggleRow
              label={t('settings.observe.autoCleanup')}
              value={settings.observe_auto_cleanup}
              onChange={v => updateSetting('observe_auto_cleanup', v)}
            />
            {settings.observe_auto_cleanup && (
              <NumberRow
                label={t('settings.observe.cleanupDays')}
                value={settings.observe_cleanup_days}
                onChange={v => updateSetting('observe_cleanup_days', v)}
                min={1} max={365}
              />
            )}
          </div>
        </div>

        {/* ── 界面偏好 ── */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t('settings.ui.title')}</h2>
            <p className={styles.sectionHint}>{t('settings.ui.hint')}</p>
          </div>
          <div className={styles.sectionBody}>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>{t('settings.ui.defaultPage')}</span>
              <div className={styles.pillGroup}>
                {['dashboard', 'sessions', 'chat'].map(page => (
                  <button
                    key={page}
                    className={settings.ui_default_page === page ? styles.pillActive : styles.pill}
                    onClick={() => updateSetting('ui_default_page', page)}
                  >
                    {t(`settings.ui.pages.${page}`)}
                  </button>
                ))}
              </div>
            </div>
            <NumberRow
              label={t('settings.ui.logMaxLines')}
              value={settings.ui_log_max_lines}
              onChange={v => updateSetting('ui_log_max_lines', v)}
              min={100} max={5000} step={100}
            />
          </div>
        </div>

        {/* ── 安全设置 ── */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t('settings.security.title')}</h2>
            <p className={styles.sectionHint}>{t('settings.security.hint')}</p>
          </div>
          <div className={styles.sectionBody}>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>{t('settings.security.changePin')}</span>
              <div className={styles.inlineRow}>
                <input
                  type="password"
                  className={styles.fieldInput}
                  value={newPin}
                  onChange={e => setNewPin(e.target.value)}
                  placeholder={t('settings.security.newPinPlaceholder')}
                  style={{ flex: 1 }}
                />
                <button
                  className={styles.actionBtnPrimary}
                  onClick={handleChangePin}
                  disabled={!newPin || newPin.length < 4}
                >
                  {t('settings.security.updatePin')}
                </button>
              </div>
            </div>
            <ToggleRow
              label={t('settings.security.tunnelEnabled')}
              value={settings.security_tunnel_enabled}
              onChange={v => updateSetting('security_tunnel_enabled', v)}
            />
          </div>
        </div>

        {/* ── 数据管理 ── */}
        <div className={styles.sectionWarning}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t('settings.data.title')}</h2>
            <p className={styles.sectionHint}>{t('settings.data.hint')}</p>
          </div>
          <div>
            <div className={styles.actionRow}>
              <div className={styles.actionInfo}>
                <p className={styles.actionLabel}>{t('settings.data.exportDb')}</p>
                <p className={styles.actionHint}>{t('settings.data.exportDbHint')}</p>
              </div>
              <button className={styles.actionBtnPrimary} onClick={handleExportDb}>
                {t('settings.data.export')}
              </button>
            </div>
            <div className={styles.actionRow}>
              <div className={styles.actionInfo}>
                <p className={styles.actionLabel}>{t('settings.data.clearSessions')}</p>
                <p className={styles.actionHint}>{t('settings.data.clearSessionsHint')}</p>
              </div>
              <button className={styles.actionBtnWarning} onClick={handleClearSessions}>
                {t('settings.data.clear')}
              </button>
            </div>
            <div className={styles.actionRow}>
              <div className={styles.actionInfo}>
                <p className={styles.actionLabel}>{t('settings.data.clearTasks')}</p>
                <p className={styles.actionHint}>{t('settings.data.clearTasksHint')}</p>
              </div>
              <button className={styles.actionBtnWarning} onClick={handleClearTasks}>
                {t('settings.data.clear')}
              </button>
            </div>
          </div>
        </div>

        {/* ── 连接信息 ── */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t('settings.connection.title')}</h2>
          </div>
          <div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{t('settings.connection.tokenStatus')}</span>
              <div className={styles.infoValue}>
                <span className={
                  tokenStatus === 'valid' ? styles.statusGreen :
                  tokenStatus === 'invalid' ? styles.statusRed : styles.statusYellow
                } />
                <span className={
                  tokenStatus === 'valid' ? styles.statusTextGreen :
                  tokenStatus === 'invalid' ? styles.statusTextRed : styles.statusTextYellow
                }>
                  {tokenStatus === 'valid' ? t('settings.connection.valid') :
                   tokenStatus === 'invalid' ? t('settings.connection.invalid') :
                   t('settings.connection.verifying')}
                </span>
                <button
                  className={styles.recheckLink}
                  onClick={checkToken}
                  disabled={checking}
                >
                  {t('settings.connection.reVerify')}
                </button>
              </div>
            </div>
            <div className={styles.actionRow}>
              <div className={styles.actionInfo}>
                <p className={styles.actionLabel}>{t('settings.connection.disconnect')}</p>
                <p className={styles.actionHint}>{t('settings.connection.disconnectHint')}</p>
              </div>
              <button className={styles.actionBtnDanger} onClick={handleDisconnect}>
                {t('settings.connection.disconnectBtn')}
              </button>
            </div>
          </div>
        </div>

        {/* ── 重启服务 ── */}
        <div className={styles.sectionDanger}>
          <div className={styles.actionRow}>
            <div className={styles.actionInfo}>
              <p className={styles.actionLabel} style={{ fontWeight: 600 }}>{t('settings.restart.title')}</p>
              <p className={styles.actionHint}>{t('settings.restart.hint')}</p>
            </div>
            <button
              className={styles.actionBtnWarning}
              onClick={handleRestart}
              disabled={restarting}
            >
              {restarting ? t('settings.restart.restarting') : t('settings.restart.title')}
            </button>
          </div>
        </div>

        {/* 底部留白 */}
        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}

/* ── 子组件 ── */

function ToggleRow({ label, value, onChange }: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className={styles.toggleRow}>
      <span className={styles.toggleLabel}>{label}</span>
      <button
        className={value ? styles.toggleOn : styles.toggleOff}
        onClick={() => onChange(!value)}
      >
        <span className={value ? styles.toggleKnobOn : styles.toggleKnobOff} />
      </button>
    </div>
  )
}

function NumberRow({ label, value, onChange, min, max, step = 1 }: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
}) {
  return (
    <div className={styles.numberRow}>
      <span className={styles.toggleLabel}>{label}</span>
      <input
        type="number"
        className={styles.numberInput}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
      />
    </div>
  )
}
