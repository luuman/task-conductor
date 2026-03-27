// tauri/src/lib/ws/browser.ts
import type { AiStreamEvent, Unsubscribe, WsManager, WsStatus } from './types'

interface ChannelState {
  ws: WebSocket | null
  status: WsStatus
  handlers: Set<(event: AiStreamEvent) => void>
  url: string
  reconnectTimer: ReturnType<typeof setTimeout> | null
  reconnectAttempt: number
}

const MAX_DELAY_MS = 30_000
const INITIAL_DELAY_MS = 500

export class BrowserWsManager implements WsManager {
  private channels = new Map<string, ChannelState>()

  connect(channel: string, url: string): void {
    if (this.channels.has(channel)) return

    const state: ChannelState = {
      ws: null,
      status: 'disconnected',
      handlers: new Set(),
      url,
      reconnectTimer: null,
      reconnectAttempt: 0,
    }
    this.channels.set(channel, state)
    this.openSocket(state)
  }

  private openSocket(state: ChannelState): void {
    try {
      const ws = new WebSocket(state.url)
      state.ws = ws
      state.status = 'reconnecting'

      ws.onopen = () => {
        state.status = 'connected'
        state.reconnectAttempt = 0
      }

      ws.onmessage = (e) => {
        try {
          const event: AiStreamEvent = typeof e.data === 'string'
            ? JSON.parse(e.data)
            : e.data
          state.handlers.forEach((h) => h(event))
        } catch (err) {
          console.error('[WsManager] parse error', err)
        }
      }

      ws.onclose = (e) => {
        state.status = 'disconnected'
        state.ws = null
        if (e.code !== 1000) {
          this.scheduleReconnect(state)
        }
      }

      ws.onerror = () => {
        // onclose will fire after onerror
      }
    } catch {
      state.status = 'disconnected'
      this.scheduleReconnect(state)
    }
  }

  private scheduleReconnect(state: ChannelState): void {
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer)
    const delay = Math.min(
      INITIAL_DELAY_MS * Math.pow(2, state.reconnectAttempt),
      MAX_DELAY_MS,
    )
    state.reconnectAttempt++
    state.status = 'reconnecting'
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null
      this.openSocket(state)
    }, delay)
  }

  subscribe(channel: string, handler: (event: AiStreamEvent) => void): Unsubscribe {
    const state = this.channels.get(channel)
    if (!state) {
      console.warn(`[WsManager] channel "${channel}" not connected. Call connect() first.`)
      return () => {}
    }
    state.handlers.add(handler)
    return () => state.handlers.delete(handler)
  }

  send(channel: string, data: unknown): void {
    const state = this.channels.get(channel)
    if (state?.ws?.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify(data))
    }
  }

  status(channel: string): WsStatus {
    return this.channels.get(channel)?.status ?? 'disconnected'
  }

  disconnect(channel: string): void {
    const state = this.channels.get(channel)
    if (state) {
      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer)
        state.reconnectTimer = null
      }
      if (state.ws) {
        state.ws.close(1000)
        state.ws = null
      }
      this.channels.delete(channel)
    }
  }
}
