import { useRef, useCallback, useEffect } from 'react'
import Editor, { type OnMount, type Monaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useTheme } from '../../../ui/theme/useTheme'

interface MonacoWrapperProps {
  path: string
  content: string
  language: string
  onContentChange: (value: string) => void
  onSave: () => void
  onInlineAI?: (selection: { startLine: number; endLine: number }) => void
}

function readCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function registerTcTheme(monaco: Monaco, themeType: 'dark' | 'light') {
  const bg      = readCssVar('--tc-content-bg')
  const bgPanel = readCssVar('--tc-panel-bg')
  const bgHover = readCssVar('--tc-sidebar-item-hover')
  const fg      = readCssVar('--tc-foreground')
  const fgSec   = readCssVar('--tc-foreground-secondary')
  const accent  = readCssVar('--tc-accent')
  const border  = readCssVar('--tc-border')

  const toAlpha = (hex: string, a: number) => {
    const h = hex.replace('#', '')
    const n = h.length === 3
      ? h.split('').map(c => c + c).join('')
      : h
    return `#${n}${Math.round(a * 255).toString(16).padStart(2, '0')}`
  }

  monaco.editor.defineTheme('tc-theme', {
    base: themeType === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background':                    bg,
      'editor.foreground':                    fg,
      'editorLineNumber.foreground':          fgSec,
      'editorLineNumber.activeForeground':    fg,
      'editor.selectionBackground':           toAlpha(accent, 0.25),
      'editor.inactiveSelectionBackground':   toAlpha(accent, 0.12),
      'editor.lineHighlightBackground':       bgHover,
      'editor.lineHighlightBorder':           '#00000000',
      'editorCursor.foreground':              accent,
      'editorIndentGuide.background1':        toAlpha(border, 0.8),
      'editorIndentGuide.activeBackground1':  fgSec,
      'editorRuler.foreground':               border,
      'editorWhitespace.foreground':          toAlpha(fgSec, 0.3),
      'editorGutter.background':              bgPanel,
      'minimap.background':                   bgPanel,
      'minimapSlider.background':             toAlpha(bgHover, 0.5),
      'minimapSlider.hoverBackground':        toAlpha(fgSec, 0.3),
      'scrollbarSlider.background':           toAlpha(bgHover, 0.8),
      'scrollbarSlider.hoverBackground':      toAlpha(fgSec, 0.4),
      'scrollbarSlider.activeBackground':     toAlpha(fgSec, 0.6),
      'editorWidget.background':              bgPanel,
      'editorWidget.border':                  border,
      'editorSuggestWidget.background':       bgPanel,
      'editorSuggestWidget.border':           border,
      'editorSuggestWidget.selectedBackground': toAlpha(accent, 0.2),
      'input.background':                     bg,
      'input.border':                         border,
      'focusBorder':                          accent,
    },
  })
  monaco.editor.setTheme('tc-theme')
}

export function MonacoWrapper({
  path,
  content,
  language,
  onContentChange,
  onSave,
  onInlineAI,
}: MonacoWrapperProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const { theme, themeType } = useTheme()

  // Re-register theme whenever system theme changes
  useEffect(() => {
    if (monacoRef.current) {
      registerTcTheme(monacoRef.current, themeType)
    }
  }, [theme, themeType])

  const handleMount: OnMount = useCallback((ed, monaco) => {
    editorRef.current = ed
    monacoRef.current = monaco
    registerTcTheme(monaco, themeType)

    // Register Cmd/Ctrl+S to save
    ed.addAction({
      id: 'tc-save-file',
      label: 'Save File',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => {
        onSave()
      },
    })

    // Register Cmd/Ctrl+K for inline AI
    if (onInlineAI) {
      ed.addAction({
        id: 'tc-inline-ai',
        label: 'Inline AI Edit',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK],
        run: (e) => {
          const selection = e.getSelection()
          if (selection && !selection.isEmpty()) {
            onInlineAI({
              startLine: selection.startLineNumber,
              endLine: selection.endLineNumber,
            })
          }
        },
      })
    }

    ed.focus()
  }, [onSave, onInlineAI])

  const handleChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      onContentChange(value)
    }
  }, [onContentChange])

  return (
    <Editor
      key={path}
      defaultValue={content}
      language={language}
      theme="vs-dark"
      onChange={handleChange}
      onMount={handleMount}
      options={{
        fontSize: 13,
        minimap: { enabled: true },
        lineNumbers: 'on',
        automaticLayout: true,
        scrollBeyondLastLine: false,
        renderWhitespace: 'selection',
        bracketPairColorization: { enabled: true },
        tabSize: 2,
        wordWrap: 'off',
        padding: { top: 8 },
      }}
    />
  )
}
