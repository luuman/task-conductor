import { useTranslation } from 'react-i18next'
import { DiffEditor, Editor } from '@monaco-editor/react'
import { useQuery } from '@tanstack/react-query'
import { useGitStore } from '../../../lib/store/git'
import { useAppStore } from '@/lib/store/app'
import { api } from '@/lib/api'
import { useBranchDiff, useWorkingDiff, useCommitDiff } from '../hooks/useDiff'
import styles from './diff-viewer.module.css'

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

/**
 * Parse a unified diff into original/modified text for Monaco DiffEditor.
 */
function parseDiff(diff: string): { original: string; modified: string } {
  const lines = diff.split('\n')
  const originalLines: string[] = []
  const modifiedLines: string[] = []
  let inHunk = false

  for (const line of lines) {
    if (line.startsWith('@@')) {
      inHunk = true
      continue
    }
    if (!inHunk) continue

    if (line.startsWith('-')) {
      originalLines.push(line.slice(1))
    } else if (line.startsWith('+')) {
      modifiedLines.push(line.slice(1))
    } else if (line.startsWith(' ') || line === '') {
      const content = line.startsWith(' ') ? line.slice(1) : line
      originalLines.push(content)
      modifiedLines.push(content)
    }
  }

  return { original: originalLines.join('\n'), modified: modifiedLines.join('\n') }
}

interface DiffViewerProps {
  selectedCommit: string | null
}

