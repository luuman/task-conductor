export interface ThemeJSON {
  name: string
  type: 'dark' | 'light'
  colors: Record<string, string>
}

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

export const SEMANTIC_MAP: Record<string, string> = {
  '--tc-foreground':              'base.fg-primary',
  '--tc-foreground-secondary':    'base.fg-secondary',
  '--tc-focus-ring':              'base.accent',
  '--tc-topbar-bg':               'base.bg-secondary',
  '--tc-topbar-fg':               'base.fg-primary',
  '--tc-topbar-border':           'base.border',
  '--tc-sidebar-bg':              'base.bg-primary',
  '--tc-sidebar-fg':              'base.fg-primary',
  '--tc-sidebar-item-hover':      'base.bg-hover',
  '--tc-sidebar-item-active-bg':  'base.accent-bg',
  '--tc-sidebar-item-active-fg':  'base.accent-fg',
  '--tc-sidebar-border':          'base.border',
  '--tc-content-bg':              'base.bg-primary',
  '--tc-panel-bg':                'base.bg-secondary',
  '--tc-panel-border':            'base.border',
  '--tc-border':                  'base.border',
  '--tc-border-active':           'base.border-active',
  '--tc-error':                   'base.error',
  '--tc-warning':                 'base.warning',
  '--tc-success':                 'base.success',
  '--tc-info':                    'base.info',
  '--tc-scrollbar-thumb':         'base.bg-hover',
  '--tc-scrollbar-thumb-hover':   'base.fg-secondary',
}

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
