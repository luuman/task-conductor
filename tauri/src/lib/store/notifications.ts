import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type NotificationType =
  | 'approval_required'
  | 'stage_failed'
  | 'task_done'
  | 'stage_advanced'
  | 'claude_waiting'
  | 'tool_failure'
  | 'session_start'
  | 'session_stop'
  | 'connection_lost'
  | 'connection_restored'

export type NotificationLevel = 'critical' | 'warning' | 'info'

export interface NotificationItem {
  id: string
  type: NotificationType
  level: NotificationLevel
  title: string
  message: string
  ts: string
  read: boolean
  taskId?: number
  sessionId?: string
  stage?: string
}

interface NotificationStore {
  items: NotificationItem[]
  panelOpen: boolean
  push(item: Omit<NotificationItem, 'id' | 'ts' | 'read'>): void
  markRead(id: string): void
  markAllRead(): void
  remove(id: string): void
  clearAll(): void
  togglePanel(): void
  setPanel(open: boolean): void
}

let counter = 0
function genId() {
  return `n_${Date.now()}_${++counter}`
}

const MAX_ITEMS = 200

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set) => ({
      items: [],
      panelOpen: false,

      push(partial) {
        const item: NotificationItem = {
          ...partial,
          id: genId(),
          ts: new Date().toISOString(),
          read: false,
        }
        set(state => ({
          items: [item, ...state.items].slice(0, MAX_ITEMS),
        }))
      },

      markRead(id) {
        set(state => ({
          items: state.items.map(n => n.id === id ? { ...n, read: true } : n),
        }))
      },

      markAllRead() {
        set(state => ({
          items: state.items.map(n => ({ ...n, read: true })),
        }))
      },

      remove(id) {
        set(state => ({
          items: state.items.filter(n => n.id !== id),
        }))
      },

      clearAll() {
        set({ items: [] })
      },

      togglePanel() {
        set(state => ({ panelOpen: !state.panelOpen }))
      },

      setPanel(open) {
        set({ panelOpen: open })
      },
    }),
    {
      name: 'tc-notifications',
      partialize: (state) => ({ items: state.items }),
    }
  )
)
