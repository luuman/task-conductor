import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { useAppStore } from '../../../lib/store/app'
import { useGitStore } from '../../../lib/store/git'
import { useBranchFiles } from '../hooks/useBranchFiles'
import { RequirementList } from './RequirementList'
import { FileChangeList } from './FileChangeList'
import styles from './branches-tab.module.css'

export function BranchesTab() {
  const { t } = useTranslation()
  const projectId = useAppStore((s) => s.activeProjectId)
  const virtualBranch = useGitStore((s) => s.virtualBranch)
  const selectedFile = useGitStore((s) => s.selectedFile)
  const setVirtualBranch = useGitStore((s) => s.setVirtualBranch)
  const setSelectedFile = useGitStore((s) => s.setSelectedFile)

  const { data: branches } = useQuery({
    queryKey: ['git-branches', projectId],
    queryFn: () => api.gitBranches(Number(projectId!)),
    enabled: !!projectId,
    staleTime: 10_000,
  })

  const { data: branchFiles, isLoading: filesLoading } = useBranchFiles(virtualBranch)

  return (
    <div className={styles.container}>
      {/* Requirement list (tasks with branches) */}
      <RequirementList />

      {/* All branches */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>{t('git.allBranches')}</div>
        <div className={styles.branchList}>
          {(branches ?? []).map((b) => (
            <button
              key={b.name}
              className={`${styles.branchItem} ${virtualBranch === b.name ? styles.branchItemActive : ''}`}
              onClick={() => setVirtualBranch(b.name)}
            >
              <span className={styles.branchIcon}>{b.current ? '\u25CF' : '\u25CB'}</span>
              <span className={styles.branchNameText}>{b.name}</span>
              {b.remote && <span className={styles.remoteTag}>remote</span>}
              {virtualBranch === b.name && (
                <span className={styles.virtualBadge} title={t('git.virtualHint')}>&#128065;</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Changed files for selected branch */}
      {virtualBranch && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            {t('git.changedFiles')}
            <span className={styles.vsLabel}>{t('git.vs')} main</span>
          </div>
          {filesLoading ? (
            <div className={styles.empty}>{t('common.loading')}</div>
          ) : (
            <FileChangeList
              files={branchFiles ?? []}
              selectedFile={selectedFile}
              onSelectFile={setSelectedFile}
            />
          )}
          {!filesLoading && (!branchFiles || branchFiles.length === 0) && (
            <div className={styles.empty}>{t('git.noChanges')}</div>
          )}
        </div>
      )}

      {!virtualBranch && (
        <div className={styles.empty}>{t('git.noBranch')}</div>
      )}
    </div>
  )
}
