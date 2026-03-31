// tauri/src/features/git/components/CommitGraph.tsx
import type { CommitGraphRow } from '../lib/graph-layout'

interface Props {
  row: CommitGraphRow
  /** 每条泳道的宽度（px），默认 14 */
  laneWidth?: number
  height?: number
}

const NODE_R = 4
const MERGE_R = 5

/**
 * 渲染单行 commit graph SVG（宽度 = maxLanes * laneWidth，高度固定 36px）
 * 仅负责该行的节点圆 + 向下延伸线段 + merge 连线。
 */
export function CommitGraph({ row, laneWidth = 14, height = 36 }: Props) {
  const { lane, color, isMerge, segments } = row
  const cx = lane * laneWidth + laneWidth / 2
  const cy = height / 2

  // 计算所有活跃泳道数（节点所在 + segment 涉及的）
  const maxLane = Math.max(lane, ...segments.map(s => Math.max(s.fromLane, s.toLane)))
  const svgWidth = (maxLane + 1) * laneWidth + laneWidth / 2

  return (
    <svg
      width={svgWidth}
      height={height}
      style={{ flexShrink: 0, display: 'block' }}
      aria-hidden="true"
    >
      {/* 垂直延伸线（此节点向下到下一行） */}
      <line
        x1={cx} y1={cy}
        x2={cx} y2={height}
        stroke={color}
        strokeWidth={1.5}
      />
      {/* 垂直延伸线（从顶部到节点） */}
      <line
        x1={cx} y1={0}
        x2={cx} y2={cy}
        stroke={color}
        strokeWidth={1.5}
      />
      {/* merge 连线段 */}
      {segments.map((seg, i) => {
        const tx = seg.toLane * laneWidth + laneWidth / 2
        return (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={tx} y2={height}
            stroke={seg.color}
            strokeWidth={1.5}
          />
        )
      })}
      {/* 节点圆 */}
      <circle
        cx={cx} cy={cy}
        r={isMerge ? MERGE_R : NODE_R}
        fill="#1a1a22"
        stroke={color}
        strokeWidth={isMerge ? 2 : 1.8}
      />
    </svg>
  )
}
