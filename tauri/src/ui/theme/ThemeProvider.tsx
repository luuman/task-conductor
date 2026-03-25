import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { ThemeContext, type ThemeContextValue } from './useTheme'
import { resolveTheme, type ThemeJSON } from './tokens'
import darkPlus from './themes/dark-plus.json'
import { ALL_THEMES } from './themes/index'

const STORAGE_KEY = 'tc-theme'
const DEFAULT_THEME = 'Dark+'
const FALLBACK: ThemeJSON = darkPlus as ThemeJSON

function getInitialThemeName(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

function applyThemeToDOM(vars: Record<string, string>, type: 'dark' | 'light') {
  const root = document.documentElement
  for (const [prop, value] of Object.entries(vars)) {
    root.style.setProperty(prop, value)
  }
  root.setAttribute('data-theme', type)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const registry = useRef<Map<string, ThemeJSON>>(
    new Map(ALL_THEMES.map(t => [t.name, t]))
  )

  const [themeName, setThemeName] = useState(getInitialThemeName)

  const currentTheme = registry.current.get(themeName) ?? FALLBACK

  useEffect(() => {
    const vars = resolveTheme(currentTheme, FALLBACK)
    applyThemeToDOM(vars, currentTheme.type)
    try {
      localStorage.setItem(STORAGE_KEY, themeName)
    } catch { /* ignore */ }
  }, [themeName, currentTheme])

  // 跨窗口/标签页同步：监听其他窗口写入 localStorage 触发的 storage 事件
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue && registry.current.has(e.newValue)) {
        setThemeName(e.newValue)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setTheme = useCallback((name: string) => {
    if (!registry.current.has(name)) {
      console.warn(`[ThemeProvider] Theme "${name}" is not registered. Ignoring.`)
      return
    }
    setThemeName(name)
  }, [])

  const registerTheme = useCallback((json: ThemeJSON) => {
    registry.current.set(json.name, json)
  }, [])

  const value: ThemeContextValue = {
    theme: themeName,
    themeType: currentTheme.type,
    setTheme,
    themes: Array.from(registry.current.keys()),
    themeList: Array.from(registry.current.values()),
    registerTheme,
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}
