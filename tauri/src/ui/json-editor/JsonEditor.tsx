import { useState, useEffect, useCallback } from 'react'
import styles from './json-editor.module.css'

export interface JsonEditorProps {
  value: unknown
  onChange: (value: unknown) => void
  readonly?: boolean
  label?: string
  className?: string
}

export function JsonEditor({ value, onChange, readonly, label, className }: JsonEditorProps) {
  const formatted = JSON.stringify(value, null, 2) ?? ''
  const [text, setText] = useState(formatted)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!dirty) {
      setText(formatted)
    }
  }, [formatted, dirty])

  const handleChange = useCallback((newText: string) => {
    setText(newText)
    setDirty(true)
    setError(null)
  }, [])

  const handleSave = useCallback(() => {
    try {
      const parsed = JSON.parse(text)
      setError(null)
      setDirty(false)
      onChange(parsed)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [text, onChange])

  const handleBlur = useCallback(() => {
    if (dirty) {
      handleSave()
    }
  }, [dirty, handleSave])

  if (readonly) {
    return (
      <div className={`${styles.wrapper} ${className ?? ''}`}>
        {label && <label className={styles.label}>{label}</label>}
        <pre className={styles.readonlyDisplay}>{formatted}</pre>
      </div>
    )
  }

  return (
    <div className={`${styles.wrapper} ${className ?? ''}`}>
      {label && <label className={styles.label}>{label}</label>}
      <textarea
        className={`${styles.textarea} ${error ? styles.hasError : ''}`}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        spellCheck={false}
      />
      <div className={styles.footer}>
        {error && <span className={styles.error}>{error}</span>}
        {dirty && !error && (
          <button type="button" className={styles.saveButton} onClick={handleSave}>
            Save
          </button>
        )}
      </div>
    </div>
  )
}
