import { create } from 'zustand'
import type { InterviewMessage } from '../api/types'

export interface PageContext {
  page: string
  projectId?: number
  taskId?: number
  taskTitle?: string
  taskStage?: string
}

interface ChatStore {
  // 悬浮面板状态
  isOpen: boolean
  isMinimized: boolean
  position: { x: number; y: number }

  // 当前访谈上下文
  activeTaskId: number | null
  messages: InterviewMessage[]
  currentReply: string
  isGenerating: boolean
  systemPrompt: string
  claudeSessionId: string | null

  // PRD
  prdContent: string | null
  prdSidebarOpen: boolean

  // 页面上下文
  pageContext: PageContext
  projectCwd: string | null

  // Actions
  toggle(): void
  minimize(): void
  restore(): void
  close(): void
  setPosition(pos: { x: number; y: number }): void
  setPageContext(ctx: PageContext): void
  setProjectCwd(cwd: string | null): void
  setActiveTaskId(id: number | null): void
  addMessage(msg: InterviewMessage): void
  setMessages(msgs: InterviewMessage[]): void
  setCurrentReply(text: string): void
  appendCurrentReply(text: string): void
  setIsGenerating(v: boolean): void
  setSystemPrompt(prompt: string): void
  setClaudeSessionId(id: string | null): void
  setPrd(prd: string | null): void
  togglePrdSidebar(): void
  openPrdSidebar(): void
  closePrdSidebar(): void
}

export const useChatStore = create<ChatStore>()((set) => ({
  isOpen: false,
  isMinimized: false,
  position: { x: -1, y: -1 }, // -1 表示使用默认位置（右下角）

  activeTaskId: null,
  messages: [],
  currentReply: '',
  isGenerating: false,
  systemPrompt: '',
  claudeSessionId: null,

  prdContent: null,
  prdSidebarOpen: false,

  pageContext: { page: 'dashboard' },

  toggle: () => set((s) => ({ isOpen: !s.isOpen, isMinimized: false })),
  minimize: () => set({ isMinimized: true }),
  restore: () => set({ isMinimized: false }),
  close: () => set({ isOpen: false, isMinimized: false }),
  setPosition: (pos) => set({ position: pos }),
  setPageContext: (ctx) => set({ pageContext: ctx }),
  setActiveTaskId: (id) => set({ activeTaskId: id, messages: [], currentReply: '' }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setMessages: (msgs) => set({ messages: msgs }),
  setCurrentReply: (text) => set({ currentReply: text }),
  appendCurrentReply: (text) => set((s) => ({ currentReply: s.currentReply + text })),
  setIsGenerating: (v) => set({ isGenerating: v }),
  setSystemPrompt: (prompt) => set({ systemPrompt: prompt }),
  setClaudeSessionId: (id) => set({ claudeSessionId: id }),
  setPrd: (prd) => set({ prdContent: prd }),
  togglePrdSidebar: () => set((s) => ({ prdSidebarOpen: !s.prdSidebarOpen })),
  openPrdSidebar: () => set({ prdSidebarOpen: true }),
  closePrdSidebar: () => set({ prdSidebarOpen: false }),
}))
