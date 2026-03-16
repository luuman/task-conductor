import { isTauri } from '../tauri'
import { HttpAdapter } from './http'
import type { ApiAdapter, ApiMode } from './types'

function detectMode(): ApiMode {
  if (isTauri()) return 'tauri-ipc'
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return 'local-http'
  return 'remote-http'
}

export const api: ApiAdapter = new HttpAdapter(detectMode())

export type { ApiAdapter, ApiMode, Project, Task, AiSession, SessionEvent, StageArtifact, Settings } from './types'
