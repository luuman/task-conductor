import { create } from 'zustand'

interface PtyChatStore {
  isOpen: boolean
  isMinimized: boolean
  position: { x: number; y: number }
  ptyAlive: boolean

  toggle(): void
  minimize(): void
  restore(): void
  close(): void
  setPosition(pos: { x: number; y: number }): void
  setPtyAlive(v: boolean): void
}

export const usePtyChatStore = create<PtyChatStore>()((set) => ({
  isOpen: false,
  isMinimized: false,
  position: { x: -1, y: -1 },
  ptyAlive: false,

  toggle: () => set((s) => ({ isOpen: !s.isOpen, isMinimized: false })),
  minimize: () => set({ isMinimized: true }),
  restore: () => set({ isMinimized: false }),
  close: () => set({ isOpen: false, isMinimized: false }),
  setPosition: (pos) => set({ position: pos }),
  setPtyAlive: (v) => set({ ptyAlive: v }),
}))
