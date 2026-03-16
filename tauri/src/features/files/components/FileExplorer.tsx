import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { useAppStore } from '../../../lib/store/app'
import { useFileTree } from '../hooks/useFileTree'
import { FileTreeWithChildren } from './FileTree'
import type { FileItem } from '../../../lib/api/types'
import styles from './file-explorer.module.css'

interface FileExplorerProps {
  activePath: string | null
  onFileClick: (path: string, name: string) => void
}

export function FileExplorer({ activePath, onFileClick }: FileExplorerProps) {
  const { t } = useTranslation()
  const projectId = useAppStore((s) => s.activeProjectId)
  const { data, isLoading, refetch } = useFileTree()
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedAll, setCollapsedAll] = useState(0)

  const { data: searchResults } = useQuery({
    queryKey: ['files-search', projectId, searchQuery],
    queryFn: () => api.searchFiles(Number(projectId!), searchQuery),
    enabled: !!projectId && searchQuery.length >= 2,
    staleTime: 10_000,
  })

  const handleCollapseAll = useCallback(() => {
    setCollapsedAll((c) => c + 1)
  }, [])

  const handleRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  const items = data?.items ?? []
  const isSearching = searchQuery.length >= 2

  return (
    <div className={styles.explorer}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>{t('files.explorer')}</span>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} title={t('files.refresh')} onClick={handleRefresh}>
            ↻
          </button>
          <button className={styles.iconBtn} title={t('files.collapseAll')} onClick={handleCollapseAll}>
            ⊟
          </button>
        </div>
      </div>

      <div className={styles.search}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder={t('files.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className={styles.treeWrap}>
        {isLoading ? (
          <div className={styles.empty}>{t('common.loading')}</div>
        ) : isSearching && searchResults ? (
          <ul className={styles.searchResults}>
            {searchResults.map((item: FileItem) => (
              <li
                key={item.path}
                className={styles.searchItem}
                onClick={() => onFileClick(item.path, item.name)}
              >
                <span className={styles.searchItemIcon}>{item.is_dir ? '📁' : '📄'}</span>
                <span className={styles.searchItemPath}>{item.path}</span>
              </li>
            ))}
            {searchResults.length === 0 && (
              <div className={styles.empty}>No results</div>
            )}
          </ul>
        ) : items.length === 0 ? (
          <div className={styles.empty}>No files</div>
        ) : (
          <FileTreeWithChildren
            items={items}
            onFileClick={onFileClick}
            activePath={activePath}
            collapsedAll={collapsedAll}
          />
        )}
      </div>
    </div>
  )
}
