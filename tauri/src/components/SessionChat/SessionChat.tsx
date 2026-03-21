// SessionChat.tsx — Composed session chat component
// Provides 'full' (3-column) and 'compact' (single-column) layout variants.

import { useState } from 'react'
import type { AiSession } from '../../lib/api/types'
import { useSessionData } from './useSessionData'
import { SessionList } from './SessionList'
import { TranscriptViewer } from './TranscriptViewer'
import { QuestionNav } from './QuestionNav'
import styles from './session-chat.module.css'

export interface SessionChatProps {
  layout: 'full' | 'compact'
  filterByCwd?: string
  onSessionSelect?: (session: AiSession) => void
  className?: string
}

export function SessionChat({
  layout, filterByCwd, onSessionSelect, className,
}: SessionChatProps) {
  const {
    sessions, sessionsLoading, selectedId, selectedSession,
    selectSession, clearSelection, transcript, transcriptLoading,
    fileFound, isFirstLoad,
  } = useSessionData({ filterByCwd })

  const [search, setSearch] = useState('')
  const [autoExpand, setAutoExpand] = useState(true)

  const handleSelect = (s: AiSession) => {
    selectSession(s.session_id)
    onSessionSelect?.(s)
  }

  const hasQuestions = transcript.length > 0 && !transcriptLoading && fileFound && selectedId != null

  if (layout === 'compact') {
    return (
      <div className={`${styles.root} ${styles.rootCompact} ${className ?? ''}`}>
        <SessionList
          sessions={sessions}
          selectedId={selectedId}
          onSelect={handleSelect}
          onClearSelection={clearSelection}
          search={search}
          onSearchChange={setSearch}
          loading={sessionsLoading}
          compact
        />
        <TranscriptViewer
          transcript={transcript}
          loading={transcriptLoading}
          fileFound={fileFound}
          selectedId={selectedId}
          isFirstLoad={isFirstLoad}
          autoExpand={autoExpand}
        />
      </div>
    )
  }

  return (
    <div className={`${styles.root} ${className ?? ''}`}>
      <SessionList
        sessions={sessions}
        selectedId={selectedId}
        onSelect={handleSelect}
        onClearSelection={clearSelection}
        search={search}
        onSearchChange={setSearch}
        loading={sessionsLoading}
      />
      <TranscriptViewer
        transcript={transcript}
        loading={transcriptLoading}
        fileFound={fileFound}
        selectedId={selectedId}
        isFirstLoad={isFirstLoad}
        autoExpand={autoExpand}
      />
      {hasQuestions && (
        <QuestionNav
          transcript={transcript}
          autoExpand={autoExpand}
          onAutoExpandChange={setAutoExpand}
        />
      )}
    </div>
  )
}
