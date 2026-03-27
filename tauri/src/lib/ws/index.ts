// tauri/src/lib/ws/index.ts
import { isTauri } from '../tauri'
import { BrowserWsManager } from './browser'
import { TauriWsManager } from './tauri-ws'
import type { WsManager } from './types'

export const wsManager: WsManager = isTauri()
  ? new TauriWsManager()
  : new BrowserWsManager()

export type { AiStreamEvent, WsManager, WsStatus, Unsubscribe } from './types'
