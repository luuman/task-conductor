# Tauri Layout Shell Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement VS Code-style layout skeleton with custom UI library, theme engine, and icon system for the Tauri desktop app.

**Architecture:** CSS Modules + CSS Variables for styling (no Tailwind). Two-layer theme token system (base → semantic) with JSON-based theme files. Layout uses CSS Grid (AppShell) with flexbox sub-layouts (TopBar, Sidebar, Panel). All components are React functional components with TypeScript.

**Tech Stack:** React 19, TypeScript, CSS Modules, CSS Variables, Vite

**Spec:** `docs/superpowers/specs/2026-03-16-tauri-layout-shell-design.md`

---

## Chunk 1: Cleanup & Foundation

### Task 1: Remove Tailwind dependencies and scaffold files

**Files:**
- Delete: `tauri/src/App.tsx`
- Delete: `tauri/src/App.css`
- Delete: `tauri/src/components/ui/button.tsx`
- Delete: `tauri/src/lib/utils.ts`
- Delete: `tauri/src/index.css`
- Delete: `tauri/src/assets/react.svg`
- Modify: `tauri/package.json`
- Modify: `tauri/vite.config.ts`

- [ ] **Step 1: Uninstall Tailwind and related dependencies**

```bash
cd tauri && pnpm remove tailwindcss @tailwindcss/vite tw-animate-css shadcn class-variance-authority clsx tailwind-merge @base-ui/react lucide-react
```

- [ ] **Step 2: Delete scaffold and Tailwind files**

```bash
cd tauri && rm -f src/App.tsx src/App.css src/index.css src/assets/react.svg src/components/ui/button.tsx src/lib/utils.ts
```

- [ ] **Step 3: Remove @tailwindcss/vite from vite.config.ts**

Modify `tauri/vite.config.ts`: remove the `import tailwindcss` line and `tailwindcss()` from plugins array.

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 7071,
    proxy: {
      '/api':    { target: 'http://localhost:8765', changeOrigin: true },
      '/auth':   { target: 'http://localhost:8765', changeOrigin: true },
      '/health': { target: 'http://localhost:8765', changeOrigin: true },
      '/ws': {
        target: 'ws://localhost:8765',
        ws: true,
        changeOrigin: true,
      },
    },
  },

  build: {
    target: ['es2021', 'chrome105', 'safari15'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },

  envPrefix: ['VITE_', 'TAURI_'],
})
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: remove Tailwind and scaffold files"
```

---

### Task 2: Create global styles (reset.css + global.css)

**Files:**
- Create: `tauri/src/styles/reset.css`
- Create: `tauri/src/styles/global.css`

- [ ] **Step 1: Create reset.css**

Create `tauri/src/styles/reset.css`:

```css
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  height: 100%;
  width: 100%;
}

body {
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

img, picture, video, canvas, svg {
  display: block;
  max-width: 100%;
}

input, button, textarea, select {
  font: inherit;
  color: inherit;
}

button {
  cursor: pointer;
  border: none;
  background: none;
}

ul, ol {
  list-style: none;
}

a {
  color: inherit;
  text-decoration: none;
}

#root {
  height: 100%;
  width: 100%;
  isolation: isolate;
}
```

- [ ] **Step 2: Create global.css**

Create `tauri/src/styles/global.css`:

```css
@import '@fontsource-variable/geist';

body {
  font-family: 'Geist Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI',
    Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  font-size: 13px;
  background-color: var(--tc-content-bg, #1e1e1e);
  color: var(--tc-foreground, #cccccc);
  overflow: hidden;
  user-select: none;
}

/* Scrollbar styling (VS Code style) */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--tc-scrollbar-thumb, rgba(255, 255, 255, 0.2));
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--tc-scrollbar-thumb-hover, rgba(255, 255, 255, 0.3));
}

