// tauri/src/lib/tauri.ts

declare global {
  interface Window {
    __TAURI__?: unknown
  }
}

/** 判断当前是否运行在 Tauri 桌面环境 */
export const isTauri = (): boolean =>
  typeof window !== 'undefined' && typeof window.__TAURI__ !== 'undefined'
