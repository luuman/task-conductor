import { isTauri } from '../tauri'
import { BroadcastWindowBus } from './broadcast'
import { TauriWindowBus } from './tauri-bus'
import type { WindowBus } from './types'

export const windowBus: WindowBus = isTauri()
  ? new TauriWindowBus()
  : new BroadcastWindowBus()

export type { WindowBus, WindowBusHandler } from './types'
