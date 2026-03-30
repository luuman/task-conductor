import { useState } from 'react'
import styles from '../settings.module.css'

interface ClaudeRuntimeConfig {
  timeout_seconds: number
  max_retries: number
  model: string
  region: 'global' | 'cn'
}

const DEFAULT: ClaudeRuntimeConfig = {
  timeout_seconds: 120,
  max_retries: 1,
  model: 'claude-sonnet-4-6',
  region: 'global',
}

const TIMEOUT_PRESETS = [60, 120, 240]
const RETRY_PRESETS = [0, 1, 2, 3]
const MODEL_OPTIONS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
]

interface ClaudeRuntimePanelProps {
  value: string | null
  onChange: (json: string) => void
  disabled?: boolean
}

export function ClaudeRuntimePanel({ value, onChange, disabled }: ClaudeRuntimePanelProps) {
  const [cfg, setCfg] = useState<ClaudeRuntimeConfig>(() => {
    if (!value) return DEFAULT
    try { return { ...DEFAULT, ...JSON.parse(value) } } catch { return DEFAULT }
  })

  const update = (patch: Partial<ClaudeRuntimeConfig>) => {
    const next = { ...cfg, ...patch }
    setCfg(next)
    onChange(JSON.stringify(next))
  }

  const isCn = cfg.region === 'cn'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>区域</span>
        <div className={styles.chipRow}>
          {(['global', 'cn'] as const).map((r) => (
            <button
              key={r}
              className={`${styles.chip} ${cfg.region === r ? styles.chipActive : ''}`}
              onClick={() => {
                const patch: Partial<ClaudeRuntimeConfig> = { region: r }
                if (r === 'cn' && cfg.timeout_seconds < 240) {
                  patch.timeout_seconds = 240
                }
                update(patch)
              }}
              disabled={disabled}
              style={r === 'cn' && cfg.region === 'cn' ? { borderColor: '#fbbf24', color: '#fbbf24' } : undefined}
            >
              {r === 'cn' ? '🇨🇳 中国区' : '🌐 全球'}
            </button>
          ))}
        </div>
        {isCn && (
          <span style={{ fontSize: 10, color: '#fbbf24', marginLeft: 4 }}>
            中国区建议 ≥ 240s
          </span>
        )}
      </div>

      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>超时时间</span>
        <div className={styles.chipRow}>
          {TIMEOUT_PRESETS.map((t) => (
            <button
              key={t}
              className={`${styles.chip} ${cfg.timeout_seconds === t ? styles.chipActive : ''}`}
              onClick={() => update({ timeout_seconds: t })}
              disabled={disabled}
              style={isCn && t === 240 ? { borderColor: '#fbbf2460' } : undefined}
            >
              {t}s{isCn && t === 240 ? ' ✓' : ''}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>重试次数</span>
        <div className={styles.chipRow}>
          {RETRY_PRESETS.map((n) => (
            <button
              key={n}
              className={`${styles.chip} ${cfg.max_retries === n ? styles.chipActive : ''}`}
              onClick={() => update({ max_retries: n })}
              disabled={disabled}
            >
              {n === 0 ? '不重试' : `${n} 次`}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>模型</span>
        <select
          value={cfg.model}
          onChange={(e) => update({ model: e.target.value })}
          className={styles.fieldInput}
          disabled={disabled}
          style={{ width: 240 }}
        >
          {MODEL_OPTIONS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
