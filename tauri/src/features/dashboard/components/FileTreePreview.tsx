import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FileTreeNode } from '../../../lib/api/types'
import styles from './FileTreePreview.module.css'

interface Props {
  tree: FileTreeNode | null
}

function TreeNode({ node, depth }: { node: FileTreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2)
  const isDir = node.type === 'directory'

  return (
    <div>
      <div
        className={styles.node}
        style={{ paddingLeft: depth * 16 }}
        onClick={() => isDir && setOpen(!open)}
      >
        <span className={styles.icon}>{isDir ? (open ? '\u25BC' : '\u25B6') : '\u00B7'}</span>
        <span className={isDir ? styles.dirName : styles.fileName}>{node.name}</span>
      </div>
      {isDir && open && node.children?.map((child) => (
        <TreeNode key={child.name} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}

export function FileTreePreview({ tree }: Props) {
  const { t } = useTranslation()
  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <span className={styles.title}>{t('dashboard.file_structure')}</span>
      </div>
      <div className={styles.body}>
        {!tree ? (
          <p className={styles.empty}>{t('dashboard.no_file_data')}</p>
        ) : (
          <div className={styles.tree}>
            {tree.children?.map((child) => (
              <TreeNode key={child.name} node={child} depth={0} />
            )) ?? <p className={styles.empty}>{t('dashboard.empty_dir')}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
