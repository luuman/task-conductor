import { useState, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAppStore } from '../../lib/store/app'
import { useEditorTabs } from './hooks/useEditorTabs'
import { FileExplorer } from './components/FileExplorer'
import { EditorTabs } from './components/EditorTabs'
import { MonacoWrapper } from './components/MonacoWrapper'
import { InlineAI } from './components/InlineAI'
import { StatusBar } from './components/StatusBar'
import type { Project } from '../../lib/api/types'
import styles from './files-page.module.css'

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  py: 'python', css: 'css', html: 'html', json: 'json', md: 'markdown',
  rs: 'rust', go: 'go', java: 'java', sh: 'shell', yaml: 'yaml', yml: 'yaml',
  toml: 'toml', sql: 'sql', xml: 'xml', svg: 'xml',
}

function getLang(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TO_LANG[ext] ?? 'plaintext'
}

export function FilesPage() {
  const projectId = useAppStore((s) => s.activeProjectId)
  const queryClient = useQueryClient()
  const { openFile, activeTab, activeTabPath, markUnsaved, markSaved, isUnsaved, hasUnsaved } = useEditorTabs()
  const [fileContents, setFileContents] = useState<Record<string, string>>({})
  const [aiSelection, setAiSelection] = useState<{ startLine: number; endLine: number } | null>(null)

  // 从缓存中取当前项目的 repo_url 作为 Rust IPC 的 root
  const projectRoot = useMemo(() => {
    const projects = queryClient.getQueryData<Project[]>(['projects'])
    return projects?.find((p) => String(p.id) === projectId)?.repo_url
  }, [queryClient, projectId])

  // Fetch file content when active tab changes
  const { data: fileData } = useQuery({
    queryKey: ['file-content', projectId, activeTabPath],
    queryFn: () => api.getFileContent(Number(projectId!), activeTabPath!),
    enabled: !!projectId && !!activeTabPath && !(activeTabPath in fileContents),
    staleTime: 60_000,
  })

  // Store fetched content
  useEffect(() => {
    if (fileData && activeTabPath && !(activeTabPath in fileContents)) {
      setFileContents((prev) => ({ ...prev, [activeTabPath]: fileData.content }))
    }
  }, [fileData, activeTabPath, fileContents])

  const handleFileClick = useCallback((path: string, name: string) => {
    const language = getLang(name)
    openFile({ path, name, language })
  }, [openFile])

  const handleContentChange = useCallback((value: string) => {
    if (!activeTabPath) return
    setFileContents((prev) => ({ ...prev, [activeTabPath]: value }))
    markUnsaved(activeTabPath)
  }, [activeTabPath, markUnsaved])

  const handleSave = useCallback(async () => {
    if (!projectId || !activeTabPath) return
    const content = fileContents[activeTabPath]
    if (content === undefined) return
    try {
      await api.saveFile(Number(projectId), activeTabPath, content)
      markSaved(activeTabPath)
    } catch (err) {
      console.error('Save failed:', err)
    }
  }, [projectId, activeTabPath, fileContents, markSaved])

  const handleInlineAI = useCallback((selection: { startLine: number; endLine: number }) => {
    setAiSelection(selection)
  }, [])

  const handleAIAccept = useCallback((modified: string) => {
    if (!activeTabPath) return
    // Replace the selected lines with the modified content
    const current = fileContents[activeTabPath] ?? ''
    const lines = current.split('\n')
    if (aiSelection) {
      const before = lines.slice(0, aiSelection.startLine - 1)
      const after = lines.slice(aiSelection.endLine)
      const newContent = [...before, modified, ...after].join('\n')
      setFileContents((prev) => ({ ...prev, [activeTabPath]: newContent }))
      markUnsaved(activeTabPath)
    }
    setAiSelection(null)
  }, [activeTabPath, fileContents, aiSelection, markUnsaved])

  const handleAIClose = useCallback(() => {
    setAiSelection(null)
  }, [])

  // Unsaved leave confirmation
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsaved()) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsaved])

  const currentContent = activeTabPath ? fileContents[activeTabPath] : undefined
  const currentLang = activeTab?.language ?? 'plaintext'
  const currentIsUnsaved = activeTabPath ? isUnsaved(activeTabPath) : false

  return (
    <div className={styles.page}>
      <div className={styles.explorer}>
        <FileExplorer activePath={activeTabPath} onFileClick={handleFileClick} projectRoot={projectRoot} />
      </div>

      <div className={styles.editorArea}>
        <EditorTabs />

        <div className={styles.editorBody}>
          {activeTab && currentContent !== undefined ? (
            <>
              <MonacoWrapper
                path={activeTab.path}
                content={currentContent}
                language={currentLang}
                onContentChange={handleContentChange}
                onSave={handleSave}
                onInlineAI={handleInlineAI}
              />
              {aiSelection && (
                <InlineAI
                  filePath={activeTab.path}
                  fileContent={currentContent}
                  selection={aiSelection}
                  onAccept={handleAIAccept}
                  onClose={handleAIClose}
                />
              )}
            </>
          ) : (
            <div className={styles.placeholder}>
              <img className={styles.placeholderIcon} src="/file-icons/file_type_default.svg" alt="" style={{ width: 48, height: 48, opacity: 0.4 }} />
              <div className={styles.placeholderText}>Select a file to edit</div>
            </div>
          )}
        </div>

        {activeTab && (
          <StatusBar
            language={currentLang}
            isUnsaved={currentIsUnsaved}
          />
        )}
      </div>
    </div>
  )
}
