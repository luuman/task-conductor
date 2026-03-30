import { useState } from 'react'
import { RequirementFields } from '../../../lib/api/types'
import { PrdPreview } from './PrdPreview'
import { Button } from '../../../ui/button'
import styles from './RequirementWorkspace.module.css'

interface FieldConfig {
  key: keyof RequirementFields
  label: string
  placeholder: string
  type: 'text' | 'list'
  required: boolean
}

const FIELDS: FieldConfig[] = [
  { key: 'background', label: '背景', placeholder: '为什么要做这个？解决什么问题？', type: 'text', required: true },
  { key: 'target_users', label: '目标用户', placeholder: '谁会使用这个功能？', type: 'text', required: true },
  { key: 'core_features', label: '核心功能', placeholder: '每行一个功能点', type: 'list', required: true },
  { key: 'acceptance_criteria', label: '验收标准', placeholder: '每行一条验收条件', type: 'list', required: false },
  { key: 'tech_constraints', label: '技术约束', placeholder: '技术限制、依赖、框架要求（选填）', type: 'text', required: false },
]

function parseRequirements(raw: string | null): RequirementFields {
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

interface Props {
  taskId: number
  taskTitle: string
  requirementsRaw: string | null
  onSave: (fields: RequirementFields) => void
  onRequestReview: () => void
  isSaving: boolean
}

export function RequirementWorkspace({
  taskTitle,
  requirementsRaw,
  onSave,
  onRequestReview,
  isSaving,
}: Props) {
  const initial = parseRequirements(requirementsRaw)
  const [fields, setFields] = useState<RequirementFields>(initial)
  const [expandedField, setExpandedField] = useState<keyof RequirementFields | null>(null)

  function setField(key: keyof RequirementFields, value: string) {
    const updated: RequirementFields = { ...fields }
    if (key === 'core_features' || key === 'acceptance_criteria') {
      updated[key] = value.split('\n').filter(l => l.trim())
    } else {
      (updated as Record<string, string>)[key] = value
    }
    setFields(updated)
    onSave(updated)
  }

  function getFieldValue(key: keyof RequirementFields): string {
    const v = fields[key]
    if (Array.isArray(v)) return v.join('\n')
    return (v as string) || ''
  }

  function isFilled(key: keyof RequirementFields): boolean {
    const v = fields[key]
    if (Array.isArray(v)) return v.length > 0
    return !!(v as string)?.trim()
  }

  const requiredFilled = FIELDS.filter(f => f.required).every(f => isFilled(f.key))

  return (
    <div className={styles.root}>
      {/* 左：字段面板 */}
      <div className={styles.fieldsPanel}>
        <div className={styles.panelHeader}>需求补充</div>

        <div className={styles.fieldsList}>
          {FIELDS.map(fc => {
            const filled = isFilled(fc.key)
            const expanded = expandedField === fc.key

            return (
              <div key={fc.key} className={styles.fieldItem}>
                <button
                  className={styles.fieldToggle}
                  onClick={() => setExpandedField(expanded ? null : fc.key)}
                >
                  <span className={filled ? styles.statusFilled : styles.statusEmpty}>
                    {filled ? '✅' : '⚠️'}
                  </span>
                  <span className={styles.fieldLabel}>{fc.label}</span>
                  {!fc.required && (
                    <span className={styles.optionalBadge}>选填</span>
                  )}
                  <span className={styles.chevron}>{expanded ? '▲' : '▼'}</span>
                </button>

                {expanded && (
                  <div className={styles.fieldBody}>
                    <textarea
                      className={styles.textarea}
                      value={getFieldValue(fc.key)}
                      placeholder={fc.placeholder}
                      rows={fc.type === 'list' ? 4 : 3}
                      onChange={e => setField(fc.key, e.target.value)}
                      autoFocus
                    />
                  </div>
                )}

                {!expanded && filled && (
                  <div className={styles.fieldPreview}>
                    {getFieldValue(fc.key).slice(0, 80)}
                    {getFieldValue(fc.key).length > 80 ? '…' : ''}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className={styles.actions}>
          {isSaving && <span className={styles.savingHint}>保存中…</span>}
          <Button
            onClick={onRequestReview}
            disabled={!requiredFilled}
            variant={requiredFilled ? 'default' : 'ghost'}
          >
            完成填写，请 AI 审核
          </Button>
          {!requiredFilled && (
            <p className={styles.hint}>请先填写背景、目标用户和核心功能</p>
          )}
        </div>
      </div>

      {/* 右：PRD 预览 */}
      <div className={styles.previewPanel}>
        <PrdPreview fields={fields} title={taskTitle} />
      </div>
    </div>
  )
}
