import { useState } from 'react'
import { Toggle } from '../../../ui/toggle'
import styles from '../settings.module.css'

interface DocLink {
  title: string
  url_or_path: string
  description: string
}

interface DocsConfig {
  links: DocLink[]
  auto_update_arch: boolean
}

const DEFAULT: DocsConfig = { links: [], auto_update_arch: false }

interface DocsPanelProps {
  value: string | null
  onChange: (json: string) => void
  disabled?: boolean
}

export function DocsPanel({ value, onChange, disabled }: DocsPanelProps) {
  const [cfg, setCfg] = useState<DocsConfig>(() => {
    if (!value) return DEFAULT
    try { return { ...DEFAULT, ...JSON.parse(value) } } catch { return DEFAULT }
  })
  const [adding, setAdding] = useState(false)
  const [newLink, setNewLink] = useState<DocLink>({ title: '', url_or_path: '', description: '' })

  const update = (patch: Partial<DocsConfig>) => {
    const next = { ...cfg, ...patch }
    setCfg(next)
    onChange(JSON.stringify(next))
  }

  const addLink = () => {
    if (!newLink.title || !newLink.url_or_path) return
    update({ links: [...cfg.links, newLink] })
    setNewLink({ title: '', url_or_path: '', description: '' })
    setAdding(false)
  }

  const removeLink = (i: number) => {
    update({ links: cfg.links.filter((_, idx) => idx !== i) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>自动更新架构文档</span>
        <Toggle checked={cfg.auto_update_arch} onChange={(v) => update({ auto_update_arch: v })} disabled={disabled} />
      </div>

      {cfg.links.map((link, i) => (
        <div key={i} style={{
          padding: '8px 12px', borderRadius: 8, border: '1px solid var(--tc-border)',
          background: 'var(--tc-content-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tc-foreground)' }}>{link.title}</div>
            <div style={{ fontSize: 10, color: 'var(--tc-accent)', fontFamily: 'monospace', marginTop: 2 }}>
              {link.url_or_path}
            </div>
            {link.description && (
              <div style={{ fontSize: 10, color: 'var(--tc-foreground-secondary)', marginTop: 2 }}>
                {link.description}
              </div>
            )}
          </div>
          <button
            onClick={() => removeLink(i)}
            disabled={disabled}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tc-foreground-secondary)', fontSize: 14 }}
          >
            ×
          </button>
        </div>
      ))}

      {adding ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, border: '1px dashed var(--tc-border)', borderRadius: 8 }}>
          <input placeholder="标题" value={newLink.title} onChange={(e) => setNewLink({ ...newLink, title: e.target.value })}
            className={styles.fieldInput} style={{ width: '100%' }} />
          <input placeholder="路径或 URL" value={newLink.url_or_path} onChange={(e) => setNewLink({ ...newLink, url_or_path: e.target.value })}
            className={styles.fieldInput} style={{ width: '100%' }} />
          <input placeholder="描述（可选）" value={newLink.description} onChange={(e) => setNewLink({ ...newLink, description: e.target.value })}
            className={styles.fieldInput} style={{ width: '100%' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={`${styles.chip} ${styles.chipActive}`} onClick={addLink}>确认</button>
            <button className={styles.chip} onClick={() => setAdding(false)}>取消</button>
          </div>
        </div>
      ) : (
        <button className={styles.chip} onClick={() => setAdding(true)} disabled={disabled} style={{ alignSelf: 'flex-start' }}>
          + 添加文档
        </button>
      )}
    </div>
  )
}
