import { useState, useEffect, useRef, useCallback, type CompositionEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import styles from './DocumentEditor.module.css'

interface Props {
  docId: number
  title: string
}

/** 极简 Markdown → HTML 转换（无第三方库） */
function renderMd(md: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return md
    .split('\n')
    .map(line => {
      const escaped = escape(line)
      if (/^### /.test(line)) return `<h3>${escaped.slice(4)}</h3>`
      if (/^## /.test(line)) return `<h2>${escaped.slice(3)}</h2>`
      if (/^# /.test(line)) return `<h1>${escaped.slice(2)}</h1>`
      if (/^- /.test(line)) return `<li>${escaped.slice(2)}</li>`
      if (/^\d+\. /.test(line)) return `<li>${escaped.replace(/^\d+\. /, '')}</li>`
      if (line.trim() === '') return '<br/>'
      return `<p>${escaped
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
          const safeHref = /^(https?:\/\/|\/)/.test(href) ? href : '#'
          return `<a href="${safeHref}">${text}</a>`
        })
      }</p>`
    })
    .join('')
}

export function DocumentEditor({ docId, title }: Props) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const composingRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['doc-content', docId],
    queryFn: () => api.getDocumentContent(docId),
  })

  const saveMut = useMutation({
    mutationFn: (content: string) => api.updateDocumentContent(docId, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doc-content', docId] }),
  })

  useEffect(() => {
    if (data?.content !== undefined) setDraft(data.content)
  }, [data?.content])

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [])

  const debouncedSave = useCallback((content: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      saveMut.mutate(content)
    }, 800)
  }, [saveMut])

  function handleChange(value: string) {
    setDraft(value)
    debouncedSave(value)
  }

  function handleBlur() {
    setEditing(false)
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveMut.mutate(draft)
    }
  }

  if (isLoading) return <div className={styles.loading}>加载中…</div>

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar}>
        <span className={styles.docTitle}>{title}</span>
        {saveMut.isPending && <span className={styles.saving}>保存中…</span>}
        {!editing && (
          <button className={styles.editBtn} onClick={() => setEditing(true)}>
            编辑
          </button>
        )}
      </div>

      {editing ? (
        <textarea
          className={styles.textarea}
          value={draft}
          autoFocus
          onCompositionStart={() => { composingRef.current = true }}
          onCompositionEnd={(e: CompositionEvent<HTMLTextAreaElement>) => {
            composingRef.current = false
            handleChange(e.currentTarget.value)
          }}
          onChange={e => {
            if (composingRef.current) return
            handleChange(e.target.value)
          }}
          onBlur={handleBlur}
        />
      ) : (
        <div
          className={styles.preview}
          onClick={() => setEditing(true)}
          dangerouslySetInnerHTML={{ __html: draft ? renderMd(draft) : '<p class="placeholder">点击开始编辑…</p>' }}
        />
      )}
    </div>
  )
}
