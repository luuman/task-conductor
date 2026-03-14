import type { WindowBus, WindowBusHandler, Unsubscribe } from './types'

export class BroadcastWindowBus implements WindowBus {
  private channel: BroadcastChannel

  constructor(channelName = 'tc-app') {
    this.channel = new BroadcastChannel(channelName)
  }

  emit(event: string, data: unknown): void {
    this.channel.postMessage({ event, data })
  }

  on(event: string, handler: WindowBusHandler): Unsubscribe {
    const listener = (e: MessageEvent) => {
      if (e.data?.event === event) handler(e.data.data)
    }
    this.channel.addEventListener('message', listener)
    return () => this.channel.removeEventListener('message', listener)
  }
}
