// QuestionNav.tsx — Right panel question navigation
// Uses Virtuoso scrollToIndex API for virtual-scroll-compatible jumping.

import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TranscriptMessage } from '../../lib/api/types'
import { groupMessagesIntoTurns } from '../ChatRenderer'
import styles from './session-chat.module.css'

export interface QuestionNavProps {
  transcript: TranscriptMessage[]
  scrollToIndexRef?: React.RefObject<((index: number) => void) | null>
  autoExpand: boolean
  onAutoExpandChange: (v: boolean) => void
  className?: string
}

export function QuestionNav({
  transcript, scrollToIndexRef, autoExpand, onAutoExpandChange, className,
}: QuestionNavProps) {
  const { t } = useTranslation()
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(-1)

  // Build questions list using grouped turns (same grouping as TranscriptViewer)
  const questions = useMemo(() => {
    const turns = groupMessagesIntoTurns(transcript)
    const result: Array<{ text: string; turnIndex: number }> = []
    turns.forEach((item, i) => {
      if (item.kind === 'user') {
        const text = item.msg.blocks
          .filter(b => b.type === 'text')
          .map(b => b.text || '')
          .join(' ')
          .trim()
          .slice(0, 200)
        if (text) result.push({ text, turnIndex: i })
      }
    })
    return result
  }, [transcript])

  // Jump to question using Virtuoso scrollToIndex
  const jumpToQuestion = useCallback((qIdx: number, turnIndex: number) => {
    setActiveQuestionIdx(qIdx)
    scrollToIndexRef?.current?.(turnIndex)
  }, [scrollToIndexRef])

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
            onClick={() => jumpToQuestion(i, q.turnIndex)}
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
