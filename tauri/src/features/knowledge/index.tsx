import { useCallback, useMemo, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant,
  Controls, MiniMap,
  useNodesState, useEdgesState,
  type Node, type Edge, type Connection,
  addEdge,
} from '@xyflow/react'
import dagre from 'dagre'
import '@xyflow/react/dist/style.css'
import { useAppStore } from '../../lib/store/app'
import { api } from '../../lib/api'
import { useNavigate } from 'react-router-dom'
import { DocNode, type DocNodeData } from './components/DocNode'
import type { Document as Doc, DocumentLink, Task } from '../../lib/api/types'
import styles from './knowledge.module.css'

const NODE_TYPES = { docNode: DocNode }

const RELATION_LABELS: Record<string, string> = {
  derived_from: '衍生', depends_on: '依赖',
  references: '参考', contradicts: '矛盾',
}

function layoutWithDagre(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', ranksep: 80, nodesep: 50 })
  nodes.forEach(n => g.setNode(n.id, { width: 210, height: 110 }))
  edges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return nodes.map(n => {
    const pos = g.node(n.id)
    return { ...n, position: { x: pos.x - 105, y: pos.y - 55 } }
  })
}

function buildGraph(
  docs: Doc[],
  links: DocumentLink[],
  tasks: Task[],
  onOpen: (docId: number) => void,
): { nodes: Node[]; edges: Edge[] } {
  const taskMap = new Map(tasks.map(t => [t.id, t.title]))

  const nodes: Node[] = docs.map(doc => ({
    id: String(doc.id),
    type: 'docNode',
    position: (doc.pos_x !== 0 || doc.pos_y !== 0)
      ? { x: doc.pos_x, y: doc.pos_y }
      : { x: 0, y: 0 },
    data: {
      docId: doc.id,
      title: doc.title,
      doc_type: doc.doc_type,
      task_title: doc.task_id ? (taskMap.get(doc.task_id) ?? null) : null,
      updated_at: doc.updated_at,
      onOpen,
    } satisfies DocNodeData,
  }))

  const edges: Edge[] = links.map(lk => ({
    id: `link-${lk.id}`,
    source: String(lk.source_id),
    target: String(lk.target_id),
    label: RELATION_LABELS[lk.relation] ?? lk.relation,
    animated: !lk.auto,
    style: { stroke: lk.auto ? '#6b7280' : '#3b82f6' },
    labelStyle: { fontSize: 10, fill: '#9ca3af' },
  }))

  return { nodes, edges }
}

