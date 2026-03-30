import styles from '../settings.module.css'

const SENSITIVE_KEYS = ['PIN', 'TOKEN', 'SECRET', 'KEY', 'PASSWORD', 'AUTH']

function maskValue(key: string, value: string): string {
  const upper = key.toUpperCase()
  if (SENSITIVE_KEYS.some((k) => upper.includes(k))) {
    return value.length > 4 ? `${'*'.repeat(value.length - 4)}${value.slice(-4)}` : '****'
  }
  return value
}

interface EnvPanelProps {
  envConfig: string | null
}

export function EnvPanel({ envConfig }: EnvPanelProps) {
  let vars: Record<string, string> = {}
  if (envConfig) {
    try { vars = JSON.parse(envConfig) } catch { /* ignore */ }
  }

  const tcVars = Object.entries(vars).filter(([k]) => k.startsWith('TC_'))

  if (!tcVars.length) {
    return (
      <div className={styles.emptyHint}>
        无 TC_ 前缀环境变量配置
      </div>
    )
  }

  return (
    <div className={styles.envList}>
      {tcVars.map(([key, value]) => (
        <div key={key} className={styles.envRow}>
          <span className={styles.envKey}>{key}</span>
          <span className={styles.envValue}>{maskValue(key, value)}</span>
        </div>
      ))}
    </div>
  )
}
