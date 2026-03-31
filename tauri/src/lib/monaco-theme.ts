/**
 * Shared Monaco theme registration — used by MonacoWrapper and DiffViewer.
 * Theme name is always 'tc-theme' (global singleton in Monaco).
 */
import type { Monaco } from '@monaco-editor/react'

function toAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const normalized = h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h
  return `#${normalized}${Math.round(a * 255).toString(16).padStart(2, '0')}`
}

export function registerTcTheme(
  monaco: Monaco,
  mode: 'dark' | 'light',
  colors: Record<string, string>,
) {
  const bg      = colors['base.bg-primary']
  const bgPanel = colors['base.bg-secondary']
  const bgHover = colors['base.bg-hover']
  const fg      = colors['base.fg-primary']
  const fgSec   = colors['base.fg-secondary']
  const accent  = colors['base.accent']
  const border  = colors['base.border']
  const success = colors['base.success']
  const error   = colors['base.error']

  monaco.editor.defineTheme('tc-theme', {
    base: mode === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors: {
      // ── Editor core ────────────────────────────────────────────────
      'editor.background':                        bg,
      'editor.foreground':                        fg,
      'editorLineNumber.foreground':              fgSec,
      'editorLineNumber.activeForeground':        fg,
      'editor.selectionBackground':               toAlpha(accent, 0.25),
      'editor.inactiveSelectionBackground':       toAlpha(accent, 0.12),
      'editor.lineHighlightBackground':           bgHover,
      'editor.lineHighlightBorder':               '#00000000',
      'editorCursor.foreground':                  accent,
      'editorIndentGuide.background1':            toAlpha(border, 0.8),
      'editorIndentGuide.activeBackground1':      fgSec,
      'editorRuler.foreground':                   border,
      'editorWhitespace.foreground':              toAlpha(fgSec, 0.3),

      // ── Gutter ────────────────────────────────────────────────────
      'editorGutter.background':                  bgPanel,
      'editorGutter.addedBackground':             toAlpha(success, 0.6),
      'editorGutter.deletedBackground':           toAlpha(error, 0.6),
      'editorGutter.modifiedBackground':          toAlpha(accent, 0.6),

      // ── Diff editor ───────────────────────────────────────────────
      'diffEditor.insertedTextBackground':        toAlpha(success, 0.14),
      'diffEditor.removedTextBackground':         toAlpha(error, 0.14),
      'diffEditor.insertedLineBackground':        toAlpha(success, 0.07),
      'diffEditor.removedLineBackground':         toAlpha(error, 0.07),
      'diffEditorGutter.insertedLineBackground':  toAlpha(success, 0.18),
      'diffEditorGutter.removedLineBackground':   toAlpha(error, 0.18),
      'diffEditorOverview.insertedForeground':    toAlpha(success, 0.7),
      'diffEditorOverview.removedForeground':     toAlpha(error, 0.7),

      // ── Scrollbar ─────────────────────────────────────────────────
      'scrollbarSlider.background':               toAlpha(bgHover, 0.8),
      'scrollbarSlider.hoverBackground':          toAlpha(fgSec, 0.4),
      'scrollbarSlider.activeBackground':         toAlpha(fgSec, 0.6),

      // ── Minimap ───────────────────────────────────────────────────
      'minimap.background':                       bgPanel,
      'minimapSlider.background':                 toAlpha(bgHover, 0.5),
      'minimapSlider.hoverBackground':            toAlpha(fgSec, 0.3),

      // ── Widgets ───────────────────────────────────────────────────
      'editorWidget.background':                  bgPanel,
      'editorWidget.border':                      border,
      'editorSuggestWidget.background':           bgPanel,
      'editorSuggestWidget.border':               border,
      'editorSuggestWidget.selectedBackground':   toAlpha(accent, 0.2),
      'input.background':                         bg,
      'input.border':                             border,

      // ── Misc ──────────────────────────────────────────────────────
      'focusBorder':                              accent,
      'editor.findMatchBackground':               toAlpha(accent, 0.3),
      'editor.findMatchHighlightBackground':      toAlpha(accent, 0.15),
    },
  })
  monaco.editor.setTheme('tc-theme')
}
