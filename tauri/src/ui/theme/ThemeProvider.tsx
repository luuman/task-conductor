import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { ThemeContext, type ThemeContextValue } from './useTheme'
import { resolveTheme, type ThemeJSON } from './tokens'
import darkPlus from './themes/dark-plus.json'
import { ALL_THEMES } from './themes/index'

const STORAGE_KEY = 'tc-theme'
const MODE_KEY = 'tc-mode'
const DEFAULT_THEME = 'Dark+'
const FALLBACK: ThemeJSON = darkPlus as ThemeJSON

function getInitialThemeName(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

function getInitialMode(): 'dark' | 'light' {
  try {
    const stored = localStorage.getItem(MODE_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch { /* ignore */ }
  return 'dark'
}

function applyThemeToDOM(vars: Record<string, string>, mode: 'dark' | 'light') {
  const root = document.documentElement
  for (const [prop, value] of Object.entries(vars)) {
    root.style.setProperty(prop, value)
  }
  root.setAttribute('data-theme', mode)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const registry = useRef<Map<string, ThemeJSON>>(
    new Map(ALL_THEMES.map(t => [t.name, t]))
  )

  const [themeName, setThemeName] = useState(getInitialThemeName)
  const [mode, setModeState] = useState<'dark' | 'light'>(getInitialMode)

  const currentTheme = registry.current.get(themeName) ?? FALLBACK

  useEffect(() => {
    const colors = currentTheme[mode] ?? currentTheme.dark
    const fallbackColors = FALLBACK[mode] ?? FALLBACK.dark
    const vars = resolveTheme(colors, fallbackColors)
    applyThemeToDOM(vars, mode)
    try {
      localStorage.setItem(STORAGE_KEY, themeName)
      localStorage.setItem(MODE_KEY, mode)
    } catch { /* ignore */ }
  }, [themeName, currentTheme, mode])

  // 跨窗口/标签页同步
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue && registry.current.has(e.newValue)) {
        setThemeName(e.newValue)
      }
      if (e.key === MODE_KEY && (e.newValue === 'dark' || e.newValue === 'light')) {
        setModeState(e.newValue)
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

  const setMode = useCallback((m: 'dark' | 'light') => {
    setModeState(m)
  }, [])

  const registerTheme = useCallback((json: ThemeJSON) => {
    registry.current.set(json.name, json)
  }, [])

  const value: ThemeContextValue = {
    theme: themeName,
    mode,
    setTheme,
    setMode,
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
