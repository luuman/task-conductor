// tauri/src/components/mindmap/MindMapNode.tsx

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { MindMapNodeData } from './mindmap-types'
import { useMindMapStore } from './use-mindmap-store'
import styles from './mindmap.module.css'

/** 状态 → CSS class 映射 */
function statusClass(status?: string): string {
  if (!status) return ''
  if (status === 'done') return styles.statusDone
  if (status === 'pending' || status === 'input') return styles.statusPending
  return styles.statusDev // analysis, prd, plan, dev, test, deploy 等
}

export function MindMapNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as MindMapNodeData
  const { updateNode, toggleCollapse, removeNode, addNode } = useMindMapStore()
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(nodeData.label)
  const inputRef = useRef<HTMLInputElement>(null)

  // 子节点数量（从全局 nodes 获取）
  const childCount = useMindMapStore(
    (s) => s.nodes.filter((n) => n.parentId === nodeData.id).length
  )

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const commitEdit = useCallback(() => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== nodeData.label) {
      updateNode(nodeData.id, { label: trimmed })
    } else {
      setEditValue(nodeData.label)
    }
    setEditing(false)
  }, [editValue, nodeData.id, nodeData.label, updateNode])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        commitEdit()
      } else if (e.key === 'Escape') {
        setEditValue(nodeData.label)
        setEditing(false)
      }
    },
    [commitEdit, nodeData.label]
  )

  // suppress unused variable warnings
  void removeNode
  void addNode

  const bgColor = nodeData.color ? `${nodeData.color}14` : 'rgba(255,255,255,0.04)'
  const borderColor = nodeData.color ? `${nodeData.color}88` : 'rgba(255,255,255,0.12)'
  const borderWidth = nodeData.type === 'root' ? 2 : 1.5
  const glowShadow = selected && nodeData.color
    ? `0 0 18px ${nodeData.color}26`
    : 'none'

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div
        className={styles.node}
        data-type={nodeData.type}
        style={{
          background: bgColor,
          border: `${borderWidth}px solid ${borderColor}`,
          color: nodeData.color ?? '#ccc',
          boxShadow: glowShadow,
        }}
        onDoubleClick={() => {
          setEditValue(nodeData.label)
          setEditing(true)
        }}
      >
        {nodeData.icon && <span className={styles.nodeIcon}>{nodeData.icon}</span>}

        {editing ? (
          <input
            ref={inputRef}
            className={styles.nodeLabelEdit}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <span className={styles.nodeLabel}>{nodeData.label}</span>
        )}

        {nodeData.status && (
          <span className={`${styles.nodeBadge} ${statusClass(nodeData.status)}`}>
            {nodeData.status}
          </span>
        )}

        {childCount > 0 && (
          <>
            <span className={styles.nodeChildCount}>{childCount}</span>
            <button
              className={styles.nodeCollapseBtn}
              onClick={(e) => {
                e.stopPropagation()
                toggleCollapse(nodeData.id)
              }}
            >
              {nodeData.collapsed ? '▸' : '▾'}
            </button>
          </>
        )}
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </>
  )
}
