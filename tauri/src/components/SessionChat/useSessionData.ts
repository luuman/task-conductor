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

  // Pagination
  loadMore(): void
  hasMore: boolean
  loadingMore: boolean
  total: number

  // Scroll
  isFirstLoad: React.MutableRefObject<boolean>
}

interface TranscriptCacheEntry {
  messages: TranscriptMessage[]
  file_found: boolean
  total: number
  has_more: boolean
  loadedFrom: number
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
  const transcriptCache = useRef<Map<string, TranscriptCacheEntry>>(new Map())

  // Pagination
  const [total, setTotal] = useState(0)
  const [loadedFrom, setLoadedFrom] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const totalRef = useRef(0)
  const selectedIdRef = useRef<string | null>(null)

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

  // Refresh transcript (legacy — kept for backward compat, delegates to full reload)
  const refreshTranscript = useCallback((sid: string) => {
    api.getTranscript(sid, { limit: 50 })
      .then(r => {
        const t = r.total ?? r.messages.length
        const hm = r.has_more ?? false
        const from = Math.max(0, t - r.messages.length)
        transcriptCache.current.set(sid, {
          messages: r.messages,
          file_found: r.file_found,
          total: t,
          has_more: hm,
          loadedFrom: from,
        })
        // Only update if still selected
        setSelectedId(prev => {
          if (prev === sid) {
            setTranscript(r.messages)
            setFileFound(r.file_found)
            setTotal(t)
            totalRef.current = t
            setLoadedFrom(from)
            setHasMore(hm)
          }
          return prev
        })
      })
      .catch(() => {})
  }, [])

  // Append new messages incrementally (for WebSocket updates)
  const appendNewMessages = useCallback((sid: string) => {
    api.getTranscript(sid, { offset: totalRef.current, limit: 100 })
      .then(r => {
        const newTotal = r.total ?? (totalRef.current + r.messages.length)
        if (r.messages.length > 0) {
          setTranscript(prev => [...prev, ...r.messages])
          setTotal(newTotal)
          totalRef.current = newTotal
        } else if (newTotal !== totalRef.current) {
          // total changed but no new messages at this offset — sync total
          setTotal(newTotal)
          totalRef.current = newTotal
        }
      })
      .catch(() => {})
  }, [])  // Empty deps — uses ref for stable reference

  // Select session
  const selectSession = useCallback((id: string) => {
    selectedIdRef.current = id
    setSelectedId(id)
    setTranscriptLoading(true)
    isFirstLoad.current = true

    // Show cached immediately
    const cached = transcriptCache.current.get(id)
    if (cached) {
      setTranscript(cached.messages)
      setFileFound(cached.file_found)
      setTotal(cached.total)
      totalRef.current = cached.total
      setLoadedFrom(cached.loadedFrom)
      setHasMore(cached.has_more)
      setTranscriptLoading(false)
    } else {
      setTranscript([])
      setFileFound(true)
      setTotal(0)
      totalRef.current = 0
      setLoadedFrom(0)
      setHasMore(false)
    }

    // Fetch latest (last 50 messages)
    api.getTranscript(id, { limit: 50 })
      .then(r => {
        const t = r.total ?? r.messages.length
        const hm = r.has_more ?? false
        const from = Math.max(0, t - r.messages.length)
        transcriptCache.current.set(id, {
          messages: r.messages,
          file_found: r.file_found,
          total: t,
          has_more: hm,
          loadedFrom: from,
        })
        setTranscript(r.messages)
        setFileFound(r.file_found)
        setTotal(t)
        totalRef.current = t
        setLoadedFrom(from)
        setHasMore(hm)
        setTranscriptLoading(false)
      })
      .catch(() => {
        setTranscript([])
        setFileFound(false)
        setTotal(0)
        totalRef.current = 0
        setLoadedFrom(0)
        setHasMore(false)
        setTranscriptLoading(false)
      })
  }, [])

  // Load more (older messages, for infinite scroll upward)
  const loadMore = useCallback(() => {
    const sid = selectedIdRef.current
    if (!sid || !hasMore || loadedFrom <= 0 || loadingMore) return
    setLoadingMore(true)
    const nextStart = Math.max(0, loadedFrom - 50)
    const count = loadedFrom - nextStart
    api.getTranscript(sid, { limit: count, offset: nextStart })
      .then(r => {
        setTranscript(prev => [...r.messages, ...prev])
        setLoadedFrom(nextStart)
        setHasMore(nextStart > 0)
        setLoadingMore(false)
      })
      .catch(() => setLoadingMore(false))
  }, [hasMore, loadedFrom, loadingMore])

  // Clear selection
  const clearSelection = useCallback(() => {
    selectedIdRef.current = null
    setSelectedId(null)
    setTranscript([])
    setFileFound(true)
    setTranscriptLoading(false)
    setTotal(0)
    totalRef.current = 0
    setLoadedFrom(0)
    setHasMore(false)
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
        appendNewMessages(sid)
        refreshSessions()
      }, 500)
    })

    // Fallback polling
    const pollId = setInterval(() => appendNewMessages(sid), transcriptPollInterval)

    return () => {
      unsub()
      if (debounceTimer) clearTimeout(debounceTimer)
      wsManager.disconnect(channel)
      clearInterval(pollId)
    }
  }, [selectedSession, appendNewMessages, refreshSessions, transcriptPollInterval])

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
    loadMore,
    hasMore,
    loadingMore,
    total,
    isFirstLoad,
  }
}
