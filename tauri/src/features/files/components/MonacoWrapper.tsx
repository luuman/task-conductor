import { useRef, useCallback, useEffect } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'

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
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof Monaco | null>(null)

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // Register Cmd/Ctrl+S to save
    editor.addAction({
      id: 'tc-save-file',
      label: 'Save File',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => {
        onSave()
      },
    })

    // Register Cmd/Ctrl+K for inline AI
    if (onInlineAI) {
      editor.addAction({
        id: 'tc-inline-ai',
        label: 'Inline AI Edit',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK],
        run: (ed) => {
          const selection = ed.getSelection()
          if (selection && !selection.isEmpty()) {
            onInlineAI({
              startLine: selection.startLineNumber,
              endLine: selection.endLineNumber,
            })
          }
        },
      })
    }

    editor.focus()
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
