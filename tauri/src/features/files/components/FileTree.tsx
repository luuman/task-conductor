import { useState, useCallback, useRef } from 'react'
import type { FileItem } from '../../../lib/api/types'
import { getFileIconPath } from './file-icon-map'
import styles from './file-tree.module.css'

interface FileTreeProps {
  items: FileItem[]
  onFileClick: (path: string, name: string) => void
  onExpandDir: (path: string) => Promise<FileItem[]>
  activePath: string | null
  depth?: number
  collapsedAll?: number
}

function sortItems(items: FileItem[]): FileItem[] {
  return [...items].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function FileTree({
  items,
  onFileClick,
  onExpandDir,
  activePath,
  depth = 0,
  collapsedAll = 0,
}: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const childrenRef = useRef<Map<string, FileItem[]>>(new Map())

  // collapsedAll 变化时重置
  const [lastCollapsed, setLastCollapsed] = useState(collapsedAll)
  if (collapsedAll !== lastCollapsed) {
    setExpanded(new Set())
    setLastCollapsed(collapsedAll)
  }

  const handleDirClick = useCallback(
    async (item: FileItem) => {
      const isCurrentlyExpanded = expanded.has(item.path)

      if (isCurrentlyExpanded) {
        // 收起
        setExpanded((prev) => {
          const next = new Set(prev)
          next.delete(item.path)
          return next
        })
        return
      }

      // 展开：如果没有缓存的子节点，先加载
      if (!childrenRef.current.has(item.path)) {
        setLoading((prev) => new Set(prev).add(item.path))
        try {
          const children = await onExpandDir(item.path)
          childrenRef.current.set(item.path, children)
        } catch (err) {
          console.error('加载子目录失败:', err)
          childrenRef.current.set(item.path, [])
        } finally {
          setLoading((prev) => {
            const next = new Set(prev)
            next.delete(item.path)
            return next
          })
        }
      }

      setExpanded((prev) => new Set(prev).add(item.path))
    },
    [expanded, onExpandDir],
  )

  const handleClick = useCallback(
    (item: FileItem) => {
      if (item.is_dir) {
        handleDirClick(item)
      } else {
        onFileClick(item.path, item.name)
      }
    },
    [handleDirClick, onFileClick],
  )

  const sorted = sortItems(items)

  return (
    <ul className={styles.tree} style={{ paddingLeft: depth > 0 ? 12 : 0 }}>
      {sorted.map((item) => {
        const isExpanded = expanded.has(item.path)
        const isLoading = loading.has(item.path)
        const isActive = activePath === item.path
        const children = childrenRef.current.get(item.path)

        return (
          <li key={item.path}>
            <div
              className={styles.item}
              data-active={isActive}
              onClick={() => handleClick(item)}
              title={item.path}
            >
              <span
                className={`${styles.arrow} ${
                  item.is_dir
                    ? isLoading
                      ? styles.arrowLoading
                      : isExpanded
                        ? styles.arrowExpanded
                        : ''
                    : styles.arrowHidden
                }`}
              >
                {isLoading ? '◌' : '▸'}
              </span>
              <img
                className={styles.icon}
                src={getFileIconPath(item.name, item.is_dir, isExpanded)}
                alt=""
                draggable={false}
              />
              <span className={styles.name}>{item.name}</span>
            </div>
            {item.is_dir && isExpanded && children && (
              <FileTree
                items={children}
                onFileClick={onFileClick}
                onExpandDir={onExpandDir}
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

// 便捷包装
export function FileTreeWithChildren({
  items,
  onFileClick,
  onExpandDir,
  activePath,
  collapsedAll = 0,
}: {
  items: FileItem[]
  onFileClick: (path: string, name: string) => void
  onExpandDir: (path: string) => Promise<FileItem[]>
  activePath: string | null
  collapsedAll?: number
}) {
  return (
    <FileTree
      items={items}
      onFileClick={onFileClick}
      onExpandDir={onExpandDir}
      activePath={activePath}
      collapsedAll={collapsedAll}
    />
  )
}
