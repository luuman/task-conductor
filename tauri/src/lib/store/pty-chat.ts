import { create } from 'zustand'

export interface PtySession {
  id: string
  label: string
  alive: boolean
  createdAt: number
}

interface PtyChatStore {
  isOpen: boolean
  isMinimized: boolean
  position: { x: number; y: number }
  sidebarOpen: boolean

  sessions: PtySession[]
  activeSessionId: string | null

  toggle(): void
  minimize(): void
  restore(): void
  close(): void
  setPosition(pos: { x: number; y: number }): void
  setSidebarOpen(v: boolean): void

  addSession(session: PtySession): void
  removeSession(id: string): void
  setActiveSession(id: string | null): void
  updateSessionAlive(id: string, alive: boolean): void
  renameSession(id: string, label: string): void
}

let sessionCounter = 0

export function generateSessionId(): string {
  sessionCounter++
  return `pty-${Date.now()}-${sessionCounter}`
}

export const usePtyChatStore = create<PtyChatStore>()((set) => ({
  isOpen: false,
  isMinimized: false,
  position: { x: -1, y: -1 },
  sidebarOpen: true,

  sessions: [],
  activeSessionId: null,

  toggle: () => set((s) => ({ isOpen: !s.isOpen, isMinimized: false })),
  minimize: () => set({ isMinimized: true }),
  restore: () => set({ isMinimized: false }),
  close: () => set({ isOpen: false, isMinimized: false }),
  setPosition: (pos) => set({ position: pos }),
  setSidebarOpen: (v) => set({ sidebarOpen: v }),

  addSession: (session) => set((s) => ({
    sessions: [...s.sessions, session],
    activeSessionId: session.id,
  })),
  removeSession: (id) => set((s) => {
    const sessions = s.sessions.filter(ss => ss.id !== id)
    const activeSessionId = s.activeSessionId === id
      ? (sessions.length > 0 ? sessions[sessions.length - 1].id : null)
      : s.activeSessionId
    return { sessions, activeSessionId }
  }),
  setActiveSession: (id) => set({ activeSessionId: id }),
  updateSessionAlive: (id, alive) => set((s) => ({
    sessions: s.sessions.map(ss => ss.id === id ? { ...ss, alive } : ss),
  })),
  renameSession: (id, label) => set((s) => ({
    sessions: s.sessions.map(ss => ss.id === id ? { ...ss, label } : ss),
  })),
}))
