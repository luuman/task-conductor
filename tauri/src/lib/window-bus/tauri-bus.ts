import { emit as tauriEmit, listen } from '@tauri-apps/api/event'
import type { WindowBus, WindowBusHandler, Unsubscribe } from './types'

export class TauriWindowBus implements WindowBus {
  emit(event: string, data: unknown): void {
    tauriEmit(`bus:${event}`, data).catch(console.error)
  }

  on(event: string, handler: WindowBusHandler): Unsubscribe {
    let unlisten: (() => void) | undefined
    listen<unknown>(`bus:${event}`, (e) => handler(e.payload))
      .then((fn) => { unlisten = fn })
      .catch(console.error)
    return () => unlisten?.()
  }
}
