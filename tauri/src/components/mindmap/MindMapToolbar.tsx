// tauri/src/components/mindmap/MindMapToolbar.tsx

import { useMindMapStore } from './use-mindmap-store'
import { IconX } from '../../ui/icon'
import styles from './mindmap.module.css'

interface Props {
  nodeId: string
  /** 工具栏应出现的画布坐标（节点上方） */
  x: number
  y: number
}

export function MindMapToolbar({ nodeId, x, y }: Props) {
  const { addNode, removeNode } = useMindMapStore()
  const node = useMindMapStore((s) => s.nodes.find((n) => n.id === nodeId))

  if (!node) return null

  return (
    <div className={styles.toolbar} style={{ left: x, top: y - 40 }}>
      <button className={styles.toolbarBtn}
        onClick={() => addNode(nodeId)} title="添加子节点">＋</button>
      {node.parentId && (
        <button className={styles.toolbarBtn}
          onClick={() => removeNode(nodeId)} title="删除">✕</button>
      )}
    </div>
  )
}
