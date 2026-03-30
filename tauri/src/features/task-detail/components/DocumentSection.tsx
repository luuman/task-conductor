import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { DocumentEditor } from './DocumentEditor'
import type { Document } from '../../../lib/api/types'
import styles from './DocumentSection.module.css'

const DOC_TYPE_LABELS: Record<string, string> = {
  requirements: '需求文档',
  research: '调研报告',
  prd: 'PRD',
  architecture: '架构设计',
  'ui-spec': 'UI设计',
  'dev-plan': '开发计划',
  'test-plan': '测试方案',
  note: '笔记',
}

const DOC_TYPE_ICONS: Record<string, string> = {
  requirements: '📋',
  research: '🔬',
  prd: '📄',
  architecture: '🏗️',
  'ui-spec': '🎨',
  'dev-plan': '🗓️',
  'test-plan': '✅',
  note: '📝',
}

interface Props {
  taskId: number
  taskTitle: string
}

export function DocumentSection({ taskId, taskTitle }: Props) {
  const qc = useQueryClient()
  const [activeDocId, setActiveDocId] = useState<number | null>(null)
  const [showNewDoc, setShowNewDoc] = useState(false)
  const [newDocType, setNewDocType] = useState('note')

  const { data: docs = [], isLoading } = useQuery<Document[]>({
    queryKey: ['task-docs', taskId],
    queryFn: () => api.getTaskDocuments(taskId),
  })

  // 当文档列表加载完成且还没有选中文档时，自动选中第一个
  const activeDocIdResolved = activeDocId ?? (docs.length > 0 ? docs[0].id : null)

  const createMut = useMutation({
    mutationFn: (docType: string) =>
      api.createDocument(taskId, {
        title: `${taskTitle} - ${DOC_TYPE_LABELS[docType] ?? docType}`,
        doc_type: docType,
        initial_content: `# ${taskTitle}\n\n## ${DOC_TYPE_LABELS[docType] ?? docType}\n\n`,
      }),
    onSuccess: (doc: Document) => {
      qc.invalidateQueries({ queryKey: ['task-docs', taskId] })
      setActiveDocId(doc.id)
      setShowNewDoc(false)
    },
  })

  const activeDoc = docs.find(d => d.id === activeDocIdResolved)

  if (isLoading) return <div className={styles.loading}>加载文档…</div>

  return (
    <div className={styles.root}>
      {/* Tab 栏 */}
      <div className={styles.tabs}>
        {docs.map(doc => (
          <button
            key={doc.id}
            className={`${styles.tab} ${doc.id === activeDocIdResolved ? styles.active : ''}`}
            onClick={() => setActiveDocId(doc.id)}
          >
            <span>{DOC_TYPE_ICONS[doc.doc_type] ?? '📄'}</span>
            <span>{DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}</span>
          </button>
        ))}

        {showNewDoc ? (
          <div className={styles.newDocRow}>
            <select
              className={styles.typeSelect}
              value={newDocType}
              onChange={e => setNewDocType(e.target.value)}
            >
              {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <button
              className={styles.confirmBtn}
              disabled={createMut.isPending}
              onClick={() => createMut.mutate(newDocType)}
            >
              确认
            </button>
            <button className={styles.cancelBtn} onClick={() => setShowNewDoc(false)}>
              取消
            </button>
          </div>
        ) : (
          <button className={styles.addTab} onClick={() => setShowNewDoc(true)}>
            + 新建文档
          </button>
        )}
      </div>

      {/* 编辑区 */}
      <div className={styles.editorArea}>
        {docs.length === 0 ? (
          <div className={styles.empty}>
            <p>暂无文档</p>
            <button className={styles.addTabLarge} onClick={() => setShowNewDoc(true)}>
              + 创建第一个文档
            </button>
          </div>
        ) : activeDoc ? (
          <DocumentEditor
            key={activeDoc.id}
            docId={activeDoc.id}
            title={activeDoc.title}
          />
        ) : null}
      </div>
    </div>
  )
}
