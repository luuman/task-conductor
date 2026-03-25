import { createContext, useContext } from 'react'
import type { ThemeJSON } from './tokens'

export interface ThemeContextValue {
  theme: string
  mode: 'dark' | 'light'
  setTheme: (name: string) => void
  setMode: (mode: 'dark' | 'light') => void
  themes: string[]
  themeList: ThemeJSON[]
  registerTheme: (json: ThemeJSON) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return ctx
}
