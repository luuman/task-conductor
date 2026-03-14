// tauri/src/lib/ws/browser.ts
import type { AiStreamEvent, Unsubscribe, WsManager, WsStatus } from './types'

interface ChannelState {
  worker: Worker
  status: WsStatus
  handlers: Set<(event: AiStreamEvent) => void>
  url: string
}

export class BrowserWsManager implements WsManager {
  private channels = new Map<string, ChannelState>()
  private workerUrl: string

  constructor(workerUrl: string) {
    this.workerUrl = workerUrl
  }

  connect(channel: string, url: string): void {
    if (this.channels.has(channel)) return

    const worker = new Worker(this.workerUrl, { type: 'module' })
    const state: ChannelState = {
      worker,
      status: 'disconnected',
      handlers: new Set(),
      url,
    }
    this.channels.set(channel, state)

    worker.onmessage = (e) => {
      const { type, payload, status } = e.data
      if (type === 'message') {
        try {
          const event: AiStreamEvent = typeof payload === 'string'
            ? JSON.parse(payload)
            : payload
          state.handlers.forEach((h) => h(event))
        } catch (err) {
          console.error('[WsManager] parse error', err)
        }
      } else if (type === 'status') {
        state.status = status as WsStatus
      }
    }

    worker.postMessage({ type: 'connect', url })
    state.status = 'reconnecting'
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
    if (state?.status === 'connected') {
      state.worker.postMessage({ type: 'send', data: JSON.stringify(data) })
    }
  }

  status(channel: string): WsStatus {
    return this.channels.get(channel)?.status ?? 'disconnected'
  }

  disconnect(channel: string): void {
    const state = this.channels.get(channel)
    if (state) {
      state.worker.postMessage({ type: 'close' })
      state.worker.terminate()
      this.channels.delete(channel)
    }
  }
}
