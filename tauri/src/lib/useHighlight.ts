import { useState, useEffect } from 'react'
import { LRUCache } from './lru-cache'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import json from 'highlight.js/lib/languages/json'

// Register minimal languages for fallback (main-thread sync)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('json', json)

function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return hash.toString(36)
}

// Worker lazy init
let worker: Worker | null = null
let workerAvailable = true
const cache = new LRUCache<string, string>(500)
const pending = new Map<string, Array<(html: string) => void>>()

function getWorker(): Worker | null {
  if (!workerAvailable) return null
  if (!worker) {
    try {
      worker = new Worker(new URL('./hljs-worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (e: MessageEvent<{ id: string; html: string }>) => {
        const { id, html } = e.data
        cache.set(id, html)
        const cbs = pending.get(id)
        if (cbs) {
          cbs.forEach(cb => cb(html))
          pending.delete(id)
        }
      }
    } catch {
      workerAvailable = false
      return null
    }
  }
  return worker
}

export function useHighlight(code: string, language?: string): { html: string; loading: boolean } {
  const key = `${language || 'auto'}:${simpleHash(code)}`
  const cached = cache.get(key)
  const [html, setHtml] = useState(cached || '')
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    if (cache.has(key)) {
      const val = cache.get(key)!
      setHtml(val)
      setLoading(false)
      return
    }

    const w = getWorker()
    if (!w) {
      // Fallback: main-thread synchronous highlighting
      try {
        const result = language
          ? hljs.highlight(code, { language, ignoreIllegals: true }).value
          : hljs.highlightAuto(code).value
        cache.set(key, result)
        setHtml(result)
      } catch {
        setHtml(code)
      }
      setLoading(false)
      return
    }

    // Worker async highlighting + unmount safety
    let cancelled = false
    const cb = (result: string) => {
      if (!cancelled) {
        setHtml(result)
        setLoading(false)
      }
    }
    const cbs = pending.get(key) || []
    cbs.push(cb)
    pending.set(key, cbs)
    w.postMessage({ id: key, code, language })

    return () => {
      cancelled = true
      const callbacks = pending.get(key)
      if (callbacks) {
        const idx = callbacks.indexOf(cb)
        if (idx >= 0) callbacks.splice(idx, 1)
        if (callbacks.length === 0) pending.delete(key)
      }
    }
  }, [key, code, language])

  return { html, loading }
}
