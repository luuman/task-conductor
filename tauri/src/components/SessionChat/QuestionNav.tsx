// QuestionNav.tsx — Right panel question navigation
// Extracted from AdminSessions for reuse.

import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TranscriptMessage } from '../../lib/api/types'
import styles from './session-chat.module.css'

export interface QuestionNavProps {
  transcript: TranscriptMessage[]
  transcriptScrollRef?: React.RefObject<HTMLDivElement | null>
  autoExpand: boolean
  onAutoExpandChange: (v: boolean) => void
  className?: string
}

export function QuestionNav({
  transcript, transcriptScrollRef, autoExpand, onAutoExpandChange, className,
}: QuestionNavProps) {
  const { t } = useTranslation()
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(-1)

  // Extract user questions from transcript
  const questions = useMemo(() => {
    return transcript
      .map((msg, i) => ({ msg, i }))
      .filter(({ msg }) => msg.role === 'user')
      .map(({ msg, i }) => ({
        text: msg.blocks
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join(' ')
          .trim()
          .slice(0, 200),
        msgIndex: i,
      }))
      .filter(q => q.text)
  }, [transcript])

  // Jump to question
  const jumpToQuestion = useCallback((qIdx: number, msgIndex: number) => {
    setActiveQuestionIdx(qIdx)
    const container = transcriptScrollRef?.current
    if (!container) return
    const cards = container.querySelectorAll('[data-msg-index]')
    for (const card of cards) {
      if ((card as HTMLElement).dataset.msgIndex === String(msgIndex)) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }
  }, [transcriptScrollRef])

  if (questions.length === 0) return null

  return (
    <div className={`${styles.rightPanel} ${className ?? ''}`}>
      <div className={styles.rightHeader}>
        <span className={styles.rightTitle}>{t('admin_extra.question_nav')}</span>
        <span className={styles.expandToggleWrap}>
          <span className={styles.expandLabel}>
            {autoExpand ? t('admin_extra.expand') : t('admin_extra.collapse')}
          </span>
          <button
            className={styles.expandToggle}
            style={{ background: autoExpand ? 'var(--tc-border-active)' : 'var(--tc-panel-bg)' }}
            onClick={() => onAutoExpandChange(!autoExpand)}
          >
            <span
              className={styles.expandDot}
              style={{ left: autoExpand ? 'calc(100% - 12px)' : '2px' }}
            />
          </button>
        </span>
      </div>
      <div className={styles.rightBody}>
        {questions.map((q, i) => (
          <button
            key={i}
            onClick={() => jumpToQuestion(i, q.msgIndex)}
            className={activeQuestionIdx === i ? styles.questionItemActive : styles.questionItem}
          >
            <span className={styles.questionNum}>{i + 1}</span>
            <span className={styles.questionText}>{q.text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
