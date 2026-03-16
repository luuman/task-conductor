import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import { useTheme } from '../../ui/theme/useTheme'
import { Toggle } from '../../ui/toggle'
import { useAuthStore } from '../../lib/store/auth'
import { api } from '../../lib/api'
import type { Settings } from '../../lib/api'
import styles from './settings.module.css'

const ALL_STAGES = ['input', 'analysis', 'prd', 'ui', 'plan', 'dev', 'test', 'deploy', 'monitor']

const DEFAULT_SETTINGS: Settings = {
  workspace_root: '',
  feishu_app_id: '', feishu_app_secret: '', feishu_owner_id: '', feishu_default_chat_id: '',
  notify_tts_enabled: true, notify_tts_pipe_path: '', notify_webhook_url: '',
  notify_webhook_enabled: false, notify_browser_enabled: true,
  pipeline_approval_stages: ['analysis', 'prd', 'ui', 'plan', 'test', 'deploy'],
  pipeline_max_retries: 3, pipeline_confidence_threshold: 0.5,
  observe_session_limit: 50, observe_event_limit: 200,
  observe_auto_cleanup: false, observe_cleanup_days: 30,
  ui_theme: 'dark', ui_sidebar_collapsed: false, ui_default_page: 'dashboard', ui_log_max_lines: 500,
  security_tunnel_enabled: false,
}

type TokenStatus = 'checking' | 'valid' | 'invalid'
type ActionStatus = 'idle' | 'loading' | 'ok' | 'error'

