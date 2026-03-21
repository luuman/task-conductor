import { create } from 'zustand'
import type { TranscriptMessage } from '../api/types'

interface PtyChatStore {
  isOpen: boolean
  isMinimized: boolean
  position: { x: number; y: number }

  messages: TranscriptMessage[]
  currentReply: string
  isGenerating: boolean
  ptyAlive: boolean
  sessionId: string | null

  toggle(): void
  minimize(): void
  restore(): void
  close(): void
  setPosition(pos: { x: number; y: number }): void
  addMessage(msg: TranscriptMessage): void
  setMessages(msgs: TranscriptMessage[]): void
  setCurrentReply(text: string): void
  appendCurrentReply(text: string): void
  setIsGenerating(v: boolean): void
  setPtyAlive(v: boolean): void
  setSessionId(id: string | null): void
}

export const usePtyChatStore = create<PtyChatStore>()((set) => ({
  isOpen: false,
  isMinimized: false,
  position: { x: -1, y: -1 },

  messages: [],
  currentReply: '',
  isGenerating: false,
  ptyAlive: false,
  sessionId: null,

  toggle: () => set((s) => ({ isOpen: !s.isOpen, isMinimized: false })),
  minimize: () => set({ isMinimized: true }),
  restore: () => set({ isMinimized: false }),
  close: () => set({ isOpen: false, isMinimized: false }),
  setPosition: (pos) => set({ position: pos }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setMessages: (msgs) => set({ messages: msgs }),
  setCurrentReply: (text) => set({ currentReply: text }),
  appendCurrentReply: (text) => set((s) => ({ currentReply: s.currentReply + text })),
  setIsGenerating: (v) => set({ isGenerating: v }),
  setPtyAlive: (v) => set({ ptyAlive: v }),
  setSessionId: (id) => set({ sessionId: id }),
}))
