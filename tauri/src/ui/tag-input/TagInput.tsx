import { useState, useCallback, type KeyboardEvent } from 'react'
import styles from './tag-input.module.css'

export interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function TagInput({ tags, onChange, placeholder = 'Type and press Enter', disabled, className }: TagInputProps) {
  const [input, setInput] = useState('')

  const addTag = useCallback(() => {
    const value = input.trim()
    if (!value || tags.includes(value)) {
      setInput('')
      return
    }
    onChange([...tags, value])
    setInput('')
  }, [input, tags, onChange])

  const removeTag = useCallback((index: number) => {
    onChange(tags.filter((_, i) => i !== index))
  }, [tags, onChange])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    } else if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      removeTag(tags.length - 1)
    }
  }, [addTag, input, tags.length, removeTag])

  return (
    <div
      className={`${styles.container} ${disabled ? styles.disabled : ''} ${className ?? ''}`}
      data-disabled={disabled ? 'true' : undefined}
    >
      {tags.map((tag, i) => (
        <span key={tag} className={styles.tag}>
          <span className={styles.tagText}>{tag}</span>
          {!disabled && (
            <button
              type="button"
              className={styles.tagRemove}
              onClick={() => removeTag(i)}
              aria-label={`Remove ${tag}`}
            >
              &times;
            </button>
          )}
        </span>
      ))}
      <input
        type="text"
        className={styles.input}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addTag}
        placeholder={tags.length === 0 ? placeholder : ''}
        disabled={disabled}
      />
    </div>
  )
}
