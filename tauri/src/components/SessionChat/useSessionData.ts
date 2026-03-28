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
  autoLoadAll?: boolean          // auto-load all remaining messages after initial fetch (default true)
  initialLimit?: number          // number of messages to fetch on initial load (default 50)
}

export interface QuestionItem {
  index: number
  text: string
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
  loadAll(): void
  hasMore: boolean
  loadingMore: boolean
  total: number
  loadedFrom: number

  // All questions (full list from /questions API)
  allQuestions: QuestionItem[]

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
    autoLoadAll = true,
    initialLimit = 50,
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

  // All questions (fetched from /questions endpoint for full QuestionNav)
  const [allQuestions, setAllQuestions] = useState<QuestionItem[]>([])

  // Scroll
  const isFirstLoad = useRef(true)

  // Filter + sort (参考 SessionList: active > idle > stopped, 同组按时间倒序)
  const filterSessions = useCallback((allSessions: AiSession[]) => {
    let result = allSessions.filter(s => !!s.summary)
    if (filterByCwd) {
      result = result.filter(s => s.cwd && s.cwd.startsWith(filterByCwd))
    }
    result.sort((a, b) => {
      const statusOrder = (s: string | undefined) => s === 'active' ? 2 : s === 'idle' ? 1 : 0
      const diff = statusOrder(b.status) - statusOrder(a.status)
      if (diff !== 0) return diff
      return new Date(b.last_seen_at || b.started_at).getTime() -
        new Date(a.last_seen_at || a.started_at).getTime()
    })
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

  // Refresh transcript — load all messages (no limit)
  const refreshTranscript = useCallback((sid: string) => {
    api.getTranscript(sid, { limit: 10000, offset: 0 })
      .then(r => {
        const t = r.total ?? r.messages.length
        transcriptCache.current.set(sid, {
          messages: r.messages,
          file_found: r.file_found,
          total: t,
          has_more: false,
          loadedFrom: 0,
        })
        // Only update if still selected
        setSelectedId(prev => {
          if (prev === sid) {
            setTranscript(r.messages)
            setFileFound(r.file_found)
            setTotal(t)
            totalRef.current = t
            setLoadedFrom(0)
            setHasMore(false)
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

    // Fetch full question list (lightweight)
    api.getQuestions(id)
      .then(r => setAllQuestions(r.questions))
      .catch(() => setAllQuestions([]))

    // Fetch latest messages first for quick display, then auto-load rest
    api.getTranscript(id, { limit: initialLimit })
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

        // Auto-load remaining older messages if there are more
        // 立即设置 loadingMore=true + hasMore=false，防止 Virtuoso startReached 并发触发 loadMore 导致重复
        if (autoLoadAll && hm && from > 0) {
          setLoadingMore(true)
          setHasMore(false)
          api.getTranscript(id, { limit: from, offset: 0 })
            .then(rest => {
              if (selectedIdRef.current !== id) return // switched away
              const allMessages = [...rest.messages, ...r.messages]
              transcriptCache.current.set(id, {
                messages: allMessages,
                file_found: r.file_found,
                total: t,
                has_more: false,
                loadedFrom: 0,
              })
              setTranscript(allMessages)
              setLoadedFrom(0)
              setHasMore(false)
              setLoadingMore(false)
            })
            .catch(() => setLoadingMore(false))
        }
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

  // Load all remaining older messages at once (for QuestionNav jump to unloaded area)
  const loadAll = useCallback(() => {
    const sid = selectedIdRef.current
    if (!sid || loadedFrom <= 0) return
    setLoadingMore(true)
    api.getTranscript(sid, { limit: loadedFrom, offset: 0 })
      .then(r => {
        setTranscript(prev => [...r.messages, ...prev])
        setLoadedFrom(0)
        setHasMore(false)
        setLoadingMore(false)
      })
      .catch(() => setLoadingMore(false))
  }, [loadedFrom])

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
    setAllQuestions([])
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
    loadAll,
    hasMore,
    loadingMore,
    total,
    loadedFrom,
    allQuestions,
    isFirstLoad,
  }
}
