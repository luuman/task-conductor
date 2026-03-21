// useSessionData.ts — Shared session data management hook
// Extracted from AdminSessions + FloatingAssistant for reuse.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { wsManager } from '../../lib/ws'
import type { AiSession, TranscriptMessage } from '../../lib/api/types'

export interface UseSessionDataOptions {
  filterByCwd?: string           // filter sessions by project path
  autoRefreshInterval?: number   // session list poll interval (default 5000)
  transcriptPollInterval?: number // fallback transcript poll (default 10000)
}

export interface UseSessionDataReturn {
  // Session list
  sessions: AiSession[]
  sessionsLoading: boolean
  refreshSessions(): void

  // Selected session
  selectedId: string | null
  selectedSession: AiSession | undefined
  selectSession(id: string): void
  clearSelection(): void

  // Transcript
  transcript: TranscriptMessage[]
  transcriptLoading: boolean
  fileFound: boolean
  refreshTranscript(sid: string): void

  // Scroll
  isFirstLoad: React.MutableRefObject<boolean>
}

export function useSessionData(options: UseSessionDataOptions = {}): UseSessionDataReturn {
  const {
    filterByCwd,
    autoRefreshInterval = 5000,
    transcriptPollInterval = 10000,
  } = options

  // Session list
  const [sessions, setSessions] = useState<AiSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Transcript
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [fileFound, setFileFound] = useState(true)
  const transcriptCache = useRef<Map<string, { messages: TranscriptMessage[]; file_found: boolean }>>(new Map())

  // Scroll
  const isFirstLoad = useRef(true)

  // Filter helper
  const filterSessions = useCallback((allSessions: AiSession[]) => {
    let result = allSessions.filter(s => !!s.summary)
    if (filterByCwd) {
      result = result.filter(s => s.cwd && s.cwd.startsWith(filterByCwd))
    }
    return result
  }, [filterByCwd])

  // Load sessions
  const refreshSessions = useCallback(() => {
    api.getSessions()
      .then(all => {
        setSessions(filterSessions(all))
        setSessionsLoading(false)
      })
      .catch(() => setSessionsLoading(false))
  }, [filterSessions])

  // Auto-refresh session list
  useEffect(() => {
    refreshSessions()
    const id = setInterval(refreshSessions, autoRefreshInterval)
    return () => clearInterval(id)
  }, [refreshSessions, autoRefreshInterval])

  // Selected session object
  const selectedSession = useMemo(
    () => sessions.find(s => s.session_id === selectedId),
    [sessions, selectedId],
  )

  // Refresh transcript
  const refreshTranscript = useCallback((sid: string) => {
    api.getTranscript(sid)
      .then(r => {
        transcriptCache.current.set(sid, { messages: r.messages, file_found: r.file_found })
        // Only update if still selected
        setSelectedId(prev => {
          if (prev === sid) {
            setTranscript(r.messages)
            setFileFound(r.file_found)
          }
          return prev
        })
      })
      .catch(() => {})
  }, [])

  // Select session
  const selectSession = useCallback((id: string) => {
    setSelectedId(id)
    setTranscriptLoading(true)
    isFirstLoad.current = true

    // Show cached immediately
    const cached = transcriptCache.current.get(id)
    if (cached) {
      setTranscript(cached.messages)
      setFileFound(cached.file_found)
      setTranscriptLoading(false)
    } else {
      setTranscript([])
      setFileFound(true)
    }

    // Fetch latest
    api.getTranscript(id)
      .then(r => {
        transcriptCache.current.set(id, { messages: r.messages, file_found: r.file_found })
        setTranscript(r.messages)
        setFileFound(r.file_found)
        setTranscriptLoading(false)
      })
      .catch(() => {
        setTranscript([])
        setFileFound(false)
        setTranscriptLoading(false)
      })
  }, [])

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedId(null)
    setTranscript([])
    setFileFound(true)
    setTranscriptLoading(false)
  }, [])

  // WS: subscribe to active session for real-time refresh
  useEffect(() => {
    if (!selectedSession || selectedSession.status !== 'active') return
    const sid = selectedSession.session_id
    const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/session/${sid}`
    const channel = `session-chat:${sid}`

    wsManager.connect(channel, wsUrl)
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const unsub = wsManager.subscribe(channel, () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        refreshTranscript(sid)
        refreshSessions()
      }, 500)
    })

    // Fallback polling
    const pollId = setInterval(() => refreshTranscript(sid), transcriptPollInterval)

    return () => {
      unsub()
      if (debounceTimer) clearTimeout(debounceTimer)
      wsManager.disconnect(channel)
      clearInterval(pollId)
    }
  }, [selectedSession, refreshTranscript, refreshSessions, transcriptPollInterval])

  return {
    sessions,
    sessionsLoading,
    refreshSessions,
    selectedId,
    selectedSession,
    selectSession,
    clearSelection,
    transcript,
    transcriptLoading,
    fileFound,
    refreshTranscript,
    isFirstLoad,
  }
}
