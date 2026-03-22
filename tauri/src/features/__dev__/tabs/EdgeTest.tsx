/**
 * 最小化 xyflow 连线测试
 * 如果这个都不显示线，说明 xyflow 本身有问题
 */
import {
  ReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

function SourceNode({ data }: NodeProps) {
  return (
    <div style={{
      padding: 16, background: '#1e1e2e', border: '2px solid #58a6ff',
      borderRadius: 8, color: '#fff', fontSize: 14,
    }}>
      {String(data?.label ?? 'Source')}
      <Handle type="source" position={Position.Right} style={{ background: '#58a6ff' }} />
    </div>
  )
}

function TargetNode({ data }: NodeProps) {
  return (
    <div style={{
      padding: 16, background: '#1e1e2e', border: '2px solid #3fb950',
      borderRadius: 8, color: '#fff', fontSize: 14,
    }}>
      <Handle type="target" position={Position.Left} style={{ background: '#3fb950' }} />
      {String(data?.label ?? 'Target')}
    </div>
  )
}

const nodeTypes = { source: SourceNode, target: TargetNode }

const testNodes: Node[] = [
  { id: 'a', type: 'source', position: { x: 50, y: 100 }, data: { label: 'Raw 节点' } },
  { id: 'b', type: 'target', position: { x: 400, y: 100 }, data: { label: 'Styled 节点' } },
]
const testEdges: Edge[] = [
  { id: 'ab', source: 'a', target: 'b' },
]

function Inner() {
  const [nodes, , onNodesChange] = useNodesState(testNodes)
  const [edges, , onEdgesChange] = useEdgesState(testEdges)

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      style={{ background: '#111' }}
    />
  )
}

export function EdgeTest() {
  return (
    <div style={{ width: '100%', height: 300, border: '1px solid red' }}>
      <ReactFlowProvider>
        <Inner />
      </ReactFlowProvider>
    </div>
  )
}
