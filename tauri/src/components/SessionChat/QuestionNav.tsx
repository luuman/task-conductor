// QuestionNav.tsx — Right panel question navigation
// Shows ALL questions from the /questions API, handles jump to unloaded areas.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TranscriptMessage } from '../../lib/api/types'
import type { QuestionItem } from './useSessionData'
import { groupMessagesIntoTurns } from '../ChatRenderer'
import styles from './session-chat.module.css'

export interface QuestionNavProps {
  transcript: TranscriptMessage[]
  allQuestions: QuestionItem[]
  loadedFrom: number
  scrollToIndexRef?: React.RefObject<((index: number) => void) | null>
  onLoadAll?: () => void
  autoExpand: boolean
  onAutoExpandChange: (v: boolean) => void
  className?: string
}

export function QuestionNav({
  transcript, allQuestions, loadedFrom, scrollToIndexRef,
  onLoadAll, autoExpand, onAutoExpandChange, className,
}: QuestionNavProps) {
  const { t } = useTranslation()
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(-1)
  const pendingJumpRef = useRef<number | null>(null)

  // When transcript updates (after loadAll), check if we have a pending jump
  useEffect(() => {
    if (pendingJumpRef.current == null) return
    const targetMsgIndex = pendingJumpRef.current
    // Check if the target is now loaded
    if (targetMsgIndex >= loadedFrom) {
      pendingJumpRef.current = null
      const relativeMsgIndex = targetMsgIndex - loadedFrom
      const turns = groupMessagesIntoTurns(transcript)
      const turnIndex = turns.findIndex(turn => turn.startIndex >= relativeMsgIndex)
      if (turnIndex >= 0) {
        scrollToIndexRef?.current?.(turnIndex)
      }
    }
  }, [transcript, loadedFrom, scrollToIndexRef])

  const jumpToQuestion = useCallback((qIdx: number, msgIndex: number) => {
    setActiveQuestionIdx(qIdx)

    if (msgIndex < loadedFrom) {
      // Target not loaded yet → load all, then scroll after re-render
      pendingJumpRef.current = msgIndex
      onLoadAll?.()
      return
    }

    // Target is loaded → convert absolute msgIndex to relative, find turnIndex and scroll
    const relativeMsgIndex = msgIndex - loadedFrom
    const turns = groupMessagesIntoTurns(transcript)
    const turnIndex = turns.findIndex(turn => turn.startIndex >= relativeMsgIndex)
    if (turnIndex >= 0) {
      scrollToIndexRef?.current?.(turnIndex)
    }
  }, [loadedFrom, transcript, scrollToIndexRef, onLoadAll])

  if (allQuestions.length === 0) return null

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
        {allQuestions.map((q, i) => (
          <button
            key={q.index}
            onClick={() => jumpToQuestion(i, q.index)}
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
