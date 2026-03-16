import type { BranchFileChange } from '../../../lib/api/types'
import styles from './branches-tab.module.css'

const STATUS_LABELS: Record<string, string> = {
  M: 'M',
  A: 'A',
  D: 'D',
  R: 'R',
}

interface FileChangeListProps {
  files: BranchFileChange[]
  selectedFile: string | null
  onSelectFile: (path: string) => void
}

export function FileChangeList({ files, selectedFile, onSelectFile }: FileChangeListProps) {
  if (files.length === 0) return null

  return (
    <div className={styles.fileList}>
      {files.map((f) => {
        const dir = f.path.includes('/') ? f.path.substring(0, f.path.lastIndexOf('/')) : ''
        const name = f.path.includes('/') ? f.path.substring(f.path.lastIndexOf('/') + 1) : f.path
        return (
          <button
            key={f.path}
            className={`${styles.fileItem} ${selectedFile === f.path ? styles.fileItemActive : ''}`}
            onClick={() => onSelectFile(f.path)}
          >
            <span className={`${styles.statusBadge} ${styles[`status${f.status}`]}`}>
              {STATUS_LABELS[f.status] ?? f.status}
            </span>
            <span className={styles.fileInfo}>
              <span className={styles.fileName}>{name}</span>
              {dir && <span className={styles.fileDir}>{dir}</span>}
            </span>
            <span className={styles.fileStat}>
              {f.additions > 0 && <span className={styles.additions}>+{f.additions}</span>}
              {f.deletions > 0 && <span className={styles.deletions}>-{f.deletions}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
