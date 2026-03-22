// TranscriptViewer.tsx — Center transcript area with react-virtuoso virtual scrolling
// Replaces full DOM rendering with virtualized list for performance.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
import { IconChevronDown, IconUser } from '../../ui/icon'
import type { TranscriptMessage } from '../../lib/api/types'
import {
  ExpandSignalCtx, AutoExpandCtx,
  groupMessagesIntoTurns, MemoUserCard, MemoAssistantTurnCard,
} from '../ChatRenderer'
import styles from './session-chat.module.css'

export interface TranscriptViewerProps {
  transcript: TranscriptMessage[]
  loading: boolean
  fileFound: boolean
  selectedId: string | null
  isFirstLoad: React.MutableRefObject<boolean>
  autoExpand?: boolean
  onJumpToQuestion?: (ref: { scrollToIndex: (index: number) => void }) => void
  onLoadMore?: () => void
  hasMore?: boolean
  total?: number
  className?: string
}

export function TranscriptViewer({
  transcript, loading, fileFound, selectedId,
  isFirstLoad: _isFirstLoad, autoExpand = true, onJumpToQuestion,
  onLoadMore, hasMore, total = 0, className,
}: TranscriptViewerProps) {
  const { t } = useTranslation()
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const [showJumpBtn, setShowJumpBtn] = useState(false)
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null)
  const [expandSignal, setExpandSignal] = useState(0)

  const turns = useMemo(() => groupMessagesIntoTurns(transcript), [transcript])
  const firstItemIdx = Math.max(0, total - transcript.length)

  // Expose scrollToIndex to parent for QuestionNav
  // Convert data-array index → virtual index by adding firstItemIndex offset
  useEffect(() => {
    if (onJumpToQuestion && virtuosoRef.current) {
      onJumpToQuestion({
        scrollToIndex: (dataIndex: number) => {
          virtuosoRef.current?.scrollToIndex({ index: firstItemIdx + dataIndex, align: 'start', behavior: 'smooth' })
        },
      })
    }
  }, [onJumpToQuestion, turns, firstItemIdx])

  // Extract question indices for rangeChanged matching
  const questionIndices = useMemo(() => {
    const result: Array<{ turnIndex: number; text: string }> = []
    turns.forEach((item, i) => {
      if (item.kind === 'user') {
        const text = item.msg.blocks
          .filter(b => b.type === 'text')
          .map(b => b.text || '')
          .join(' ')
          .trim()
          .slice(0, 200)
        if (text) result.push({ turnIndex: i, text })
      }
    })
    return result
  }, [turns])

  // rangeChanged → update sticky question header
  // startIndex from Virtuoso is in virtual space, convert to data-array index
  const handleRangeChanged = useCallback(({ startIndex }: { startIndex: number; endIndex: number }) => {
    const dataIndex = startIndex - firstItemIdx
    let found: string | null = null
    for (let i = questionIndices.length - 1; i >= 0; i--) {
      if (questionIndices[i].turnIndex <= dataIndex) {
        found = questionIndices[i].text
        break
      }
    }
    setCurrentQuestion(found)
  }, [questionIndices, firstItemIdx])

  // Sync expand signal when transcript changes
  useEffect(() => {
    setExpandSignal(prev => autoExpand ? Math.abs(prev) + 1 : -(Math.abs(prev) + 1))
    setCurrentQuestion(null)
  }, [transcript]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync expand signal when autoExpand toggles
  useEffect(() => {
    setExpandSignal(prev => autoExpand ? Math.abs(prev) + 1 : -(Math.abs(prev) + 1))
  }, [autoExpand])

  // ── Render states ──

  if (!selectedId) {
    return (
      <div className={`${styles.centerPanel} ${className ?? ''}`}>
        <div className={styles.emptyCenter}>
          <span style={{ fontSize: 28 }}>{'\u2317'}</span>
          <p style={{ fontSize: 12 }}>{t('admin.sessions.select_session')}</p>
          <p style={{ fontSize: 10, opacity: 0.6 }}>{t('admin.sessions.select_session_hint')}</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={`${styles.centerPanel} ${className ?? ''}`}>
        <div className={styles.loadingCenter}>
          {t('common.loading')}
        </div>
      </div>
    )
  }

  if (!fileFound) {
    return (
      <div className={`${styles.centerPanel} ${className ?? ''}`}>
        <div className={styles.emptyCenter}>
          <span style={{ fontSize: 28 }}>{'\uD83D\uDCC2'}</span>
          <p style={{ fontSize: 12 }}>{t('admin_extra.conversation_file_not_found')}</p>
        </div>
      </div>
    )
  }

  if (transcript.length === 0) {
    return (
      <div className={`${styles.centerPanel} ${className ?? ''}`}>
        <div className={styles.emptyCenter}>
          <span style={{ fontSize: 28 }}>{'\uD83D\uDCAC'}</span>
          <p style={{ fontSize: 12 }}>{t('admin.sessions.no_events')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`${styles.centerPanel} ${className ?? ''}`}>
      <AutoExpandCtx.Provider value={autoExpand}>
      <ExpandSignalCtx.Provider value={expandSignal}>
        {currentQuestion && (
          <div className={styles.stickyQuestion}>
            <span style={{ flexShrink: 0, display: 'flex' }}><IconUser size={12} /></span>
            <span className={styles.stickyQuestionText}>{currentQuestion}</span>
          </div>
        )}
        <Virtuoso
          ref={virtuosoRef}
          data={turns}
          firstItemIndex={firstItemIdx}
          initialTopMostItemIndex={turns.length > 0 ? turns.length - 1 : 0}
          followOutput="smooth"
          startReached={hasMore ? onLoadMore : undefined}
          computeItemKey={(_index, item) => item.startIndex}
          increaseViewportBy={400}
          rangeChanged={handleRangeChanged}
          atBottomStateChange={(atBottom) => setShowJumpBtn(!atBottom)}
          itemContent={(_index, item) => (
            <div data-msg-index={item.startIndex}>
              {item.kind === 'user'
                ? <MemoUserCard msg={item.msg} />
                : <MemoAssistantTurnCard turn={item.turn} />}
            </div>
          )}
        />
        {showJumpBtn && (
          <button className={styles.jumpToBottom} onClick={() => virtuosoRef.current?.scrollToIndex({ index: firstItemIdx + turns.length - 1, behavior: 'smooth' })}>
            <IconChevronDown size={14} />
            <span>{t('admin_extra.latest')}</span>
          </button>
        )}
      </ExpandSignalCtx.Provider>
      </AutoExpandCtx.Provider>
    </div>
  )
}
