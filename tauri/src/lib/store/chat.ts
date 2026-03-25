import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TranscriptMessage } from '../api/types'

export interface PageContext {
  page: string
  projectId?: number
  taskId?: number
  taskTitle?: string
  taskStage?: string
}

export interface ChatStats {
  cost_usd?: number
  duration_ms?: number
  input_tokens?: number
  output_tokens?: number
}

interface ChatStore {
  // 悬浮面板状态
  isOpen: boolean
  isMinimized: boolean
  position: { x: number; y: number }

  // 当前访谈上下文
  activeTaskId: number | null
  messages: TranscriptMessage[]
  currentReply: string
  isGenerating: boolean
  systemPrompt: string
  claudeSessionId: string | null
  selectedModel: string
  lastStats: ChatStats | null

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
  addMessage(msg: TranscriptMessage): void
  setMessages(msgs: TranscriptMessage[]): void
  setCurrentReply(text: string): void
  appendCurrentReply(text: string): void
  setIsGenerating(v: boolean): void
  setSystemPrompt(prompt: string): void
  setClaudeSessionId(id: string | null): void
  setPrd(prd: string | null): void
  togglePrdSidebar(): void
  openPrdSidebar(): void
  closePrdSidebar(): void
  setSelectedModel(model: string): void
  setLastStats(stats: ChatStats | null): void
  // 临时输入草稿（供 empty state 建议卡片填充输入框）
  inputDraft: string
  setInputDraft(text: string): void
}

export const useChatStore = create<ChatStore>()(persist((set) => ({
  isOpen: false,
  isMinimized: false,
  position: { x: -1, y: -1 }, // -1 表示使用默认位置（右下角）

  activeTaskId: null,
  messages: [],
  currentReply: '',
  isGenerating: false,
  systemPrompt: '',
  claudeSessionId: null,
  selectedModel: 'claude-sonnet-4-20250514',
  lastStats: null,

  prdContent: null,
  prdSidebarOpen: false,
  inputDraft: '',

  pageContext: { page: 'dashboard' },
  projectCwd: null,

  toggle: () => set((s) => ({ isOpen: !s.isOpen, isMinimized: false })),
  minimize: () => set({ isMinimized: true }),
  restore: () => set({ isMinimized: false }),
  close: () => set({ isOpen: false, isMinimized: false }),
  setPosition: (pos) => set({ position: pos }),
  setPageContext: (ctx) => set({ pageContext: ctx }),
  setProjectCwd: (cwd) => set({ projectCwd: cwd }),
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
  setInputDraft: (text) => set({ inputDraft: text }),
}), {
  name: 'tc-chat',
  partialize: (state) => ({
    messages: state.messages.slice(-50),  // 只保留最近 50 条
    claudeSessionId: state.claudeSessionId,
    projectCwd: state.projectCwd,
  }),
}))