/* Focus visible for accessibility */
:focus-visible {
  outline: 1px solid var(--tc-focus-ring, #007acc);
  outline-offset: -1px;
}

/* Placeholder pages (temporary) */
.placeholder-page {
  padding: 32px;
  color: var(--tc-foreground-secondary);
}
```

- [ ] **Step 3: Commit**

```bash
git add tauri/src/styles/ && git commit -m "feat: add reset.css and global.css"
```

---

### Task 3: Update main.tsx imports

**Files:**
- Modify: `tauri/src/main.tsx`

- [ ] **Step 1: Update main.tsx to import new styles**

Replace the old `import './index.css'` with the new style imports:

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { AppRouter } from './app/Router'
import { Providers } from './app/Providers'
import './i18n'
import './styles/reset.css'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Providers>
      <AppRouter />
    </Providers>
  </React.StrictMode>
)
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd tauri && npx tsc --noEmit
```

Expected: no errors (some files are deleted so imports may break — fix in later tasks)

- [ ] **Step 3: Commit**

```bash
git add tauri/src/main.tsx && git commit -m "chore: update main.tsx imports to use reset.css and global.css"
```

---

## Chunk 2: Theme System

### Task 4: Create theme tokens and JSON files

**Files:**
- Create: `tauri/src/ui/theme/tokens.ts`
- Create: `tauri/src/ui/theme/themes/dark-plus.json`
- Create: `tauri/src/ui/theme/themes/light-plus.json`

- [ ] **Step 1: Create dark-plus.json**

Create `tauri/src/ui/theme/themes/dark-plus.json`:

```json
{
  "name": "Dark+",
  "type": "dark",
  "colors": {
    "base.bg-primary": "#1e1e1e",
    "base.bg-secondary": "#252526",
    "base.bg-hover": "#2a2d2e",
    "base.fg-primary": "#cccccc",
    "base.fg-secondary": "#969696",
    "base.accent": "#007acc",
    "base.accent-bg": "#094771",
    "base.accent-fg": "#ffffff",
    "base.border": "#3c3c3c",
    "base.border-active": "#007acc",
    "base.error": "#f44747",
    "base.warning": "#cca700",
    "base.success": "#89d185",
    "base.info": "#75beff"
  }
}
```

- [ ] **Step 2: Create light-plus.json**

Create `tauri/src/ui/theme/themes/light-plus.json`:

```json
{
  "name": "Light+",
  "type": "light",
  "colors": {
    "base.bg-primary": "#ffffff",
    "base.bg-secondary": "#f3f3f3",
    "base.bg-hover": "#e8e8e8",
    "base.fg-primary": "#333333",
    "base.fg-secondary": "#717171",
    "base.accent": "#005fb8",
    "base.accent-bg": "#cce5ff",
    "base.accent-fg": "#001a33",
    "base.border": "#e0e0e0",
    "base.border-active": "#005fb8",
    "base.error": "#e51400",
    "base.warning": "#bf8803",
    "base.success": "#16825d",
    "base.info": "#005fb8"
  }
}
```

- [ ] **Step 3: Create tokens.ts**

Create `tauri/src/ui/theme/tokens.ts`:

```typescript
export interface ThemeJSON {
  name: string
  type: 'dark' | 'light'
  colors: Record<string, string>
}

/** All base-layer color keys that a theme JSON must define */
export const BASE_COLOR_KEYS = [
  'base.bg-primary',
  'base.bg-secondary',
  'base.bg-hover',
  'base.fg-primary',
  'base.fg-secondary',
  'base.accent',
  'base.accent-bg',
  'base.accent-fg',
  'base.border',
  'base.border-active',
  'base.error',
  'base.warning',
  'base.success',
  'base.info',
] as const

/**
 * Semantic token mapping: CSS Variable name → base-layer key.
 * Components consume these CSS variables; they never reference base keys directly.
 */
export const SEMANTIC_MAP: Record<string, string> = {
  // General
  '--tc-foreground':              'base.fg-primary',
  '--tc-foreground-secondary':    'base.fg-secondary',
  '--tc-focus-ring':              'base.accent',

  // TopBar
  '--tc-topbar-bg':               'base.bg-secondary',
  '--tc-topbar-fg':               'base.fg-primary',
  '--tc-topbar-border':           'base.border',

  // Sidebar
  '--tc-sidebar-bg':              'base.bg-primary',
  '--tc-sidebar-fg':              'base.fg-primary',
  '--tc-sidebar-item-hover':      'base.bg-hover',
  '--tc-sidebar-item-active-bg':  'base.accent-bg',
  '--tc-sidebar-item-active-fg':  'base.accent-fg',
  '--tc-sidebar-border':          'base.border',

  // Content
  '--tc-content-bg':              'base.bg-primary',

  // Panel
  '--tc-panel-bg':                'base.bg-secondary',
  '--tc-panel-border':            'base.border',

  // Border
  '--tc-border':                  'base.border',
  '--tc-border-active':           'base.border-active',

  // Status
  '--tc-error':                   'base.error',
  '--tc-warning':                 'base.warning',
  '--tc-success':                 'base.success',
  '--tc-info':                    'base.info',

  // Scrollbar
  '--tc-scrollbar-thumb':         'base.bg-hover',
  '--tc-scrollbar-thumb-hover':   'base.fg-secondary',
}

/**
 * Resolve a ThemeJSON into a flat Record<cssVar, colorValue> ready to apply.
 * Missing base keys fall back to the provided fallback theme (typically Dark+).
 */
export function resolveTheme(
  theme: ThemeJSON,
  fallback: ThemeJSON
): Record<string, string> {
  const vars: Record<string, string> = {}

  for (const [cssVar, baseKey] of Object.entries(SEMANTIC_MAP)) {
    vars[cssVar] = theme.colors[baseKey] ?? fallback.colors[baseKey] ?? '#ff00ff'
  }

  return vars
}
```

- [ ] **Step 4: Commit**

```bash
git add tauri/src/ui/theme/ && git commit -m "feat: add theme tokens, Dark+ and Light+ theme JSON"
```

---

### Task 5: Create ThemeProvider and useTheme hook

**Files:**
- Create: `tauri/src/ui/theme/ThemeProvider.tsx`
- Create: `tauri/src/ui/theme/useTheme.ts`
- Create: `tauri/src/ui/theme/index.ts`

- [ ] **Step 1: Create useTheme.ts**

Create `tauri/src/ui/theme/useTheme.ts`:

```typescript
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
```

- [ ] **Step 2: Create ThemeProvider.tsx**

Create `tauri/src/ui/theme/ThemeProvider.tsx`:

```tsx
import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { ThemeContext, type ThemeContextValue } from './useTheme'
import { resolveTheme, type ThemeJSON } from './tokens'
import darkPlus from './themes/dark-plus.json'
import lightPlus from './themes/light-plus.json'

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
    new Map([
      ['Dark+', darkPlus as ThemeJSON],
      ['Light+', lightPlus as ThemeJSON],
    ])
  )

  const [themeName, setThemeName] = useState(getInitialThemeName)

  const currentTheme = registry.current.get(themeName) ?? FALLBACK

  // Apply theme to DOM on mount and when theme changes
  useEffect(() => {
    const vars = resolveTheme(currentTheme, FALLBACK)
    applyThemeToDOM(vars, currentTheme.type)
    try {
      localStorage.setItem(STORAGE_KEY, themeName)
    } catch { /* ignore */ }
  }, [themeName, currentTheme])

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
    registerTheme,
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}
```

- [ ] **Step 3: Create theme index.ts**

Create `tauri/src/ui/theme/index.ts`:

```typescript
export { ThemeProvider } from './ThemeProvider'
export { useTheme } from './useTheme'
export type { ThemeJSON } from './tokens'
```

- [ ] **Step 4: Wire ThemeProvider into Providers.tsx**

Modify `tauri/src/app/Providers.tsx`:

```typescript
import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { initAuthSync } from '../lib/store/auth'
import { ThemeProvider } from '../ui/theme'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
})

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const unsub = initAuthSync()
    return unsub
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add tauri/src/ui/theme/ tauri/src/app/Providers.tsx && git commit -m "feat: add ThemeProvider with Dark+/Light+ and useTheme hook"
```

---

## Chunk 3: Icon System

### Task 6: Create Icon base component and 12 SVG icons

**Files:**
- Create: `tauri/src/ui/icon/Icon.tsx`
- Create: `tauri/src/ui/icon/icons/chevron-left.tsx`
- Create: `tauri/src/ui/icon/icons/chevron-right.tsx`
- Create: `tauri/src/ui/icon/icons/search.tsx`
- Create: `tauri/src/ui/icon/icons/bell.tsx`
- Create: `tauri/src/ui/icon/icons/settings.tsx`
- Create: `tauri/src/ui/icon/icons/message.tsx`
- Create: `tauri/src/ui/icon/icons/plus.tsx`
- Create: `tauri/src/ui/icon/icons/file-text.tsx`
- Create: `tauri/src/ui/icon/icons/layout-grid.tsx`
- Create: `tauri/src/ui/icon/icons/x.tsx`
- Create: `tauri/src/ui/icon/icons/grip-horizontal.tsx`
- Create: `tauri/src/ui/icon/icons/user.tsx`
- Create: `tauri/src/ui/icon/index.ts`

- [ ] **Step 1: Create Icon.tsx base component**

Create `tauri/src/ui/icon/Icon.tsx`:

```tsx
import type { SVGAttributes } from 'react'

export interface IconProps extends SVGAttributes<SVGElement> {
  size?: number
  color?: string
}

export function Icon({
  size = 16,
  color = 'currentColor',
  children,
  ...props
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  )
}
```

- [ ] **Step 2: Create all 12 icon components**

Create each icon file. All icons follow the same pattern — wrapping SVG paths in the `Icon` component. Icons use Lucide-compatible paths (24x24 viewBox, stroke-based).

`tauri/src/ui/icon/icons/chevron-left.tsx`:
```tsx
import { Icon, type IconProps } from '../Icon'
export function IconChevronLeft(props: IconProps) {
  return <Icon {...props}><polyline points="15 18 9 12 15 6" /></Icon>
}
```

`tauri/src/ui/icon/icons/chevron-right.tsx`:
```tsx
import { Icon, type IconProps } from '../Icon'
export function IconChevronRight(props: IconProps) {
  return <Icon {...props}><polyline points="9 18 15 12 9 6" /></Icon>
}
```

`tauri/src/ui/icon/icons/search.tsx`:
```tsx
import { Icon, type IconProps } from '../Icon'
export function IconSearch(props: IconProps) {
  return <Icon {...props}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></Icon>
}
```

`tauri/src/ui/icon/icons/bell.tsx`:
```tsx
import { Icon, type IconProps } from '../Icon'
export function IconBell(props: IconProps) {
  return <Icon {...props}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></Icon>
}
```

`tauri/src/ui/icon/icons/settings.tsx`:
```tsx
import { Icon, type IconProps } from '../Icon'
export function IconSettings(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  )
}
```

`tauri/src/ui/icon/icons/message.tsx`:
```tsx
import { Icon, type IconProps } from '../Icon'
export function IconMessage(props: IconProps) {
  return <Icon {...props}><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" /></Icon>
}
```

`tauri/src/ui/icon/icons/plus.tsx`:
```tsx
import { Icon, type IconProps } from '../Icon'
export function IconPlus(props: IconProps) {
  return <Icon {...props}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Icon>
}
```

`tauri/src/ui/icon/icons/file-text.tsx`:
```tsx
import { Icon, type IconProps } from '../Icon'
export function IconFileText(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </Icon>
  )
}
```

`tauri/src/ui/icon/icons/layout-grid.tsx`:
```tsx
import { Icon, type IconProps } from '../Icon'
export function IconLayoutGrid(props: IconProps) {
  return (
    <Icon {...props}>
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </Icon>
  )
}
```

`tauri/src/ui/icon/icons/x.tsx`:
```tsx
import { Icon, type IconProps } from '../Icon'
export function IconX(props: IconProps) {
  return <Icon {...props}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Icon>
}
```

`tauri/src/ui/icon/icons/grip-horizontal.tsx`:
```tsx
import { Icon, type IconProps } from '../Icon'
export function IconGripHorizontal(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="9" r="1" fill="currentColor" />
      <circle cx="19" cy="9" r="1" fill="currentColor" />
      <circle cx="5" cy="9" r="1" fill="currentColor" />
      <circle cx="12" cy="15" r="1" fill="currentColor" />
      <circle cx="19" cy="15" r="1" fill="currentColor" />
      <circle cx="5" cy="15" r="1" fill="currentColor" />
    </Icon>
  )
}
```

`tauri/src/ui/icon/icons/user.tsx`:
```tsx
import { Icon, type IconProps } from '../Icon'
export function IconUser(props: IconProps) {
  return <Icon {...props}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Icon>
}
```

- [ ] **Step 3: Create icon index.ts**

Create `tauri/src/ui/icon/index.ts`:

```typescript
export { Icon, type IconProps } from './Icon'
export { IconChevronLeft } from './icons/chevron-left'
export { IconChevronRight } from './icons/chevron-right'
export { IconSearch } from './icons/search'
export { IconBell } from './icons/bell'
export { IconSettings } from './icons/settings'
export { IconMessage } from './icons/message'
export { IconPlus } from './icons/plus'
export { IconFileText } from './icons/file-text'
export { IconLayoutGrid } from './icons/layout-grid'
export { IconX } from './icons/x'
export { IconGripHorizontal } from './icons/grip-horizontal'
export { IconUser } from './icons/user'
```

- [ ] **Step 4: Commit icons**

```bash
git add tauri/src/ui/icon/ && git commit -m "feat: add Icon base component and 12 SVG icons"
```

---

### Task 6b: Create Button component (skeleton migration)

**Files:**
- Create: `tauri/src/ui/button/Button.tsx`
- Create: `tauri/src/ui/button/button.module.css`
- Create: `tauri/src/ui/button/index.ts`

- [ ] **Step 1: Create button.module.css**

Create `tauri/src/ui/button/button.module.css`:

```css
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  transition: background 0.15s, opacity 0.15s;
  cursor: pointer;
  user-select: none;
}

.button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Variants */
.default {
  background: var(--tc-border-active);
  color: #ffffff;
}

.default:hover:not(:disabled) {
  opacity: 0.9;
}

.ghost {
  background: transparent;
  color: var(--tc-foreground);
}

.ghost:hover:not(:disabled) {
  background: var(--tc-sidebar-item-hover);
}

.outline {
  background: transparent;
  border: 1px solid var(--tc-border);
  color: var(--tc-foreground);
}

.outline:hover:not(:disabled) {
  background: var(--tc-sidebar-item-hover);
}

/* Sizes */
.sm {
  height: 28px;
  padding: 0 8px;
  font-size: 12px;
}

.md {
  height: 32px;
  padding: 0 12px;
}

.lg {
  height: 36px;
  padding: 0 16px;
}

.icon {
  width: 28px;
  height: 28px;
  padding: 0;
}
```

- [ ] **Step 2: Create Button.tsx**

Create `tauri/src/ui/button/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes } from 'react'
import styles from './button.module.css'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg' | 'icon'
}

export function Button({
  variant = 'default',
  size = 'md',
  className,
  ...props
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    className,
  ].filter(Boolean).join(' ')

  return <button className={classes} {...props} />
}
```

- [ ] **Step 3: Create button index.ts**

Create `tauri/src/ui/button/index.ts`:

```typescript
export { Button, type ButtonProps } from './Button'
```

- [ ] **Step 4: Create ui/index.ts top-level export**

Create `tauri/src/ui/index.ts`:

```typescript
export * from './theme'
export * from './icon'
export * from './button'
```

- [ ] **Step 5: Commit**

```bash
git add tauri/src/ui/ && git commit -m "feat: add Button component and ui barrel export"
```

---

## Chunk 4: Layout Components

### Task 7: Create ShellContext

**Files:**
- Create: `tauri/src/layouts/AppShell/ShellContext.ts`

- [ ] **Step 1: Create ShellContext.ts**

Create `tauri/src/layouts/AppShell/ShellContext.ts`:

```typescript
import { createContext, useContext } from 'react'

export interface ShellContextValue {
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
  togglePanel: () => void
  panelHeight: number
  setPanelHeight: (height: number) => void
}

export const ShellContext = createContext<ShellContextValue | null>(null)

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext)
  if (!ctx) {
    throw new Error('useShell must be used within an AppShell')
  }
  return ctx
}
```

- [ ] **Step 2: Commit**

```bash
git add tauri/src/layouts/AppShell/ShellContext.ts && git commit -m "feat: add ShellContext for layout state management"
```

---

### Task 8: Create TopBar component

**Files:**
- Create: `tauri/src/layouts/TopBar/TopBar.tsx`
- Create: `tauri/src/layouts/TopBar/top-bar.module.css`
- Create: `tauri/src/layouts/TopBar/index.ts`

- [ ] **Step 1: Create top-bar.module.css**

Create `tauri/src/layouts/TopBar/top-bar.module.css`:

```css
.topbar {
  grid-area: topbar;
  display: flex;
  align-items: center;
  height: var(--tc-topbar-height, 46px);
  background: var(--tc-topbar-bg);
  color: var(--tc-topbar-fg);
  border-bottom: 1px solid var(--tc-topbar-border);
  padding: 0 12px;
  gap: 8px;
  /* Tauri: allow window drag on topbar */
  -webkit-app-region: drag;
}

.left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  /* Buttons should not be draggable */
  -webkit-app-region: no-drag;
}

.logo {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.toggleBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  color: var(--tc-topbar-fg);
  transition: background 0.15s;
}

.toggleBtn:hover {
  background: var(--tc-sidebar-item-hover);
}

.center {
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
  -webkit-app-region: no-drag;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--tc-foreground-secondary);
  overflow: hidden;
}

.breadcrumbItem {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.breadcrumbItem:last-child {
  color: var(--tc-topbar-fg);
}

.breadcrumbSep {
  color: var(--tc-foreground-secondary);
  margin: 0 2px;
}

.right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.iconBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  color: var(--tc-foreground-secondary);
  transition: background 0.15s, color 0.15s;
}

.iconBtn:hover {
  background: var(--tc-sidebar-item-hover);
  color: var(--tc-topbar-fg);
}

.avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--tc-sidebar-item-hover);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 4px;
}
```

- [ ] **Step 2: Create TopBar.tsx**

Create `tauri/src/layouts/TopBar/TopBar.tsx`:

```tsx
import type { ReactNode } from 'react'
import { useShell } from '../AppShell/ShellContext'
import { IconChevronLeft, IconChevronRight, IconSearch, IconBell, IconSettings, IconMessage, IconUser } from '../../ui/icon'
import styles from './top-bar.module.css'

export interface BreadcrumbItem {
  label: string
  href?: string
  icon?: ReactNode
}

export interface TopBarProps {
  logo?: ReactNode
  breadcrumb?: BreadcrumbItem[]
  actions?: ReactNode
}

export function TopBar({ logo, breadcrumb, actions }: TopBarProps) {
  const { sidebarCollapsed, toggleSidebar } = useShell()

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        {logo && <span className={styles.logo}>{logo}</span>}
        <button
          className={styles.toggleBtn}
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <IconChevronRight size={16} /> : <IconChevronLeft size={16} />}
        </button>
      </div>

      <div className={styles.center}>
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className={styles.breadcrumb}>
            {breadcrumb.map((item, i) => (
              <span key={i} className={styles.breadcrumbItem}>
                {i > 0 && <span className={styles.breadcrumbSep}>/</span>}
                {item.icon}
                <span>{item.label}</span>
              </span>
            ))}
          </nav>
        )}
      </div>

      <div className={styles.right}>
        {actions}
        <button className={styles.iconBtn} aria-label="Search">
          <IconSearch size={16} />
        </button>
        <button className={styles.iconBtn} aria-label="Settings">
          <IconSettings size={16} />
        </button>
        <button className={styles.iconBtn} aria-label="Messages">
          <IconMessage size={16} />
        </button>
        <button className={styles.iconBtn} aria-label="Notifications">
          <IconBell size={16} />
        </button>
        <div className={styles.avatar}>
          <IconUser size={14} />
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 3: Create TopBar index.ts**

Create `tauri/src/layouts/TopBar/index.ts`:

```typescript
export { TopBar, type TopBarProps, type BreadcrumbItem } from './TopBar'
```

- [ ] **Step 4: Commit**

```bash
git add tauri/src/layouts/TopBar/ && git commit -m "feat: add TopBar component with breadcrumb and icon buttons"
```

---

### Task 9: Create Sidebar component

**Files:**
- Create: `tauri/src/layouts/Sidebar/Sidebar.tsx`
- Create: `tauri/src/layouts/Sidebar/sidebar.module.css`
- Create: `tauri/src/layouts/Sidebar/index.ts`

- [ ] **Step 1: Create sidebar.module.css**

Create `tauri/src/layouts/Sidebar/sidebar.module.css`:

```css
.sidebar {
  grid-area: sidebar;
  display: flex;
  flex-direction: column;
  background: var(--tc-sidebar-bg);
  color: var(--tc-sidebar-fg);
  border-right: 1px solid var(--tc-sidebar-border);
  overflow: hidden;
  transition: width 0.2s ease;
  width: var(--tc-sidebar-width, 240px);
}

.collapsed {
  width: 0;
  border-right: none;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 8px;
  flex-shrink: 0;
}

.headerTitle {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--tc-foreground-secondary);
}

