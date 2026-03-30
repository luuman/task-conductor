/**
 * ChatStore 上下文隔离层
 *
 * - FloatingAssistant（全局 AI）：不提供 Provider，使用全局 useChatStore
 * - ChatReportPage（局部会话）：用 createLocalChatStore() + ChatStoreCtx.Provider 提供独立状态
 */

import { createContext, useContext } from 'react'
import { createStore, useStore, type StoreApi } from 'zustand'
import { useChatStore, type ChatStore } from './chat'

/**
 * Context 默认值指向全局 useChatStore（本身就是 StoreApi）。
 * 凡不被 Provider 包裹的组件，读取全局状态；被包裹的则读取局部状态。
 */
export const ChatStoreCtx = createContext<StoreApi<ChatStore>>(
  useChatStore as unknown as StoreApi<ChatStore>,
)

/** 在组件渲染中订阅当前 context 里的 chat store（响应式） */
export function useActiveChatStore(): ChatStore {
  const store = useContext(ChatStoreCtx)
  return useStore(store)
}

/**
 * 在回调 / 事件处理中获取当前 context 的 store API（非响应式，仅用 getState/setState）。
 * 必须在组件顶层调用（符合 Hooks 规则），然后在回调里使用返回值。
 */
export function useActiveChatStoreApi(): StoreApi<ChatStore> {
  return useContext(ChatStoreCtx)
}

/** 创建一个独立的、非持久化的局部 chat store（供 ChatReportPage 使用） */
export function createLocalChatStore(): StoreApi<ChatStore> {
  return createStore<ChatStore>()((set) => ({
    isOpen: false,
    isMinimized: false,
    position: { x: -1, y: -1 },

    activeTaskId: null,
    messages: [],
    currentReply: '',
    isGenerating: false,
    systemPrompt: '',
    claudeSessionId: null,
    selectedModel: 'claude-sonnet-4-20250514',
    lastStats: null,
    permissionMode: 'default',

    prdContent: null,
    prdSidebarOpen: false,
    inputDraft: '',

    pageContext: { page: 'chat' },
    projectCwd: null,

    toggle:           () => set((s) => ({ isOpen: !s.isOpen, isMinimized: false })),
    minimize:         () => set({ isMinimized: true }),
    restore:          () => set({ isMinimized: false }),
    close:            () => set({ isOpen: false, isMinimized: false }),
    setPosition:      (pos) => set({ position: pos }),
    setPageContext:   (ctx) => set({ pageContext: ctx }),
    setProjectCwd:    (cwd) => set({ projectCwd: cwd }),
    setActiveTaskId:  (id)  => set({ activeTaskId: id, messages: [], currentReply: '' }),
    addMessage:       (msg) => set((s) => ({ messages: [...s.messages, msg] })),
    setMessages:      (msgs) => set({ messages: msgs }),
    setCurrentReply:  (text) => set({ currentReply: text }),
    appendCurrentReply: (text) => set((s) => ({ currentReply: s.currentReply + text })),
    setIsGenerating:  (v) => set({ isGenerating: v }),
    setSystemPrompt:  (prompt) => set({ systemPrompt: prompt }),
    setClaudeSessionId: (id) => set({ claudeSessionId: id }),
    setPrd:           (prd) => set({ prdContent: prd }),
    togglePrdSidebar: () => set((s) => ({ prdSidebarOpen: !s.prdSidebarOpen })),
    openPrdSidebar:   () => set({ prdSidebarOpen: true }),
    closePrdSidebar:  () => set({ prdSidebarOpen: false }),
    setSelectedModel: (model) => set({ selectedModel: model }),
    setLastStats:     (stats) => set({ lastStats: stats }),
    setInputDraft:    (text) => set({ inputDraft: text }),
    setPermissionMode: (mode) => set({ permissionMode: mode }),
  }))
}
