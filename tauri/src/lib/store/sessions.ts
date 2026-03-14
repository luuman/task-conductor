import { create } from 'zustand'
import type { AiStreamEvent } from '../ws/types'

export interface AiSession {
  session_id: string
  provider: string
  last_event_ts: string
  event_count: number
}

interface SessionStore {
  sessions: AiSession[]
  events: Record<string, AiStreamEvent[]>
  update(event: AiStreamEvent): void
  clearSession(sessionId: string): void
}

export const useSessionStore = create<SessionStore>()((set) => ({
  sessions: [],
  events: {},

  update(event) {
    set((state) => {
      const existing = state.sessions.find((s) => s.session_id === event.session_id)
      const sessions = existing
        ? state.sessions.map((s) =>
            s.session_id === event.session_id
              ? { ...s, last_event_ts: event.ts, event_count: s.event_count + 1 }
              : s
          )
        : [
            ...state.sessions,
            {
              session_id: event.session_id,
              provider: event.provider,
              last_event_ts: event.ts,
              event_count: 1,
            },
          ]

      const prev = state.events[event.session_id] ?? []
      const next = [...prev, event].slice(-200)

      return {
        sessions,
        events: { ...state.events, [event.session_id]: next },
      }
    })
  },

  clearSession(sessionId) {
    set((state) => ({
      sessions: state.sessions.filter((s) => s.session_id !== sessionId),
      events: Object.fromEntries(
        Object.entries(state.events).filter(([k]) => k !== sessionId)
      ),
    }))
  },
}))