.headerAction {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  color: var(--tc-foreground-secondary);
  transition: background 0.15s, color 0.15s;
}

.headerAction:hover {
  background: var(--tc-sidebar-item-hover);
  color: var(--tc-sidebar-fg);
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px;
}

.item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--tc-sidebar-fg);
}

.item:hover {
  background: var(--tc-sidebar-item-hover);
}

.itemActive {
  background: var(--tc-sidebar-item-active-bg);
  color: var(--tc-sidebar-item-active-fg);
}

.itemActive:hover {
  background: var(--tc-sidebar-item-active-bg);
}

.itemIcon {
  flex-shrink: 0;
  color: var(--tc-foreground-secondary);
}

.itemActive .itemIcon {
  color: var(--tc-sidebar-item-active-fg);
}

.footer {
  flex-shrink: 0;
  padding: 8px;
  border-top: 1px solid var(--tc-border);
}

.footerBtn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 13px;
  color: var(--tc-foreground-secondary);
  transition: background 0.15s, color 0.15s;
}

.footerBtn:hover {
  background: var(--tc-sidebar-item-hover);
  color: var(--tc-sidebar-fg);
}
```

- [ ] **Step 2: Create Sidebar.tsx**

Create `tauri/src/layouts/Sidebar/Sidebar.tsx`:

```tsx
import type { ReactNode } from 'react'
import { useShell } from '../AppShell/ShellContext'
import styles from './sidebar.module.css'

