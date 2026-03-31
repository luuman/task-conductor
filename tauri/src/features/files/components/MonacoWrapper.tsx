import { useRef, useCallback, useEffect } from 'react'
import Editor, { type OnMount, type Monaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useTheme } from '../../../ui/theme/useTheme'
import { registerTcTheme } from '../../../lib/monaco-theme'

interface MonacoWrapperProps {
  path: string
  content: string
  language: string
  onContentChange: (value: string) => void
  onSave: () => void
  onInlineAI?: (selection: { startLine: number; endLine: number }) => void
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
