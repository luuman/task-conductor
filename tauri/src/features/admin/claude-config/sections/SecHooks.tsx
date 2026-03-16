import { useState, useCallback } from 'react'
import { api } from '../../../../lib/api'
import type { ClaudeConfig, ClaudeOverview, HookRule, HookEntry } from '../../../../lib/api/types'
import { SectionHeader } from '../shared'
import styles from '../claude-config.module.css'

const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'Notification',
] as const

interface SecHooksProps {
  config: ClaudeConfig | null
  overview: ClaudeOverview | null
  onConfigUpdate: (c: ClaudeConfig) => void
  showToast: (msg: string) => void
}

function newHookEntry(): HookEntry {
  return { type: 'command', command: '', timeout: 5 }
}

function newRule(): HookRule {
  return { matcher: '', hooks: [newHookEntry()] }
}

export function SecHooks({ config, onConfigUpdate, showToast }: SecHooksProps) {
  const [editState, setEditState] = useState<Record<string, HookRule[]>>({})

  const getRules = useCallback(
    (ev: string): HookRule[] => editState[ev] ?? config?.hooks[ev] ?? [],
    [editState, config]
  )

  const setRules = useCallback((ev: string, rules: HookRule[]) => {
    setEditState((prev) => ({ ...prev, [ev]: rules }))
  }, [])

  const isDirty = useCallback(
    (ev: string): boolean => {
      if (!(ev in editState)) return false
      return JSON.stringify(editState[ev]) !== JSON.stringify(config?.hooks[ev] ?? [])
    },
    [editState, config]
  )

  const addRule = useCallback(
    (ev: string) => {
      setRules(ev, [...getRules(ev), newRule()])
    },
    [getRules, setRules]
  )

  const addHook = useCallback(
    (ev: string, ri: number) => {
      const rules = structuredClone(getRules(ev))
      rules[ri].hooks.push(newHookEntry())
      setRules(ev, rules)
    },
    [getRules, setRules]
  )

  const updateRule = useCallback(
    (ev: string, ri: number, field: keyof HookRule, value: string) => {
      const rules = structuredClone(getRules(ev))
      if (field === 'matcher') {
        rules[ri].matcher = value
      }
      setRules(ev, rules)
    },
    [getRules, setRules]
  )

  const updateHook = useCallback(
    (ev: string, ri: number, hi: number, updates: Partial<HookEntry>) => {
      const rules = structuredClone(getRules(ev))
      Object.assign(rules[ri].hooks[hi], updates)
      setRules(ev, rules)
    },
    [getRules, setRules]
  )

  const removeHook = useCallback(
    (ev: string, ri: number, hi: number) => {
      const rules = structuredClone(getRules(ev))
      rules[ri].hooks.splice(hi, 1)
      // Remove rule if no hooks left
      if (rules[ri].hooks.length === 0) {
        rules.splice(ri, 1)
      }
      setRules(ev, rules)
    },
    [getRules, setRules]
  )

  const handleSave = useCallback(
    async (ev: string) => {
      try {
        const rules = getRules(ev)
        const result = await api.claudeConfig.updateHooks(ev, rules)
        onConfigUpdate(result)
        setEditState((prev) => {
          const next = { ...prev }
          delete next[ev]
          return next
        })
        showToast(`Hooks for ${ev} saved`)
      } catch {
        showToast(`Failed to save hooks for ${ev}`)
      }
    },
    [getRules, onConfigUpdate, showToast]
  )

  const handleClear = useCallback(
    async (ev: string) => {
      try {
        const result = await api.claudeConfig.deleteHooks(ev)
        onConfigUpdate(result)
        setEditState((prev) => {
          const next = { ...prev }
          delete next[ev]
          return next
        })
        showToast(`Hooks for ${ev} cleared`)
      } catch {
        showToast(`Failed to clear hooks for ${ev}`)
      }
    },
    [onConfigUpdate, showToast]
  )

  return (
    <div className={styles.sectionWrap}>
      <SectionHeader icon="🪝" title="Hook 事件" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {HOOK_EVENTS.map((ev) => {
          const rules = getRules(ev)
          const dirty = isDirty(ev)
          const hookCount = rules.reduce((sum, r) => sum + r.hooks.length, 0)

          return (
            <div key={ev} className={styles.card}>
              {/* Card Header */}
              <div className={styles.cardHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tc-foreground)' }}>
                    {ev}
                  </span>
                  {hookCount > 0 && (
                    <span className={styles.tagBlue}>{hookCount} hook{hookCount > 1 ? 's' : ''}</span>
                  )}
                  {dirty && <span className={styles.tagYellow}>unsaved</span>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className={styles.btnPrimary}
                    disabled={!dirty}
                    onClick={() => handleSave(ev)}
                    type="button"
                  >
                    Save
                  </button>
                  <button
                    className={styles.btnDanger}
                    disabled={rules.length === 0}
                    onClick={() => handleClear(ev)}
                    type="button"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Card Body */}
              <div className={styles.cardBody}>
                {rules.map((rule, ri) => (
                  <div
                    key={ri}
                    style={{
                      marginBottom: 12,
                      padding: 12,
                      borderRadius: 6,
                      border: '1px solid var(--tc-border)',
                      background: 'var(--tc-content-bg)',
                    }}
                  >
                    {/* Matcher */}
                    <div className={styles.formRow}>
                      <span className={styles.formLabel}>Matcher</span>
                      <input
                        className={styles.formInput}
                        placeholder="* (match all)"
                        value={rule.matcher}
                        onChange={(e) => updateRule(ev, ri, 'matcher', e.target.value)}
                        style={{ flex: 1 }}
                      />
                    </div>

                    {/* Hooks in this rule */}
                    {rule.hooks.map((hook, hi) => (
                      <div key={hi} className={styles.formRow} style={{ gap: 8 }}>
                        <input
                          className={styles.formInput}
                          placeholder="command"
                          value={hook.command}
                          onChange={(e) => updateHook(ev, ri, hi, { command: e.target.value })}
                          style={{ flex: 1 }}
                        />
                        <input
                          className={styles.formInput}
                          type="number"
                          value={hook.timeout}
                          onChange={(e) =>
                            updateHook(ev, ri, hi, { timeout: Number(e.target.value) })
                          }
                          style={{ width: 70 }}
                        />
                        <button
                          className={styles.btnDanger}
                          onClick={() => removeHook(ev, ri, hi)}
                          type="button"
                          style={{ flexShrink: 0 }}
                        >
                          &times;
                        </button>
                      </div>
                    ))}

                    <button
                      className={styles.btnGhost}
                      onClick={() => addHook(ev, ri)}
                      type="button"
                      style={{ marginTop: 4, fontSize: 11 }}
                    >
                      + Add Hook
                    </button>
                  </div>
                ))}

                <button
                  className={styles.btnGhost}
                  onClick={() => addRule(ev)}
                  type="button"
                  style={{ fontSize: 11 }}
                >
                  + Add Rule
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