export interface SidebarItem {
  key: string
  label: string
  icon?: ReactNode
}

export interface SidebarProps {
  header?: ReactNode
  items: SidebarItem[]
  footer?: ReactNode
  activeKey?: string
  onSelect?: (key: string) => void
}

export function Sidebar({ header, items, footer, activeKey, onSelect }: SidebarProps) {
  const { sidebarCollapsed } = useShell()

  return (
    <aside className={`${styles.sidebar} ${sidebarCollapsed ? styles.collapsed : ''}`}>
      {header && <div className={styles.header}>{header}</div>}

      <nav className={styles.list}>
        {items.map((item) => {
          const isActive = item.key === activeKey
          return (
            <div
              key={item.key}
              className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
              onClick={() => onSelect?.(item.key)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect?.(item.key)
                }
              }}
            >
              {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
              <span>{item.label}</span>
            </div>
          )
        })}
      </nav>

      {footer && <div className={styles.footer}>{footer}</div>}
    </aside>
  )
}
```

- [ ] **Step 3: Create Sidebar index.ts**

Create `tauri/src/layouts/Sidebar/index.ts`:

```typescript
export { Sidebar, type SidebarProps, type SidebarItem } from './Sidebar'
```

- [ ] **Step 4: Commit**

```bash
git add tauri/src/layouts/Sidebar/ && git commit -m "feat: add Sidebar component with navigation items"
```

---

### Task 10: Create Panel component

**Files:**
- Create: `tauri/src/layouts/Panel/Panel.tsx`
- Create: `tauri/src/layouts/Panel/panel.module.css`
- Create: `tauri/src/layouts/Panel/index.ts`

- [ ] **Step 1: Create panel.module.css**

Create `tauri/src/layouts/Panel/panel.module.css`:

```css
.wrapper {
  flex-shrink: 0;
  overflow: hidden;
  transition: height 0.2s ease;
}

