// tauri/src/components/mindmap/MindMapEdge.tsx

import { type EdgeProps, getBezierPath } from '@xyflow/react'

export function MindMapEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const color = (data as Record<string, unknown>)?.color as string ?? 'rgba(255,255,255,0.15)'
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.4,
  })

  return (
    <path
      id={id}
      d={edgePath}
      fill="none"
      stroke={`${color}66`}
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  )
}
