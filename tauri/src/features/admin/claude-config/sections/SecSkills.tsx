import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../../../lib/api'
import type { ClaudeConfig, ClaudeOverview, SkillDetail } from '../../../../lib/api/types'
import { Toggle } from '../../../../ui/toggle'
import { EmptyState } from '../../../../ui/empty-state'
import { SectionHeader, DetailPanel } from '../shared'
import styles from '../claude-config.module.css'

interface SectionProps {
  config: ClaudeConfig | null
  overview: ClaudeOverview | null
  onConfigUpdate: (c: ClaudeConfig) => void
  showToast: (msg: string) => void
}

export function SecSkills({ showToast }: SectionProps) {
  const { t } = useTranslation()
  const [skills, setSkills] = useState<SkillDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await api.claudeConfig.getSkills()
        if (!cancelled) setSkills(data)
      } catch {
        if (!cancelled) showToast(t('claudeConfig.skills.toggleFailed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [showToast, t])

  const handleToggle = useCallback(async (name: string, enabled: boolean) => {
    // Optimistic update
    setSkills((prev) => prev.map((s) => (s.name === name ? { ...s, enabled } : s)))
    try {
      await api.claudeConfig.toggleSkill(name, enabled)
    } catch {
      // Revert
      setSkills((prev) => prev.map((s) => (s.name === name ? { ...s, enabled: !enabled } : s)))
      showToast(t('claudeConfig.skills.toggleFailed'))
    }
  }, [showToast, t])

  const selected = selectedSkill ? skills.find((s) => s.name === selectedSkill) : null

  if (loading) {
    return (
      <div className={styles.sectionWrap}>
        <SectionHeader icon="&#x2728;" title={t('claudeConfig.skills.title')} />
        <div className={styles.sectionSkeleton}>
          <div className={styles.sectionPlaceholder}>{t('claudeConfig.skills.loading')}</div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.sectionWrap}>
      <SectionHeader icon="&#x2728;" title={t('claudeConfig.skills.title')} />

      <div style={{ display: 'flex', gap: 16 }}>
        {/* List */}
        <div className={styles.card} style={{ flex: selected ? '0 0 50%' : '1 1 100%' }}>
          {skills.length === 0 ? (
            <div className={styles.sectionPlaceholder}>{t('claudeConfig.skills.empty')}</div>
          ) : (
            skills.map((skill) => (
              <div
                key={skill.name}
                className={styles.listItem}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedSkill(skill.name === selectedSkill ? null : skill.name)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.listName}>{skill.name}</div>
                  <div className={styles.listMeta} style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {skill.description || 'No description'}
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {!skill.enabled && <span className={styles.tagRed}>{t('claudeConfig.skills.disabled')}</span>}
                    {skill.has_auxiliary && <span className={styles.tagBlue}>{t('claudeConfig.skills.auxiliary')}</span>}
                    {Object.keys(skill.metadata).length > 0 && (
                      <span className={styles.tagGray}>
                        {Object.keys(skill.metadata).length} {t('claudeConfig.skills.meta')}
                      </span>
                    )}
                  </div>
                </div>
                <Toggle
                  checked={skill.enabled}
                  onChange={(checked) => {
                    handleToggle(skill.name, checked)
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            ))
          )}
        </div>

        {/* Detail Panel */}
        {selected && (
          <div style={{ flex: '0 0 50%' }}>
            <DetailPanel
              title={selected.name}
              path={selected.path}
              metadata={selected.metadata}
              content={selected.content}
              onClose={() => setSelectedSkill(null)}
            />
            {selected.auxiliary_files.length > 0 && (
              <div className={styles.card} style={{ marginTop: 8 }}>
                <div className={styles.cardHeader}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tc-foreground)' }}>
                    {t('claudeConfig.skills.auxiliaryFiles')}
                  </span>
                </div>
                <div className={styles.cardBody}>
                  {selected.auxiliary_files.map((f) => (
                    <div key={f} style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", color: 'var(--tc-foreground-secondary)', padding: '2px 0' }}>
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default SecSkills