.collapsed {
  height: 0 !important;
}

.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--tc-panel-bg);
  border-top: 1px solid var(--tc-panel-border);
}

.dragBar {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 4px;
  cursor: ns-resize;
  flex-shrink: 0;
  transition: background 0.15s;
}

.dragBar:hover {
  background: var(--tc-border-active);
}

.header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 4px 8px;
  flex-shrink: 0;
}

.closeBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  color: var(--tc-foreground-secondary);
  transition: background 0.15s, color 0.15s;
}

.closeBtn:hover {
  background: var(--tc-sidebar-item-hover);
  color: var(--tc-foreground);
}

.content {
  flex: 1;
  overflow: auto;
  padding: 0 8px 8px;
}
```

- [ ] **Step 2: Create Panel.tsx**

Create `tauri/src/layouts/Panel/Panel.tsx`:

```tsx
import { useCallback, useRef, type ReactNode } from 'react'
import { useShell } from '../AppShell/ShellContext'
import { IconX } from '../../ui/icon'
import styles from './panel.module.css'

export interface PanelProps {
  children: ReactNode
  minHeight?: number
  maxHeight?: number
}

export function Panel({ children, minHeight = 150, maxHeight = 400 }: PanelProps) {
  const { panelOpen, setPanelOpen, panelHeight, setPanelHeight } = useShell()
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragRef.current = { startY: e.clientY, startHeight: panelHeight }

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return
        const delta = dragRef.current.startY - ev.clientY
        const newHeight = Math.min(maxHeight, Math.max(minHeight, dragRef.current.startHeight + delta))
        setPanelHeight(newHeight)
      }

      const handleMouseUp = () => {
        dragRef.current = null
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [panelHeight, setPanelHeight, minHeight, maxHeight]
  )

  return (
    <div
      className={`${styles.wrapper} ${!panelOpen ? styles.collapsed : ''}`}
      style={{ height: panelOpen ? panelHeight : 0 }}
    >
      <div className={styles.panel}>
        <div className={styles.dragBar} onMouseDown={handleMouseDown} />
        <div className={styles.header}>
          <button
            className={styles.closeBtn}
            onClick={() => setPanelOpen(false)}
            aria-label="Close panel"
          >
            <IconX size={14} />
          </button>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create Panel index.ts**

Create `tauri/src/layouts/Panel/index.ts`:

```typescript
export { Panel, type PanelProps } from './Panel'
```

- [ ] **Step 4: Commit**

```bash
git add tauri/src/layouts/Panel/ && git commit -m "feat: add Panel component with drag resize"
```

---

### Task 11: Create AppShell and layouts index

**Files:**
- Create: `tauri/src/layouts/AppShell/AppShell.tsx`
- Create: `tauri/src/layouts/AppShell/app-shell.module.css`
- Create: `tauri/src/layouts/AppShell/index.ts`
- Create: `tauri/src/layouts/index.ts`

- [ ] **Step 1: Create app-shell.module.css**

Create `tauri/src/layouts/AppShell/app-shell.module.css`:

```css
.shell {
  display: grid;
  grid-template-rows: var(--tc-topbar-height, 46px) 1fr;
  grid-template-columns: var(--tc-sidebar-width, 240px) 1fr;
  grid-template-areas:
    "topbar  topbar"
    "sidebar main";
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--tc-content-bg);
  color: var(--tc-foreground);
  transition: grid-template-columns 0.2s ease;
}

.shell[data-sidebar-collapsed="true"] {
  grid-template-columns: 0 1fr;
}

.main {
  grid-area: main;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.content {
  flex: 1;
  overflow: auto;
}

.panelPlaceholder {
  padding: 8px;
  font-size: 12px;
  color: var(--tc-foreground-secondary);
}
```

- [ ] **Step 2: Create AppShell.tsx**

Create `tauri/src/layouts/AppShell/AppShell.tsx`:

```tsx
import { useState, useCallback, type ReactNode } from 'react'
import { ShellContext, type ShellContextValue } from './ShellContext'
import styles from './app-shell.module.css'

export interface AppShellProps {
  children: ReactNode
}

const DEFAULT_PANEL_HEIGHT = 200

export function AppShell({ children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelHeight, setPanelHeight] = useState(DEFAULT_PANEL_HEIGHT)

  const toggleSidebar = useCallback(() => setSidebarCollapsed((v) => !v), [])
  const togglePanel = useCallback(() => setPanelOpen((v) => !v), [])

  const value: ShellContextValue = {
    sidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebar,
    panelOpen,
    setPanelOpen,
    togglePanel,
    panelHeight,
    setPanelHeight,
  }

  return (
    <ShellContext.Provider value={value}>
      <div
        className={styles.shell}
        data-sidebar-collapsed={sidebarCollapsed}
      >
        {children}
      </div>
    </ShellContext.Provider>
  )
}
```

- [ ] **Step 3: Create AppShell index.ts**

Create `tauri/src/layouts/AppShell/index.ts`:

```typescript
export { AppShell, type AppShellProps } from './AppShell'
export { useShell } from './ShellContext'
```

- [ ] **Step 4: Create layouts/index.ts**

Create `tauri/src/layouts/index.ts`:

```typescript
export { AppShell, useShell } from './AppShell'
export { TopBar, type TopBarProps, type BreadcrumbItem } from './TopBar'
export { Sidebar, type SidebarProps, type SidebarItem } from './Sidebar'
export { Panel, type PanelProps } from './Panel'
```

- [ ] **Step 5: Commit**

```bash
git add tauri/src/layouts/ && git commit -m "feat: add AppShell layout container with CSS Grid"
```

---

## Chunk 5: Integration & Migration

### Task 12: Migrate existing pages to CSS Modules

**Files:**
- Modify: `tauri/src/features/auth/index.tsx`
- Create: `tauri/src/features/auth/auth.module.css`
- Modify: `tauri/src/features/dashboard/index.tsx`
- Create: `tauri/src/features/dashboard/dashboard.module.css`
- Modify: `tauri/src/app/PageLoading.tsx`
- Create: `tauri/src/app/page-loading.module.css`
- Delete: `tauri/src/components/` (empty after button removal)

- [ ] **Step 1: Migrate PageLoading**

Create `tauri/src/app/page-loading.module.css`:

```css
.container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  width: 100vw;
  background: var(--tc-content-bg);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 2px solid var(--tc-border);
  border-top-color: var(--tc-foreground);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

Rewrite `tauri/src/app/PageLoading.tsx`:

```tsx
import styles from './page-loading.module.css'

export function PageLoading() {
  return (
    <div className={styles.container}>
      <div className={styles.spinner} />
    </div>
  )
}
```

- [ ] **Step 2: Migrate AuthPage**

Create `tauri/src/features/auth/auth.module.css`:

```css
.page {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  width: 100vw;
  background: var(--tc-content-bg);
}

.card {
  width: 320px;
  border-radius: 12px;
  border: 1px solid var(--tc-border);
  background: var(--tc-panel-bg);
  padding: 32px;
}

.title {
  margin-bottom: 24px;
  text-align: center;
  font-size: 20px;
  font-weight: 600;
  color: var(--tc-foreground);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--tc-foreground-secondary);
}

