import { useState, useCallback } from 'react'
import type { FileItem } from '../../../lib/api/types'
import styles from './file-tree.module.css'

interface FileTreeProps {
  items: FileItem[]
  onFileClick: (path: string, name: string) => void
  activePath: string | null
  depth?: number
  collapsedAll?: number
}

const FILE_ICONS: Record<string, string> = {
  ts: '🟦', tsx: '⚛', js: '🟨', jsx: '⚛',
  py: '🐍', css: '🎨', html: '🌐', json: '📋',
  md: '📝', rs: '🦀', go: '🔵', sh: '📜',
  yaml: '⚙', yml: '⚙', toml: '⚙', sql: '🗃',
  svg: '🖼', png: '🖼', jpg: '🖼', gif: '🖼',
}

function getFileIcon(name: string, isDir: boolean): string {
  if (isDir) return '📁'
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return FILE_ICONS[ext] ?? '📄'
}

function sortItems(items: FileItem[]): FileItem[] {
  return [...items].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function FileTree({ items, onFileClick, activePath, depth = 0, collapsedAll = 0 }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [childrenCache, setChildrenCache] = useState<Record<string, FileItem[]>>({})

  // Reset expanded when collapsedAll changes
  const [lastCollapsed, setLastCollapsed] = useState(collapsedAll)
  if (collapsedAll !== lastCollapsed) {
    setExpanded(new Set())
    setLastCollapsed(collapsedAll)
  }

  const toggleDir = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const handleClick = useCallback((item: FileItem) => {
    if (item.is_dir) {
      toggleDir(item.path)
      // If we have children in the item list (nested), use them
      // Otherwise the parent will handle loading
    } else {
      onFileClick(item.path, item.name)
    }
  }, [toggleDir, onFileClick])

  const sorted = sortItems(items)

  return (
    <ul className={styles.tree} style={{ paddingLeft: depth > 0 ? 12 : 0 }}>
      {sorted.map((item) => {
        const isExpanded = expanded.has(item.path)
        const isActive = activePath === item.path

        return (
          <li key={item.path}>
            <div
              className={styles.item}
              data-active={isActive}
              onClick={() => handleClick(item)}
              title={item.path}
            >
              <span
                className={`${styles.arrow} ${item.is_dir ? (isExpanded ? styles.arrowExpanded : '') : styles.arrowHidden}`}
              >
                ▸
              </span>
              <span className={styles.icon}>{getFileIcon(item.name, item.is_dir)}</span>
              <span className={styles.name}>{item.name}</span>
            </div>
            {item.is_dir && isExpanded && childrenCache[item.path] && (
              <FileTree
                items={childrenCache[item.path]}
                onFileClick={onFileClick}
                activePath={activePath}
                depth={depth + 1}
                collapsedAll={collapsedAll}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

// Separate export for lazy-loaded children approach
export function FileTreeWithChildren({
  items,
  onFileClick,
  activePath,
  collapsedAll = 0,
}: {
  items: FileItem[]
  onFileClick: (path: string, name: string) => void
  activePath: string | null
  collapsedAll?: number
}) {
  return (
    <FileTree
      items={items}
      onFileClick={onFileClick}
      activePath={activePath}
      collapsedAll={collapsedAll}
    />
  )
}