function KnowledgeGraph() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const activeProjectIdStr = useAppStore(s => s.activeProjectId)
  const activeProjectId = activeProjectIdStr ? Number(activeProjectIdStr) : null
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null)
  const [confirmDeleteLinkId, setConfirmDeleteLinkId] = useState<number | null>(null)

  const { data: projectDocs, isLoading } = useQuery({
    queryKey: ['project-docs', activeProjectId],
    queryFn: () => api.getProjectDocuments(activeProjectId!),
    enabled: !!activeProjectId,
  })

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks', activeProjectId],
    queryFn: () => api.getTasks(activeProjectId!),
    enabled: !!activeProjectId,
  })

  const savePosM = useMutation({
    mutationFn: ({ docId, pos }: { docId: number; pos: { pos_x: number; pos_y: number } }) =>
      api.updateDocumentPosition(docId, pos),
  })

  const createLinkM = useMutation({
    mutationFn: (data: { source_id: number; target_id: number; relation: string }) =>
      api.createDocumentLink(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-docs', activeProjectId] }),
  })

  const deleteLinkM = useMutation({
    mutationFn: (linkId: number) => api.deleteDocumentLink(linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-docs', activeProjectId] }),
  })

  const onOpen = useCallback((docId: number) => {
    setSelectedDocId(docId)
  }, [])

  const { rawNodes, rawEdges } = useMemo(() => {
    if (!projectDocs) return { rawNodes: [], rawEdges: [] }
    const { nodes, edges } = buildGraph(
      projectDocs.documents,
      projectDocs.links,
      tasks,
      onOpen,
    )
    const needsLayout = nodes.some(n => n.position.x === 0 && n.position.y === 0)
    return {
      rawNodes: needsLayout ? layoutWithDagre(nodes, edges) : nodes,
      rawEdges: edges,
    }
  }, [projectDocs, tasks, onOpen])

  const [nodes, setNodes, onNodesChange] = useNodesState(rawNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rawEdges)

  useEffect(() => {
    setNodes(rawNodes)
  }, [rawNodes, setNodes])

  useEffect(() => {
    setEdges(rawEdges)
  }, [rawEdges, setEdges])

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    setEdges(eds => addEdge({ ...connection, label: '参考' }, eds))
    createLinkM.mutate({
      source_id: Number(connection.source),
      target_id: Number(connection.target),
      relation: 'references',
    })
  }, [setEdges, createLinkM.mutate])

  const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    savePosM.mutate({
      docId: Number(node.id),
      pos: { pos_x: node.position.x, pos_y: node.position.y },
    })
  }, [savePosM.mutate])

  // 用应用内确认代替 window.confirm（Tauri Linux 上 window.confirm 不可靠）
  const onEdgeDoubleClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    const linkId = Number(edge.id.replace('link-', ''))
    if (!isNaN(linkId)) setConfirmDeleteLinkId(linkId)
  }, [])

  const selectedDoc = selectedDocId
    ? projectDocs?.documents.find(d => d.id === selectedDocId)
    : null

  if (!activeProjectId) {
    return (
      <div className={styles.empty}>
        <p>请先选择一个项目</p>
      </div>
    )
  }

  if (isLoading) {
    return <div className={styles.empty}><p>加载中…</p></div>
  }

  return (
    <div className={styles.layout}>
      <div className={styles.graphArea}>
        <div className={styles.toolbar}>
          <span className={styles.title}>知识库</span>
          <span className={styles.hint}>拖拽节点 · 连线建立关系 · 双击边删除</span>
          {nodes.length === 0 && (
            <span className={styles.emptyHint}>暂无文档，在任务详情页创建文档后刷新</span>
          )}
        </div>
        {confirmDeleteLinkId !== null && (
          <div className={styles.confirmBar}>
            <span>确认删除这条关系？</span>
            <button
              className={styles.confirmYes}
              onClick={() => {
                deleteLinkM.mutate(confirmDeleteLinkId)
                setConfirmDeleteLinkId(null)
              }}
            >
              删除
            </button>
            <button className={styles.confirmNo} onClick={() => setConfirmDeleteLinkId(null)}>
              取消
            </button>
          </div>
        )}
        <div style={{ flex: 1, position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            onEdgeDoubleClick={onEdgeDoubleClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.3}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--tc-border)" />
            <Controls />
            <MiniMap nodeColor={() => '#6b7280'} maskColor="rgba(0,0,0,0.2)" />
          </ReactFlow>
        </div>
      </div>

      {selectedDoc && (
        <div className={styles.docPanel}>
          <div className={styles.docPanelHeader}>
            <span className={styles.docPanelTitle}>{selectedDoc.title}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {selectedDoc.task_id && (
                <button
                  className={styles.jumpBtn}
                  onClick={() => navigate(`/task/${selectedDoc.task_id}`)}
                >
                  跳转任务
                </button>
              )}
              <button className={styles.closeBtn} onClick={() => setSelectedDocId(null)}>✕</button>
            </div>
          </div>
          <DocContentPreview docId={selectedDoc.id} />
        </div>
      )}
    </div>
  )
}

function DocContentPreview({ docId }: { docId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['doc-content', docId],
    queryFn: () => api.getDocumentContent(docId),
  })
  if (isLoading) return <div className={styles.docLoading}>加载中…</div>
  return (
    <pre className={styles.docContent}>{data?.content ?? ''}</pre>
  )
}

export default function KnowledgePage() {
  return (
    <ReactFlowProvider>
      <KnowledgeGraph />
    </ReactFlowProvider>
  )
}
