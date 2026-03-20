import { useCallback, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import styles from '../canvas.module.css'

interface PrdDocPanelProps {
  taskId: number
  prdContent: string | null
  onSave?(content: string): void
}

export function PrdDocPanel({ taskId, prdContent, onSave }: PrdDocPanelProps) {
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(prdContent || '')

  useEffect(() => {
    setContent(prdContent || '')
  }, [prdContent, taskId])

  const handleToggle = useCallback(() => {
    if (editing && content !== prdContent) {
      onSave?.(content)
    }
    setEditing((v) => !v)
  }, [editing, content, prdContent, onSave])

  return (
    <>
      <div className={styles.paneHeader}>
        <span className={styles.paneLabel}>PRD 文档</span>
        <span className={styles.paneBadge}>自动生成</span>
        <button className={styles.canvasToolBtn} onClick={handleToggle} style={{ marginLeft: 'auto' }}>
          {editing ? '预览' : '编辑'}
        </button>
      </div>
      <div className={styles.prdDoc}>
        {editing ? (
          <textarea
            className={styles.prdEditor}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            autoFocus
          />
        ) : content ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        ) : (
          <div className={styles.empty}>等待 AI 生成 PRD...</div>
        )}
      </div>
    </>
  )
}