export function DiffViewer({ selectedCommit }: DiffViewerProps) {
  const { t } = useTranslation()
  const virtualBranch = useGitStore((s) => s.virtualBranch)
  const selectedFile = useGitStore((s) => s.selectedFile)
  const diffMode = useGitStore((s) => s.diffMode)
  const setDiffMode = useGitStore((s) => s.setDiffMode)
  const fileViewerOpen = useGitStore((s) => s.fileViewerOpen)
  const setFileViewerOpen = useGitStore((s) => s.setFileViewerOpen)
  const selectedTaskId = useGitStore((s) => s.selectedTaskId)
  const projectId = useAppStore((s) => s.activeProjectId)

  const { data: fileData } = useQuery({
    queryKey: ['git-file-content', projectId, selectedFile],
    queryFn: () => api.gitShow(Number(projectId!), 'HEAD', selectedFile!),
    enabled: !!projectId && !!selectedFile && fileViewerOpen,
  })

  const fileName = selectedFile ? selectedFile.split('/').pop() ?? selectedFile : null
  const fileDir = selectedFile?.includes('/')
    ? selectedFile.slice(0, selectedFile.lastIndexOf('/') + 1)
    : ''

  // Branch diff (virtual browsing) — active when virtualBranch is set
  const branchDiff = useBranchDiff(virtualBranch, virtualBranch ? selectedFile : null)

  // Working directory diff — active when a file is selected (and not in branch/commit mode)
  const workingDiff = useWorkingDiff(!virtualBranch && !selectedCommit ? selectedFile : null)

  // Commit diff — active when a commit is selected
  const commitDiff = useCommitDiff(selectedCommit)

  // Determine what to show: commit > branch > working-dir
  let original = ''
  let modified = ''
  let isLoading = false
  let label = ''

  if (selectedCommit) {
    if (commitDiff.data) {
      const parsed = parseDiff(commitDiff.data)
      original = parsed.original
      modified = parsed.modified
    }
    isLoading = commitDiff.isLoading
    label = `${t('git.log')}: ${selectedCommit.slice(0, 7)}`
  } else if (virtualBranch && selectedFile) {
    original = branchDiff.original
    modified = branchDiff.modified
    isLoading = branchDiff.isLoading
    label = `main ${t('git.vs')} ${virtualBranch} — ${selectedFile}`
  } else if (selectedFile) {
    if (workingDiff.data) {
      const parsed = parseDiff(workingDiff.data)
      original = parsed.original
      modified = parsed.modified
    }
    isLoading = workingDiff.isLoading
    label = selectedFile
  }

  const hasContent = original || modified
  const language = selectedFile ? getLang(selectedFile) : 'plaintext'

  return (
    <div className={styles.container} style={{ position: 'relative' }}>
      {/* New v12 topbar with filename chip */}
      {selectedFile && (
        <div className={styles.topbar}>
          <div className={styles.fileChip} onClick={() => setFileViewerOpen(true)} title={selectedFile}>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="#555">
              <path d="M3.75 1.5a.25.25 0 00-.25.25v11.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25V6H9.75A1.75 1.75 0 018 4.25V1.5H3.75zm5.75.56v2.19c0 .138.112.25.25.25h2.19L9.5 2.06zM2 1.75C2 .784 2.784 0 3.75 0h5.086c.464 0 .909.184 1.237.513l3.414 3.414c.329.328.513.773.513 1.237v8.086A1.75 1.75 0 0112.25 15h-8.5A1.75 1.75 0 012 13.25V1.75z"/>
            </svg>
            <span className={styles.chipName}>{fileName}</span>
            <span className={styles.chipDir}>{fileDir}</span>
            <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor" className={styles.fileOpenIcon}>
              <path d="M10.604 1h4.146a.25.25 0 01.25.25v4.146a.25.25 0 01-.427.177L13.03 4.03 9.28 7.78a.75.75 0 01-1.06-1.06l3.75-3.75-1.543-1.543A.25.25 0 0110.604 1zM3.75 2A1.75 1.75 0 002 3.75v8.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0014 12.25v-3.5a.75.75 0 00-1.5 0v3.5a.25.25 0 01-.25.25h-8.5a.25.25 0 01-.25-.25v-8.5a.25.25 0 01.25-.25h3.5a.75.75 0 000-1.5h-3.5z"/>
            </svg>
          </div>
          <div className={styles.spacer} />
          {selectedTaskId && (
            <span className={styles.taskLink}>Task #{selectedTaskId}</span>
          )}
          <div className={styles.modeGroup}>
            <button
              className={`${styles.modeToggleBtn} ${diffMode === 'inline' ? styles.active : ''}`}
              onClick={() => setDiffMode('inline')}
            >内联</button>
            <button
              className={`${styles.modeToggleBtn} ${diffMode === 'side' ? styles.active : ''}`}
              onClick={() => setDiffMode('side')}
            >并排</button>
            <button
              className={`${styles.modeToggleBtn} ${diffMode === 'file' ? styles.active : ''}`}
              onClick={() => setDiffMode('file')}
            >文件</button>
          </div>
        </div>
      )}

      {/* Fallback label bar when no file selected */}
      {!selectedFile && label && (
        <div className={styles.toolbar}>
          <span className={styles.label}>{label}</span>
        </div>
      )}

      {/* Editor area */}
      <div className={styles.editorArea}>
        {isLoading && (
          <div className={styles.placeholder}>{t('common.loading')}</div>
        )}
        {!isLoading && !hasContent && (
          <div className={styles.placeholder}>
            <div className={styles.placeholderIcon}>&#128269;</div>
            <div>{virtualBranch ? t('git.noBranch') : t('git.noChanges')}</div>
          </div>
        )}
        {!isLoading && hasContent && diffMode === 'file' && (
          <DiffEditor
            key={`file-${selectedFile}-${selectedCommit}-${virtualBranch}`}
            original={original}
            modified={modified}
            language={language}
            theme="vs-dark"
            options={{
              readOnly: true,
              renderSideBySide: false,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              lineNumbers: 'on',
              renderOverviewRuler: false,
            }}
          />
        )}
        {!isLoading && hasContent && diffMode !== 'file' && (
          <DiffEditor
            key={`${diffMode}-${selectedFile}-${selectedCommit}-${virtualBranch}`}
            original={original}
            modified={modified}
            language={language}
            theme="vs-dark"
            options={{
              readOnly: true,
              renderSideBySide: diffMode === 'side',
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              lineNumbers: 'on',
              renderOverviewRuler: false,
            }}
          />
        )}

        {/* File viewer overlay */}
        {fileViewerOpen && selectedFile && (
          <div className={styles.fileViewer}>
            <div className={styles.fvTopbar}>
              <span className={styles.fvLabel}>查看文件</span>
              <span className={styles.fvPath}>{selectedFile}</span>
              <button className={styles.fvClose} onClick={() => setFileViewerOpen(false)}>✕</button>
            </div>
            <div className={styles.fvBody}>
              <Editor
                height="100%"
                language={getLang(selectedFile)}
                value={fileData?.content ?? ''}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      {virtualBranch && activeTab === 'branches' && (
        <div className={styles.statusBar}>
          <span>&#128065; {t('git.virtualBrowse')}</span>
          <span className={styles.statusDetail}>{virtualBranch} &mdash; {t('git.virtualHint')}</span>
        </div>
      )}
    </div>
  )
}
