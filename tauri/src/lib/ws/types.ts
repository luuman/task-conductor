// tauri/src/lib/ws/types.ts

export interface AiStreamEvent {
  event_type: string
  provider: string
  session_id: string
  payload: unknown
  ts: string
}

export type WsStatus = 'connected' | 'disconnected' | 'reconnecting'
export type Unsubscribe = () => void

export interface WsManager {
  subscribe(channel: string, handler: (event: AiStreamEvent) => void): Unsubscribe
  send(channel: string, data: unknown): void
  status(channel: string): WsStatus
  connect(channel: string, url: string): void
  disconnect(channel: string): void
}
