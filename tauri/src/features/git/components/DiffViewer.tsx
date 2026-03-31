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
  const activeTab = useGitStore((s) => s.activeTab)
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

  // Branch diff (virtual browsing)
  const branchDiff = useBranchDiff(
    activeTab === 'branches' ? virtualBranch : null,
    activeTab === 'branches' ? selectedFile : null
  )

  // Working directory diff (changes tab)
  const workingDiff = useWorkingDiff(
    activeTab === 'changes' ? selectedFile : null
  )

  // Commit diff (log tab)
  const commitDiff = useCommitDiff(
    activeTab === 'log' ? selectedCommit : null
  )

  // Determine what to show
  let original = ''
  let modified = ''
  let isLoading = false
  let label = ''

  if (activeTab === 'branches' && virtualBranch && selectedFile) {
    original = branchDiff.original
    modified = branchDiff.modified
    isLoading = branchDiff.isLoading
    label = `main ${t('git.vs')} ${virtualBranch} — ${selectedFile}`
  } else if (activeTab === 'changes' && selectedFile) {
    if (workingDiff.data) {
      const parsed = parseDiff(workingDiff.data)
      original = parsed.original
      modified = parsed.modified
    }
    isLoading = workingDiff.isLoading
    label = selectedFile
  } else if (activeTab === 'log' && selectedCommit) {
    if (commitDiff.data) {
      const parsed = parseDiff(commitDiff.data)
      original = parsed.original
      modified = parsed.modified
    }
    isLoading = commitDiff.isLoading
    label = `${t('git.log')}: ${selectedCommit.slice(0, 7)}`
  }

  const hasContent = original || modified
  const language = selectedFile ? getLang(selectedFile) : 'plaintext'

  return (
    <div className={styles.container}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <span className={styles.label}>{label}</span>
        <div className={styles.modeSwitch}>
          <button
            className={`${styles.modeBtn} ${diffMode === 'side' ? styles.modeBtnActive : ''}`}
            onClick={() => setDiffMode('side')}
          >
            {t('git.sideBySide')}
          </button>
          <button
            className={`${styles.modeBtn} ${diffMode === 'inline' ? styles.modeBtnActive : ''}`}
            onClick={() => setDiffMode('inline')}
          >
            {t('git.inline')}
          </button>
          <button
            className={`${styles.modeBtn} ${diffMode === 'file' ? styles.modeBtnActive : ''}`}
            onClick={() => setDiffMode('file')}
          >
            {t('git.file')}
          </button>
        </div>
      </div>

      {/* Editor area */}
      <div className={styles.editorArea}>
        {isLoading && (
          <div className={styles.placeholder}>{t('common.loading')}</div>
        )}
        {!isLoading && !hasContent && (
          <div className={styles.placeholder}>
            <div className={styles.placeholderIcon}>&#128269;</div>
            <div>{activeTab === 'branches' ? t('git.noBranch') : t('git.noChanges')}</div>
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
