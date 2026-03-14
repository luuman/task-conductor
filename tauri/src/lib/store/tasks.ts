import { create } from 'zustand'

interface TaskStore {
  activeTaskId: string | null
  logBuffer: Record<string, string[]>
  setActiveTaskId(id: string | null): void
  appendLog(taskId: string, line: string): void
  clearLogs(taskId: string): void
}

export const useTaskStore = create<TaskStore>()((set) => ({
  activeTaskId: null,
  logBuffer: {},

  setActiveTaskId: (id) => set({ activeTaskId: id }),

  appendLog(taskId, line) {
    set((state) => {
      const prev = state.logBuffer[taskId] ?? []
      return {
        logBuffer: {
          ...state.logBuffer,
          [taskId]: [...prev, line].slice(-1000),
        },
      }
    })
  },

  clearLogs(taskId) {
    set((state) => {
      const { [taskId]: _, ...rest } = state.logBuffer
      return { logBuffer: rest }
    })
  },
}))