.input {
  width: 100%;
  border-radius: 6px;
  border: 1px solid var(--tc-border);
  background: var(--tc-content-bg);
  padding: 8px 12px;
  font-size: 13px;
  color: var(--tc-foreground);
  outline: none;
  transition: border-color 0.15s;
}

.input::placeholder {
  color: var(--tc-foreground-secondary);
}

.input:focus {
  border-color: var(--tc-focus-ring);
}

.error {
  font-size: 13px;
  color: var(--tc-error);
}

.submitBtn {
  width: 100%;
  border-radius: 6px;
  background: var(--tc-border-active);
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  color: #ffffff;
  transition: opacity 0.15s;
}

.submitBtn:hover {
  opacity: 0.9;
}

.submitBtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

Rewrite `tauri/src/features/auth/index.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../lib/store/auth'
import styles from './auth.module.css'

export default function AuthPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { login } = useAuthStore()

  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/auth/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })

      if (!res.ok) {
        setError(t('auth.error_invalid_pin'))
        return
      }

      const data = await res.json()
      login(data.token)
      navigate('/')
    } catch {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('auth.title')}</h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div>
            <label className={styles.label}>{t('auth.pin_label')}</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder={t('auth.pin_placeholder')}
              className={styles.input}
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading ? t('auth.connecting') : t('auth.login_btn')}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Migrate DashboardPage**

Create `tauri/src/features/dashboard/dashboard.module.css`:

```css
.page {
  padding: 32px;
}