export default function SettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { theme, setTheme, themes } = useTheme()
  const { logout } = useAuthStore()

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>('checking')
  const [checking, setChecking] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [pinStatus, setPinStatus] = useState<ActionStatus>('idle')
  const [exportStatus, setExportStatus] = useState<ActionStatus>('idle')
  const [clearSessionStatus, setClearSessionStatus] = useState<ActionStatus>('idle')
  const [clearTaskStatus, setClearTaskStatus] = useState<ActionStatus>('idle')
  const [restartStatus, setRestartStatus] = useState<ActionStatus>('idle')
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }, [])

  // 加载设置
  useEffect(() => {
    api.getSettings()
      .then(s => { setSettings(s); setLoaded(true) })
      .catch(() => setLoaded(true))
    checkToken()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const checkToken = useCallback(async () => {
    setChecking(true)
    setTokenStatus('checking')
    try {
      const ok = await api.healthCheck()
      setTokenStatus(ok ? 'valid' : 'invalid')
    } catch {
      setTokenStatus('invalid')
    } finally {
      setChecking(false)
    }
  }, [])

  // 保存单个设置字段（用于 toggle / pill 等即时操作）
  const updateSetting = useCallback(async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    const prev = { ...settings }
    setSettings(s => ({ ...s, [key]: value }))
    try {
      const updated = await api.updateSettings({ [key]: value })
      setSettings(updated)
      showToast(t('settings.toast.saved'))
    } catch {
      setSettings(prev)
      showToast(t('settings.toast.saveFailed'))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, showToast, t])

  const toggleApprovalStage = useCallback((stage: string) => {
    const current = settings.pipeline_approval_stages
    const next = current.includes(stage)
      ? current.filter(s => s !== stage)
      : [...current, stage]
    updateSetting('pipeline_approval_stages', next)
  }, [settings.pipeline_approval_stages, updateSetting])

  // ── 操作按钮 handlers ──

  const handleChangePin = useCallback(async () => {
    if (!newPin || newPin.length < 4) return
    setPinStatus('loading')
    try {
      await api.updatePin(newPin)
      setNewPin('')
      setPinStatus('ok')
      showToast(t('settings.security.pinUpdated'))
      setTimeout(() => setPinStatus('idle'), 2000)
    } catch {
      setPinStatus('error')
      showToast(t('settings.security.pinFailed'))
      setTimeout(() => setPinStatus('idle'), 2000)
    }
  }, [newPin, showToast, t])

  const handleExportDb = useCallback(async () => {
    setExportStatus('loading')
    try {
      const res = await api.exportDb()
      setExportStatus('ok')
      showToast(`${t('settings.data.exportDb')}: ${res.path} (${res.size_mb} MB)`)
      setTimeout(() => setExportStatus('idle'), 2000)
    } catch {
      setExportStatus('error')
      showToast(t('settings.toast.saveFailed'))
      setTimeout(() => setExportStatus('idle'), 2000)
    }
  }, [showToast, t])

  const handleClearSessions = useCallback(async () => {
    if (!confirm(t('settings.data.clearSessionsConfirm'))) return
    setClearSessionStatus('loading')
    try {
      await api.clearSessions()
      setClearSessionStatus('ok')
      showToast(t('settings.toast.cleared'))
      setTimeout(() => setClearSessionStatus('idle'), 2000)
    } catch {
      setClearSessionStatus('error')
      showToast(t('settings.toast.saveFailed'))
      setTimeout(() => setClearSessionStatus('idle'), 2000)
    }
  }, [showToast, t])

  const handleClearTasks = useCallback(async () => {
    if (!confirm(t('settings.data.clearTasksConfirm'))) return
    setClearTaskStatus('loading')
    try {
      const res = await api.clearCompletedTasks()
      setClearTaskStatus('ok')
      showToast(`${t('settings.toast.cleared')} (${res.count})`)
      setTimeout(() => setClearTaskStatus('idle'), 2000)
    } catch {
      setClearTaskStatus('error')
      showToast(t('settings.toast.saveFailed'))
      setTimeout(() => setClearTaskStatus('idle'), 2000)
    }
  }, [showToast, t])

  const handleRestart = useCallback(async () => {
    if (!confirm(t('settings.restart.confirm'))) return
    setRestartStatus('loading')
    try { await api.restartService() } catch { /* expected */ }
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

  if (!loaded) {
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
        {/* Toast */}
        {toast && <div className={styles.toast}>{toast}</div>}

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
              <DebouncedInput
                label={t('settings.notification.ttsPipePath')}
                value={settings.notify_tts_pipe_path}
                onSave={v => updateSetting('notify_tts_pipe_path', v)}
                placeholder="/path/to/speak-pipe"
              />
            )}
            <ToggleRow
              label={t('settings.notification.webhookEnabled')}
              value={settings.notify_webhook_enabled}
              onChange={v => updateSetting('notify_webhook_enabled', v)}
            />
            {settings.notify_webhook_enabled && (
              <DebouncedInput
                label={t('settings.notification.webhookUrl')}
                value={settings.notify_webhook_url}
                onSave={v => updateSetting('notify_webhook_url', v)}
                placeholder="https://hooks.example.com/..."
              />
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
            <DebouncedNumber
              label={t('settings.pipeline.maxRetries')}
              value={settings.pipeline_max_retries}
              onSave={v => updateSetting('pipeline_max_retries', v)}
              min={1} max={10}
            />
            <DebouncedNumber
              label={t('settings.pipeline.confidenceThreshold')}
              value={settings.pipeline_confidence_threshold}
              onSave={v => updateSetting('pipeline_confidence_threshold', v)}
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
            <DebouncedNumber
              label={t('settings.observe.sessionLimit')}
              value={settings.observe_session_limit}
              onSave={v => updateSetting('observe_session_limit', v)}
              min={10} max={500}
            />
            <DebouncedNumber
              label={t('settings.observe.eventLimit')}
              value={settings.observe_event_limit}
              onSave={v => updateSetting('observe_event_limit', v)}
              min={50} max={1000}
            />
            <ToggleRow
              label={t('settings.observe.autoCleanup')}
              value={settings.observe_auto_cleanup}
              onChange={v => updateSetting('observe_auto_cleanup', v)}
            />
            {settings.observe_auto_cleanup && (
              <DebouncedNumber
                label={t('settings.observe.cleanupDays')}
                value={settings.observe_cleanup_days}
                onSave={v => updateSetting('observe_cleanup_days', v)}
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
            <DebouncedNumber
              label={t('settings.ui.logMaxLines')}
              value={settings.ui_log_max_lines}
              onSave={v => updateSetting('ui_log_max_lines', v)}
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
                  onKeyDown={e => e.key === 'Enter' && handleChangePin()}
                  placeholder={t('settings.security.newPinPlaceholder')}
                  style={{ flex: 1 }}
                />
                <button
                  className={styles.actionBtnPrimary}
                  onClick={handleChangePin}
                  disabled={!newPin || newPin.length < 4 || pinStatus === 'loading'}
                >
                  {pinStatus === 'loading' ? t('settings.toast.saving')
                    : pinStatus === 'ok' ? t('settings.toast.saved')
                    : t('settings.security.updatePin')}
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
              <button
                className={styles.actionBtnPrimary}
                onClick={handleExportDb}
                disabled={exportStatus === 'loading'}
              >
                {exportStatus === 'loading' ? t('settings.toast.saving')
                  : exportStatus === 'ok' ? t('settings.toast.done')
                  : t('settings.data.export')}
              </button>
            </div>
            <div className={styles.actionRow}>
              <div className={styles.actionInfo}>
                <p className={styles.actionLabel}>{t('settings.data.clearSessions')}</p>
                <p className={styles.actionHint}>{t('settings.data.clearSessionsHint')}</p>
              </div>
              <button
                className={styles.actionBtnWarning}
                onClick={handleClearSessions}
                disabled={clearSessionStatus === 'loading'}
              >
                {clearSessionStatus === 'loading' ? t('settings.toast.saving')
                  : clearSessionStatus === 'ok' ? t('settings.toast.done')
                  : t('settings.data.clear')}
              </button>
            </div>
            <div className={styles.actionRow}>
              <div className={styles.actionInfo}>
                <p className={styles.actionLabel}>{t('settings.data.clearTasks')}</p>
                <p className={styles.actionHint}>{t('settings.data.clearTasksHint')}</p>
              </div>
              <button
                className={styles.actionBtnWarning}
                onClick={handleClearTasks}
                disabled={clearTaskStatus === 'loading'}
              >
                {clearTaskStatus === 'loading' ? t('settings.toast.saving')
                  : clearTaskStatus === 'ok' ? t('settings.toast.done')
                  : t('settings.data.clear')}
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
                  {checking ? t('settings.connection.verifying') : t('settings.connection.reVerify')}
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
              disabled={restartStatus === 'loading'}
            >
              {restartStatus === 'loading' ? t('settings.restart.restarting') : t('settings.restart.title')}
            </button>
          </div>
        </div>

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

/** 文本输入：本地编辑，blur / Enter 时才保存到后端 */
function DebouncedInput({ label, value, onSave, placeholder }: {
  label: string
  value: string
  onSave: (v: string) => void
  placeholder?: string
}) {
  const [local, setLocal] = useState(value)
  const dirty = local !== value

  useEffect(() => { setLocal(value) }, [value])

  const commit = () => {
    if (dirty) onSave(local)
  }

  return (
    <div className={styles.fieldGroup}>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        className={`${styles.fieldInput} ${dirty ? styles.fieldInputDirty : ''}`}
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => e.key === 'Enter' && commit()}
        placeholder={placeholder}
        spellCheck={false}
      />
    </div>
  )
}

/** 数字输入：本地编辑，blur / Enter 时才保存到后端 */
function DebouncedNumber({ label, value, onSave, min, max, step = 1 }: {
  label: string
  value: number
  onSave: (v: number) => void
  min: number
  max: number
  step?: number
}) {
  const [local, setLocal] = useState(value)
  const dirty = local !== value

  useEffect(() => { setLocal(value) }, [value])

  const commit = () => {
    if (dirty) {
      const clamped = Math.min(max, Math.max(min, local))
      setLocal(clamped)
      onSave(clamped)
    }
  }

  return (
    <div className={styles.numberRow}>
      <span className={styles.toggleLabel}>{label}</span>
      <input
        type="number"
        className={`${styles.numberInput} ${dirty ? styles.numberInputDirty : ''}`}
        value={local}
        onChange={e => setLocal(Number(e.target.value))}
        onBlur={commit}
        onKeyDown={e => e.key === 'Enter' && commit()}
        min={min}
        max={max}
        step={step}
      />
    </div>
  )
}
