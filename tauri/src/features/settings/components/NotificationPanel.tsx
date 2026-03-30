import { useState } from 'react'
import { Toggle } from '../../../ui/toggle'
import styles from '../settings.module.css'

interface NotificationConfig {
  tts_enabled: boolean
  webhook_enabled: boolean
  webhook_url: string
  triggers: string[]
}

const DEFAULT: NotificationConfig = {
  tts_enabled: true,
  webhook_enabled: false,
  webhook_url: '',
  triggers: ['approval', 'task_fail'],
}

const TRIGGER_OPTIONS = [
  { value: 'approval',       label: '需审批' },
  { value: 'task_complete',  label: '任务完成' },
  { value: 'task_fail',      label: '任务失败' },
  { value: 'stage_advance',  label: '阶段推进' },
]

interface NotificationPanelProps {
  value: string | null
  onChange: (json: string) => void
  disabled?: boolean
}

export function NotificationPanel({ value, onChange, disabled }: NotificationPanelProps) {
  const [cfg, setCfg] = useState<NotificationConfig>(() => {
    if (!value) return DEFAULT
    try { return { ...DEFAULT, ...JSON.parse(value) } } catch { return DEFAULT }
  })

  const update = (patch: Partial<NotificationConfig>) => {
    const next = { ...cfg, ...patch }
    setCfg(next)
    onChange(JSON.stringify(next))
  }

  const toggleTrigger = (t: string) => {
    const triggers = cfg.triggers.includes(t)
      ? cfg.triggers.filter((x) => x !== t)
      : [...cfg.triggers, t]
    update({ triggers })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>语音播报</span>
        <Toggle checked={cfg.tts_enabled} onChange={(v) => update({ tts_enabled: v })} disabled={disabled} />
      </div>

      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>Webhook</span>
        <Toggle checked={cfg.webhook_enabled} onChange={(v) => update({ webhook_enabled: v })} disabled={disabled} />
      </div>

      {cfg.webhook_enabled && (
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Webhook URL</span>
          <input
            type="url"
            value={cfg.webhook_url}
            onChange={(e) => update({ webhook_url: e.target.value })}
            placeholder="https://..."
            className={styles.fieldInput}
            style={{ width: 280 }}
            disabled={disabled}
          />
        </div>
      )}

      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>触发时机</span>
        <div className={styles.chipRow}>
          {TRIGGER_OPTIONS.map(({ value: t, label }) => (
            <button
              key={t}
              className={`${styles.chip} ${cfg.triggers.includes(t) ? styles.chipActive : ''}`}
              onClick={() => toggleTrigger(t)}
              disabled={disabled}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
