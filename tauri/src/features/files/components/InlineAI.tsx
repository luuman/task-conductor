import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useInlineAI } from '../hooks/useInlineAI'
import type { InlineEditResponse } from '../../../lib/api/types'
import styles from './inline-ai.module.css'

interface InlineAIProps {
  filePath: string
  fileContent: string
  selection: { startLine: number; endLine: number }
  onAccept: (modified: string) => void
  onClose: () => void
}

export function InlineAI({ filePath, fileContent, selection, onAccept, onClose }: InlineAIProps) {
  const { t } = useTranslation()
  const [instruction, setInstruction] = useState('')
  const [result, setResult] = useState<InlineEditResponse | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const mutation = useInlineAI()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = useCallback(() => {
    if (!instruction.trim()) return
    mutation.mutate(
      {
        file_path: filePath,
        file_content: fileContent,
        selection,
        instruction: instruction.trim(),
      },
      {
        onSuccess: (data) => setResult(data),
      }
    )
  }, [instruction, filePath, fileContent, selection, mutation])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      onClose()
    }
  }, [handleSubmit, onClose])

  const handleAccept = useCallback(() => {
    if (result) {
      onAccept(result.modified)
    }
  }, [result, onAccept])

  const handleRetry = useCallback(() => {
    setResult(null)
  }, [])

  return (
    <div className={styles.overlay}>
      <div className={styles.inputRow}>
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          placeholder={t('editor.aiPlaceholder')}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={mutation.isPending}
        />
        <button
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={mutation.isPending || !instruction.trim()}
        >
          {mutation.isPending ? '...' : 'AI'}
        </button>
      </div>

      {mutation.isPending && (
        <div className={styles.working}>{t('editor.aiWorking')}</div>
      )}

      {result && (
        <>
          <div className={styles.diffPreview}>
            {result.original.split('\n').map((line, i) => (
              <div key={`r-${i}`} className={styles.diffRemove}>- {line}</div>
            ))}
            {result.modified.split('\n').map((line, i) => (
              <div key={`a-${i}`} className={styles.diffAdd}>+ {line}</div>
            ))}
          </div>
          <div className={styles.actions}>
            <button className={styles.actionBtn} onClick={onClose}>
              {t('editor.aiReject')}
            </button>
            <button className={styles.actionBtn} onClick={handleRetry}>
              {t('editor.aiRetry')}
            </button>
            <button className={`${styles.actionBtn} ${styles.acceptBtn}`} onClick={handleAccept}>
              {t('editor.aiAccept')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
