// TranscriptViewer.tsx — Center transcript area with scroll management
// Extracted from AdminSessions for reuse.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconChevronDown, IconUser } from '../../ui/icon'
import type { TranscriptMessage } from '../../lib/api/types'
import {
  ExpandSignalCtx, AutoExpandCtx,
  groupMessagesIntoTurns, UserCard, AssistantTurnCard,
} from '../ChatRenderer'
import styles from './session-chat.module.css'

export interface TranscriptViewerProps {
  transcript: TranscriptMessage[]
  loading: boolean
  fileFound: boolean
  selectedId: string | null
  isFirstLoad: React.MutableRefObject<boolean>
  autoExpand?: boolean
  className?: string
}

export function TranscriptViewer({
  transcript, loading, fileFound, selectedId,
  isFirstLoad, autoExpand = true, className,
}: TranscriptViewerProps) {
  const { t } = useTranslation()
  const transcriptRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [showJumpBtn, setShowJumpBtn] = useState(false)
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null)
  const [expandSignal, setExpandSignal] = useState(0)

  // Track if user is near bottom
  const checkNearBottom = useCallback(() => {
    const el = transcriptRef.current
    if (!el) return false
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }, [])

  // Scroll listener to toggle jump button
  useEffect(() => {
    const el = transcriptRef.current
    if (!el) return
    const onScroll = () => setShowJumpBtn(!checkNearBottom())
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [checkNearBottom, transcript])

  // Scroll to bottom only on first load
  useEffect(() => {
    if (!transcript.length) return
    if (isFirstLoad.current) {
      isFirstLoad.current = false
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'auto' })
        setShowJumpBtn(false)
      })
    }
  }, [transcript, isFirstLoad])

  const jumpToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setShowJumpBtn(false)
  }, [])

  // Sync expand signal when transcript changes
  useEffect(() => {
    setExpandSignal(prev => autoExpand ? Math.abs(prev) + 1 : -(Math.abs(prev) + 1))
    setCurrentQuestion(null)
  }, [transcript]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync expand signal when autoExpand toggles
  useEffect(() => {
    setExpandSignal(prev => autoExpand ? Math.abs(prev) + 1 : -(Math.abs(prev) + 1))
  }, [autoExpand])

  // Extract questions for IntersectionObserver
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

  // IntersectionObserver for sticky question header
  useEffect(() => {
    const container = transcriptRef.current
    if (!container || questions.length === 0) return

    const timer = setTimeout(() => {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const idx = Number((entry.target as HTMLElement).dataset.msgIndex)
              const q = questions.find(q => q.msgIndex === idx)
              if (q) setCurrentQuestion(q.text.slice(0, 200))
            }
          }
        },
        { root: container, rootMargin: '-40px 0px 0px 0px', threshold: 0.1 }
      )

      const qIndices = new Set(questions.map(q => q.msgIndex))
      const elements = container.querySelectorAll('[data-msg-index]')
      elements.forEach(el => {
        const idx = Number((el as HTMLElement).dataset.msgIndex)
        if (qIndices.has(idx)) observer.observe(el)
      })

      ;(container as unknown as Record<string, unknown>).__convObserver = observer
    }, 100)

    return () => {
      clearTimeout(timer)
      const obs = (transcriptRef.current as unknown as Record<string, unknown> | null)?.__convObserver as IntersectionObserver | undefined
      if (obs) obs.disconnect()
    }
  }, [questions])

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
        <div ref={transcriptRef} className={styles.transcriptScroll}>
          {/* Sticky question header */}
          {currentQuestion && (
            <div className={styles.stickyQuestion}>
              <span style={{ flexShrink: 0, display: 'flex' }}><IconUser size={12} /></span>
              <span className={styles.stickyQuestionText}>{currentQuestion}</span>
            </div>
          )}
          <div className={styles.transcriptBody}>
            {groupMessagesIntoTurns(transcript).map((item, i) => (
              <div key={i} data-msg-index={i}>
                {item.kind === 'user' ? (
                  <UserCard msg={item.msg} />
                ) : (
                  <AssistantTurnCard turn={item.turn} />
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          {showJumpBtn && (
            <button className={styles.jumpToBottom} onClick={jumpToBottom}>
              <IconChevronDown size={14} />
              <span>{t('admin_extra.latest')}</span>
            </button>
          )}
        </div>
      </ExpandSignalCtx.Provider>
      </AutoExpandCtx.Provider>
    </div>
  )
}
