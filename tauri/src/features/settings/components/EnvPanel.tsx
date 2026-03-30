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
      <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)' }}>
        无 TC_ 前缀环境变量配置
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {tcVars.map(([key, value]) => (
        <div key={key} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 8px', borderRadius: 6,
          background: 'var(--tc-content-bg)',
          border: '1px solid var(--tc-border)',
          fontSize: 11,
        }}>
          <span style={{ fontFamily: 'monospace', color: 'var(--tc-accent)', minWidth: 160 }}>{key}</span>
          <span style={{ fontFamily: 'monospace', color: 'var(--tc-foreground-secondary)' }}>
            {maskValue(key, value)}
          </span>
        </div>
      ))}
    </div>
  )
}
