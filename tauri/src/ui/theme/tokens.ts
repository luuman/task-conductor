export interface ThemeJSON {
  name: string
  dark: Record<string, string>
  light: Record<string, string>
}

export const BASE_COLOR_KEYS = [
  'base.bg-primary',
  'base.bg-secondary',
  'base.bg-hover',
  'base.fg-primary',
  'base.fg-secondary',
  'base.fg-subtle',     // very dim: disabled / placeholder text
  'base.accent',
  'base.accent-bg',
  'base.accent-fg',      // text placed ON accent-colored background
  'base.accent-on-bg',   // text/icon placed ON accent-bg background
  'base.border',
  'base.border-active',
  'base.error',
  'base.warning',
  'base.success',
  'base.info',
] as const

export const SEMANTIC_MAP: Record<string, string> = {
  // ── Foreground ──────────────────────────────────────────────────────
  '--tc-foreground':              'base.fg-primary',
  '--tc-foreground-secondary':    'base.fg-secondary',
  '--tc-fg-subtle':               'base.fg-subtle',      // disabled / placeholder

  // ── Background (generic aliases used across feature pages) ──────────
  '--tc-bg-primary':              'base.bg-primary',     // darkest canvas
  '--tc-bg-secondary':            'base.bg-secondary',   // panels / sidebars
  '--tc-bg-hover':                'base.bg-hover',       // hover state / inputs

  // ── Accent ──────────────────────────────────────────────────────────
  '--tc-focus-ring':              'base.accent',
  '--tc-accent':                  'base.accent',
  '--tc-accent-bg':               'base.accent-bg',
  '--tc-accent-fg':               'base.accent-fg',

  // ── Shell chrome ────────────────────────────────────────────────────
  '--tc-topbar-bg':               'base.bg-secondary',
  '--tc-topbar-fg':               'base.fg-primary',
  '--tc-topbar-border':           'base.border',
  '--tc-sidebar-bg':              'base.bg-secondary',
  '--tc-sidebar-fg':              'base.fg-primary',
  '--tc-sidebar-item-hover':      'base.bg-hover',
  '--tc-sidebar-item-active-bg':  'base.accent-bg',
  '--tc-sidebar-item-active-fg':  'base.accent-on-bg',
  '--tc-sidebar-border':          'base.border',
  '--tc-content-bg':              'base.bg-primary',
  '--tc-panel-bg':                'base.bg-secondary',
  '--tc-panel-border':            'base.border',

  // ── Border ──────────────────────────────────────────────────────────
  '--tc-border':                  'base.border',
  '--tc-border-active':           'base.border-active',

  // ── Semantic colors ─────────────────────────────────────────────────
  '--tc-error':                   'base.error',
  '--tc-warning':                 'base.warning',
  '--tc-success':                 'base.success',
  '--tc-info':                    'base.info',

  // ── Scrollbar ───────────────────────────────────────────────────────
  '--tc-scrollbar-thumb':         'base.bg-hover',
  '--tc-scrollbar-thumb-hover':   'base.fg-secondary',
}

export function resolveTheme(
  colors: Record<string, string>,
  fallbackColors: Record<string, string>
): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [cssVar, baseKey] of Object.entries(SEMANTIC_MAP)) {
    vars[cssVar] = colors[baseKey] ?? fallbackColors[baseKey] ?? '#ff00ff'
  }
  return vars
}