.title {
  font-size: 20px;
  font-weight: 600;
  color: var(--tc-foreground);
}

.subtitle {
  margin-top: 8px;
  color: var(--tc-foreground-secondary);
}
```

Rewrite `tauri/src/features/dashboard/index.tsx`:

```tsx
import styles from './dashboard.module.css'

export default function DashboardPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Dashboard</h1>
      <p className={styles.subtitle}>P2 阶段实现</p>
    </div>
  )
}
```

- [ ] **Step 4: Remove empty components directory**

```bash
rm -rf tauri/src/components
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: migrate auth, dashboard, PageLoading from Tailwind to CSS Modules"
```

---

### Task 13: Update Router and Layout to use AppShell

**Files:**
- Modify: `tauri/src/app/Router.tsx`
- Delete: `tauri/src/app/Layout.tsx` (replaced by AppShell)

- [ ] **Step 1: Delete old Layout.tsx**

```bash
rm tauri/src/app/Layout.tsx
```

- [ ] **Step 2: Create new Layout with AppShell**

Create `tauri/src/app/Layout.tsx`:

```tsx
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { AppShell, TopBar, Sidebar, Panel } from '../layouts'
import { IconFileText, IconPlus, IconLayoutGrid } from '../ui/icon'
import sidebarStyles from '../layouts/Sidebar/sidebar.module.css'
import shellStyles from '../layouts/AppShell/app-shell.module.css'

