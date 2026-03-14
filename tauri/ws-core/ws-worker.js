// ws-core/ws-worker.js
// Web Worker 入口：在独立线程中加载 ws-core WASM，管理 WebSocket 连接
// 主线程通过 postMessage 通信，消息格式：{ type, ...fields }

import init, { WsHandle } from './pkg/ws_core.js'

let handle = null
let initialized = false

// 重连状态（Worker 负责管理重连，避免主线程阻塞）
let reconnectTimer = null
let currentUrl = null
let reconnectAttempt = 0
const MAX_DELAY_MS = 30_000
const INITIAL_DELAY_MS = 500

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  const delay = Math.min(INITIAL_DELAY_MS * Math.pow(2, reconnectAttempt), MAX_DELAY_MS)
  reconnectAttempt++
  self.postMessage({ type: 'status', status: 'reconnecting', attempt: reconnectAttempt, delay })
  reconnectTimer = setTimeout(() => connect(currentUrl), delay)
}

async function connect(url) {
  currentUrl = url
  if (!initialized) {
    await init()
    initialized = true
  }

  if (handle) {
    handle.close()
    handle = null
  }

  try {
    handle = new WsHandle(
      url,
      // on_message: 转发给主线程
      (msgJson) => {
        self.postMessage({ type: 'message', payload: msgJson })
      },
      // on_close: 触发重连
      (code) => {
        self.postMessage({ type: 'status', status: 'disconnected', code })
        if (code !== 1000) { // 非正常关闭才重连
          scheduleReconnect()
        }
      }
    )
    reconnectAttempt = 0
    self.postMessage({ type: 'status', status: 'connected' })
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) })
    scheduleReconnect()
  }
}

self.onmessage = async (e) => {
  const { type, url, data } = e.data

  switch (type) {
    case 'connect':
      await connect(url)
      break

    case 'send':
      if (handle) {
        try {
          handle.send(data)
        } catch (err) {
          self.postMessage({ type: 'error', message: `send failed: ${err}` })
        }
      }
      break

    case 'close':
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      if (handle) {
        handle.close()
        handle = null
      }
      self.postMessage({ type: 'status', status: 'disconnected', code: 1000 })
      break

    default:
      self.postMessage({ type: 'error', message: `unknown message type: ${type}` })
  }
}
