import { create } from 'zustand'
import { windowBus } from '../window-bus'

interface AuthStore {
  token: string | null
  login(token: string): void
  logout(): void
  _syncFrom(token: string | null): void
}

export const useAuthStore = create<AuthStore>()((set) => ({
  token: localStorage.getItem('tc_token'),

  login(token) {
    localStorage.setItem('tc_token', token)
    set({ token })
    windowBus.emit('auth_changed', { token })
  },

  logout() {
    localStorage.removeItem('tc_token')
    set({ token: null })
    windowBus.emit('auth_changed', { token: null })
  },

  _syncFrom(token) {
    if (token) localStorage.setItem('tc_token', token)
    else localStorage.removeItem('tc_token')
    set({ token })
  },
}))

export function initAuthSync() {
  return windowBus.on('auth_changed', (data) => {
    const { token } = data as { token: string | null }
    useAuthStore.getState()._syncFrom(token)
  })
}
