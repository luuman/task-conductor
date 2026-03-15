import { createContext, useContext } from 'react'

export interface ThemeContextValue {
  theme: string
  themeType: 'dark' | 'light'
  setTheme: (name: string) => void
  themes: string[]
  registerTheme: (json: import('./tokens').ThemeJSON) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return ctx
}