const WORKSPACE_ITEMS = [
  { key: 'tasks', label: 'Tasks', icon: <IconFileText size={16} /> },
]

export function Layout() {
  const navigate = useNavigate()
  const location = useLocation()

  const activeKey = location.pathname.split('/').pop() ?? ''

  return (
    <AppShell>
      <TopBar
        logo="TaskConductor"
        breadcrumb={[{ label: 'Workspace' }]}
      />
      <Sidebar
        header={
          <>
            <span className={sidebarStyles.headerTitle}>Pages</span>
            <button className={sidebarStyles.headerAction} aria-label="New page">
              <IconPlus size={14} />
            </button>
          </>
        }
        items={WORKSPACE_ITEMS}
        activeKey={activeKey}
        onSelect={(key) => navigate(`/${key}`)}
        footer={
          <button className={sidebarStyles.footerBtn} onClick={() => navigate('/admin')}>
            <IconLayoutGrid size={16} />
            <span>Admin Console</span>
          </button>
        }
      />
      <div className={shellStyles.main}>
        <div className={shellStyles.content}>
          <Outlet />
        </div>
        <Panel>
          <div className={shellStyles.panelPlaceholder}>
            Panel content (logs, terminal)
          </div>
        </Panel>
      </div>
    </AppShell>
  )
}
```

- [ ] **Step 3: Update Router.tsx**

Rewrite `tauri/src/app/Router.tsx`:

```tsx
import { lazy, Suspense } from 'react'
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { isTauri } from '../lib/tauri'
import { Layout } from './Layout'
import { PageLoading } from './PageLoading'

const AuthPage      = lazy(() => import('../features/auth'))
const DashboardPage = lazy(() => import('../features/dashboard'))

const PlaceholderPage = lazy(() =>
  Promise.resolve({ default: () => <div className="placeholder-page">Coming soon</div> })
)

const RouterComponent = isTauri() ? HashRouter : BrowserRouter

export function AppRouter() {
  return (
    <RouterComponent>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/tasks/:id"    element={<PlaceholderPage />} />
            <Route path="/task-manager" element={<PlaceholderPage />} />
            <Route path="/sessions"     element={<PlaceholderPage />} />
            <Route path="/chat"         element={<PlaceholderPage />} />
            <Route path="/admin"        element={<PlaceholderPage />} />
            <Route path="/config"       element={<PlaceholderPage />} />
            <Route path="/knowledge"    element={<PlaceholderPage />} />
            <Route path="/mcp"          element={<PlaceholderPage />} />
            <Route path="/files"        element={<PlaceholderPage />} />
            <Route path="/git"          element={<PlaceholderPage />} />
            <Route path="/canvas"       element={<PlaceholderPage />} />
            <Route path="/settings"     element={<PlaceholderPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </RouterComponent>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: integrate AppShell layout into Router"
```

---

### Task 14: Final verification

**Files:** None (verification only)

- [ ] **Step 1: TypeScript check**

```bash
cd tauri && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 2: Verify no Tailwind remnants**

```bash
cd tauri && grep -r "tailwind\|@apply\|@tailwindcss" src/ --include="*.css" --include="*.tsx" --include="*.ts" || echo "Clean: no Tailwind remnants found"
```

Expected: "Clean: no Tailwind remnants found"

- [ ] **Step 3: Verify dev server starts**

```bash
cd tauri && pnpm dev
```

Expected: Vite dev server starts on port 7071 without errors. Open `http://localhost:7071` and verify:
- TopBar renders with logo, collapse button, icons, avatar
- Sidebar renders with "Pages" header, nav items
- Clicking sidebar collapse button toggles sidebar
- Dark theme applied by default

Implementation complete. No final commit needed (all changes committed in prior tasks).
