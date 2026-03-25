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

function registerTcTheme(
  monaco: Monaco,
  themeType: 'dark' | 'light',
  colors: Record<string, string>,
) {
  const bg      = colors['base.bg-primary']
  const bgPanel = colors['base.bg-secondary']
  const bgHover = colors['base.bg-hover']
  const fg      = colors['base.fg-primary']
  const fgSec   = colors['base.fg-secondary']
  const accent  = colors['base.accent']
  const border  = colors['base.border']

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
      'editor.background':                      bg,
      'editor.foreground':                      fg,
      'editorLineNumber.foreground':            fgSec,
      'editorLineNumber.activeForeground':      fg,
      'editor.selectionBackground':             toAlpha(accent, 0.25),
      'editor.inactiveSelectionBackground':     toAlpha(accent, 0.12),
      'editor.lineHighlightBackground':         bgHover,
      'editor.lineHighlightBorder':             '#00000000',
      'editorCursor.foreground':                accent,
      'editorIndentGuide.background1':          toAlpha(border, 0.8),
      'editorIndentGuide.activeBackground1':    fgSec,
      'editorRuler.foreground':                 border,
      'editorWhitespace.foreground':            toAlpha(fgSec, 0.3),
      'editorGutter.background':                bgPanel,
      'minimap.background':                     bgPanel,
      'minimapSlider.background':               toAlpha(bgHover, 0.5),
      'minimapSlider.hoverBackground':          toAlpha(fgSec, 0.3),
      'scrollbarSlider.background':             toAlpha(bgHover, 0.8),
      'scrollbarSlider.hoverBackground':        toAlpha(fgSec, 0.4),
      'scrollbarSlider.activeBackground':       toAlpha(fgSec, 0.6),
      'editorWidget.background':                bgPanel,
      'editorWidget.border':                    border,
      'editorSuggestWidget.background':         bgPanel,
      'editorSuggestWidget.border':             border,
      'editorSuggestWidget.selectedBackground': toAlpha(accent, 0.2),
      'input.background':                       bg,
      'input.border':                           border,
      'focusBorder':                            accent,
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
  const { theme, mode, themeList } = useTheme()

  // Re-register Monaco theme when the system theme changes.
  // Colors are read directly from themeList (React state), not CSS vars,
  // so there is no DOM timing dependency — works across windows too.
  useEffect(() => {
    if (!monacoRef.current) return
    const json = themeList.find(t => t.name === theme)
    if (json) registerTcTheme(monacoRef.current, mode, json[mode] ?? json.dark)
  }, [theme, mode, themeList])

  const handleMount: OnMount = useCallback((ed, monaco) => {
    editorRef.current = ed
    monacoRef.current = monaco

    const json = themeList.find(t => t.name === theme)
    if (json) registerTcTheme(monaco, mode, json[mode] ?? json.dark)

    ed.addAction({
      id: 'tc-save-file',
      label: 'Save File',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => { onSave() },
    })

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSave, onInlineAI])

  const handleChange = useCallback((value: string | undefined) => {
    if (value !== undefined) onContentChange(value)
  }, [onContentChange])

  return (
    <Editor
      key={path}
      defaultValue={content}
      language={language}
      theme="tc-theme"
      onChange={handleChange}
      onMount={handleMount}
      options={{
        fontSize: 13,
        minimap: { enabled: true },
        lineNumbers: 'on',
        lineNumbersMinChars: 3,
        glyphMargin: false,
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
