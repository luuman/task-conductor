/**
 * 跨平台剪贴板写入：
 * 1. Tauri 桌面模式 → tauri-plugin-clipboard-manager
 * 2. Web 模式       → navigator.clipboard.writeText
 * 3. 降级兜底       → document.execCommand('copy')
 */
export async function writeClipboard(text: string): Promise<void> {
  // Tauri 桌面模式
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
    await writeText(text)
    return
  }

  // Web 模式：navigator.clipboard
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // fall through to execCommand
    }
  }

  // 兜底：execCommand
  const el = document.createElement('textarea')
  el.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
  el.value = text
  document.body.appendChild(el)
  el.focus()
  el.select()
  document.execCommand('copy')
  document.body.removeChild(el)
}
