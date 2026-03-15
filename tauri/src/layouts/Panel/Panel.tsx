import { useCallback, useRef, type ReactNode } from 'react'
import { useShell } from '../AppShell/ShellContext'
import { IconX } from '../../ui/icon'
import styles from './panel.module.css'

export interface PanelProps {
  children: ReactNode
  minHeight?: number
  maxHeight?: number
}

export function Panel({ children, minHeight = 150, maxHeight = 400 }: PanelProps) {
  const { panelOpen, setPanelOpen, panelHeight, setPanelHeight } = useShell()
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragRef.current = { startY: e.clientY, startHeight: panelHeight }

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return
        const delta = dragRef.current.startY - ev.clientY
        const newHeight = Math.min(maxHeight, Math.max(minHeight, dragRef.current.startHeight + delta))
        setPanelHeight(newHeight)
      }

      const handleMouseUp = () => {
        dragRef.current = null
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [panelHeight, setPanelHeight, minHeight, maxHeight]
  )

  return (
    <div
      className={`${styles.wrapper} ${!panelOpen ? styles.collapsed : ''}`}
      style={{ height: panelOpen ? panelHeight : 0 }}
    >
      <div className={styles.panel}>
        <div className={styles.dragBar} onMouseDown={handleMouseDown} />
        <div className={styles.header}>
          <button
            className={styles.closeBtn}
            onClick={() => setPanelOpen(false)}
            aria-label="Close panel"
          >
            <IconX size={14} />
          </button>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  )
}
