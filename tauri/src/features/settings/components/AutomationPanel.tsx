import { useState } from 'react'
import { Toggle } from '../../../ui/toggle'
import styles from '../settings.module.css'

interface AutomationConfig {
  enabled: boolean
  time_from: string
  time_to: string
  weekdays: number[]  // 0=Mon,1=Tue,...,6=Sun
  max_concurrent: number
}

const DEFAULT: AutomationConfig = {
  enabled: false,
  time_from: '09:00',
  time_to: '22:00',
  weekdays: [0, 1, 2, 3, 4],
  max_concurrent: 2,
}

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']
const CONCURRENT_PRESETS = [1, 2, 3, 5]

interface AutomationPanelProps {
  value: string | null
  onChange: (json: string) => void
  disabled?: boolean
}

export function AutomationPanel({ value, onChange, disabled }: AutomationPanelProps) {
  const [cfg, setCfg] = useState<AutomationConfig>(() => {
    if (!value) return DEFAULT
    try { return { ...DEFAULT, ...JSON.parse(value) } } catch { return DEFAULT }
  })

  const update = (patch: Partial<AutomationConfig>) => {
    const next = { ...cfg, ...patch }
    setCfg(next)
    onChange(JSON.stringify(next))
  }

  const toggleWeekday = (day: number) => {
    const days = cfg.weekdays.includes(day)
      ? cfg.weekdays.filter((d) => d !== day)
      : [...cfg.weekdays, day].sort()
    update({ weekdays: days })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>启用自动化</span>
        <Toggle checked={cfg.enabled} onChange={(v) => update({ enabled: v })} disabled={disabled} />
      </div>

      {cfg.enabled && (
        <>
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>执行时段</span>
            <input
              type="time"
              value={cfg.time_from}
              onChange={(e) => update({ time_from: e.target.value })}
              className={styles.fieldInput}
              disabled={disabled}
            />
            <span style={{ color: 'var(--tc-foreground-secondary)', fontSize: 12 }}>—</span>
            <input
              type="time"
              value={cfg.time_to}
              onChange={(e) => update({ time_to: e.target.value })}
              className={styles.fieldInput}
              disabled={disabled}
            />
          </div>

          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>执行星期</span>
            <div className={styles.weekdayGrid}>
              {WEEKDAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  className={`${styles.weekdayBtn} ${cfg.weekdays.includes(i) ? styles.weekdayBtnActive : ''}`}
                  onClick={() => toggleWeekday(i)}
                  disabled={disabled}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>最大并发</span>
            <div className={styles.chipRow}>
              {CONCURRENT_PRESETS.map((n) => (
                <button
                  key={n}
                  className={`${styles.chip} ${cfg.max_concurrent === n ? styles.chipActive : ''}`}
                  onClick={() => update({ max_concurrent: n })}
                  disabled={disabled}
                >
                  {n} 个
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
