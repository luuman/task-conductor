// tauri/src/lib/ws/tauri-ws.ts
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { AiStreamEvent, Unsubscribe, WsManager, WsStatus } from './types'

interface ChannelState {
  status: WsStatus
  handlers: Set<(event: AiStreamEvent) => void>
  unlisten?: UnlistenFn
}

export class TauriWsManager implements WsManager {
  private channels = new Map<string, ChannelState>()

  connect(channel: string, _url: string): void {
    if (this.channels.has(channel)) return

    const state: ChannelState = {
      status: 'disconnected',
      handlers: new Set(),
    }
    this.channels.set(channel, state)

    listen<string>(`ws:${channel}`, (tauriEvent) => {
      try {
        const event: AiStreamEvent = typeof tauriEvent.payload === 'string'
          ? JSON.parse(tauriEvent.payload)
          : tauriEvent.payload
        state.handlers.forEach((h) => h(event))
      } catch (err) {
        console.error(`[TauriWsManager] parse error on channel "${channel}"`, err)
      }
    }).then((unlisten) => {
      state.unlisten = unlisten
    })

    emit(`ws:connect:${channel}`, { channel }).catch(console.error)
    state.status = 'reconnecting'
  }

  subscribe(channel: string, handler: (event: AiStreamEvent) => void): Unsubscribe {
    const state = this.channels.get(channel)
    if (!state) {
      console.warn(`[TauriWsManager] channel "${channel}" not connected.`)
      return () => {}
    }
    state.handlers.add(handler)
    return () => state.handlers.delete(handler)
  }

  send(channel: string, data: unknown): void {
    emit(`ws:send:${channel}`, { data: JSON.stringify(data) }).catch(console.error)
  }

  status(channel: string): WsStatus {
    return this.channels.get(channel)?.status ?? 'disconnected'
  }

  disconnect(channel: string): void {
    const state = this.channels.get(channel)
    if (state) {
      state.unlisten?.()
      emit(`ws:disconnect:${channel}`, {}).catch(console.error)
      this.channels.delete(channel)
    }
  }
}
