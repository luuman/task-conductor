import { useCallback, useRef, type ReactNode } from 'react'
import styles from '../canvas.module.css'

interface SplitLayoutProps {
  left: ReactNode
  right: ReactNode
  ratio: number
  onRatioChange(ratio: number): void
}

export function SplitLayout({ left, right, ratio, onRatioChange }: SplitLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = true
    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      onRatioChange(Math.max(0.2, Math.min(0.8, (ev.clientX - rect.left) / rect.width)))
    }
    const handleUp = () => {
      dragRef.current = false
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [onRatioChange])

  return (
    <div ref={containerRef} className={styles.splitContainer}>
      <div className={styles.splitPane} style={{ flex: ratio }}>{left}</div>
      <div className={styles.splitDivider} onMouseDown={handleMouseDown} />
      <div className={styles.splitPane} style={{ flex: 1 - ratio }}>{right}</div>
    </div>
  )
}
