// tauri/src/components/mindmap/MindMapContextMenu.tsx

import { useEffect, useRef } from 'react'
import { useMindMapStore } from './use-mindmap-store'
import { IconX } from '../../ui/icon'
import styles from './mindmap.module.css'

interface Props {
  x: number
  y: number
  nodeId: string
  onClose(): void
}

export function MindMapContextMenu({ x, y, nodeId, onClose }: Props) {
  const { addNode, addSibling, removeNode } = useMindMapStore()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const node = useMindMapStore((s) => s.nodes.find((n) => n.id === nodeId))

  return (
    <div ref={ref} className={styles.contextMenu} style={{ left: x, top: y }}>
      <button className={styles.contextMenuItem}
        onClick={() => { addNode(nodeId); onClose() }}>
        ＋ 添加子节点
      </button>
      {node?.parentId && (
        <button className={styles.contextMenuItem}
          onClick={() => { addSibling(nodeId); onClose() }}>
          ＋ 添加同级
        </button>
      )}
      <div className={styles.contextMenuDivider} />
      {node?.parentId && (
        <button className={styles.contextMenuItemDanger}
          onClick={() => { removeNode(nodeId); onClose() }}>
          ✕ 删除
        </button>
      )}
    </div>
  )
}
