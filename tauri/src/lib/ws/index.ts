// tauri/src/lib/ws/index.ts
import { isTauri } from '../tauri'
import { BrowserWsManager } from './browser'
import { TauriWsManager } from './tauri-ws'
import type { WsManager } from './types'

const WS_WORKER_URL = '/ws-core/ws-worker.js'

export const wsManager: WsManager = isTauri()
  ? new TauriWsManager()
  : new BrowserWsManager(WS_WORKER_URL)

export type { AiStreamEvent, WsManager, WsStatus, Unsubscribe } from './types'
