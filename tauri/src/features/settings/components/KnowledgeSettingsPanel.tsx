import { useState } from 'react'
import { Toggle } from '../../../ui/toggle'
import styles from '../settings.module.css'

interface KnowledgeConfig {
  max_entries: number
  auto_accumulate: boolean
  prompt_injection: boolean
  cleanup_strategy: string
}

const DEFAULT: KnowledgeConfig = {
  max_entries: 100,
  auto_accumulate: true,
  prompt_injection: true,
  cleanup_strategy: 'oldest_first',
}

const CLEANUP_OPTIONS = [
  { value: 'none',             label: '不自动清理' },
  { value: 'oldest_first',     label: '清理最旧条目' },
  { value: 'lowest_relevance', label: '清理低相关度' },
]

const MAX_ENTRIES_PRESETS = [50, 100, 200, 500]

interface KnowledgeSettingsPanelProps {
  value: string | null
  knowledgeCount: number
  onChange: (json: string) => void
  disabled?: boolean
}

export function KnowledgeSettingsPanel({ value, knowledgeCount, onChange, disabled }: KnowledgeSettingsPanelProps) {
  const [cfg, setCfg] = useState<KnowledgeConfig>(() => {
    if (!value) return DEFAULT
    try { return { ...DEFAULT, ...JSON.parse(value) } } catch { return DEFAULT }
  })

  const update = (patch: Partial<KnowledgeConfig>) => {
    const next = { ...cfg, ...patch }
    setCfg(next)
    onChange(JSON.stringify(next))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 4 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--tc-foreground)' }}>{knowledgeCount}</div>
          <div style={{ fontSize: 10, color: 'var(--tc-foreground-secondary)' }}>当前条目</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--tc-foreground)' }}>{cfg.max_entries}</div>
          <div style={{ fontSize: 10, color: 'var(--tc-foreground-secondary)' }}>上限</div>
        </div>
      </div>

      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>条目上限</span>
        <div className={styles.chipRow}>
          {MAX_ENTRIES_PRESETS.map((n) => (
            <button
              key={n}
              className={`${styles.chip} ${cfg.max_entries === n ? styles.chipActive : ''}`}
              onClick={() => update({ max_entries: n })}
              disabled={disabled}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>自动积累</span>
        <Toggle checked={cfg.auto_accumulate} onChange={(v) => update({ auto_accumulate: v })} disabled={disabled} />
      </div>

      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>注入 Prompt</span>
        <Toggle checked={cfg.prompt_injection} onChange={(v) => update({ prompt_injection: v })} disabled={disabled} />
      </div>

      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>清理策略</span>
        <select
          value={cfg.cleanup_strategy}
          onChange={(e) => update({ cleanup_strategy: e.target.value })}
          className={styles.fieldInput}
          style={{ width: 160 }}
          disabled={disabled}
        >
          {CLEANUP_OPTIONS.map(({ value: v, label }) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
