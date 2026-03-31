// tauri/src/features/git/lib/graph-layout.ts
import type { GitCommit } from '@/lib/api/types'

export interface GraphSegment {
  fromLane: number
  toLane: number
  color: string
}

export interface CommitGraphRow {
  commit: GitCommit
  lane: number
  color: string
  isMerge: boolean
  segments: GraphSegment[]   // 此行的连线段（不含节点圆）
}

const COLORS = ['#4e9eff', '#4ec9b0', '#c586c0', '#f48771', '#dcdcaa', '#ce9178']

function laneColor(lane: number): string {
  return COLORS[lane % COLORS.length]
}

/**
 * 将 GitCommit[] 转换为带泳道信息的 CommitGraphRow[]
 * 简化算法：每个分支占一条泳道，merge 时收拢
 *
 * @param commits 按倒序时间排列（最新在前），即 `git log` 默认顺序
 */
export function computeGraphLayout(commits: GitCommit[]): CommitGraphRow[] {
  // lanes[i] = 当前该泳道正在跟踪的 commit hash（即等待其父节点出现的 hash）
  const lanes: (string | null)[] = []

  const rows: CommitGraphRow[] = commits.map((commit) => {
    const hash = commit.hash
    const parents = commit.parents ?? []

    // 找到此 commit 应在哪条泳道
    let laneIdx = lanes.indexOf(hash)
    if (laneIdx === -1) {
      // 没有泳道在等这个 commit，分配一个空闲泳道
      const freeIdx = lanes.indexOf(null)
      laneIdx = freeIdx === -1 ? lanes.length : freeIdx
      lanes[laneIdx] = hash
    }

    const color = laneColor(laneIdx)
    const segments: GraphSegment[] = []

    // 将此泳道替换为第一个父（主线延续）
    if (parents.length > 0) {
      lanes[laneIdx] = parents[0]
    } else {
      lanes[laneIdx] = null
    }

    // 额外父（merge）：分配新泳道
    for (let p = 1; p < parents.length; p++) {
      if (parents[p] === parents[0]) continue  // 跳过重复父（octopus merge 边界情况）
      const existingLane = lanes.indexOf(parents[p])
      if (existingLane === -1) {
        const freeIdx = lanes.indexOf(null)
        const targetLane = freeIdx === -1 ? lanes.length : freeIdx
        lanes[targetLane] = parents[p]
        segments.push({ fromLane: laneIdx, toLane: targetLane, color: laneColor(targetLane) })
      } else {
        segments.push({ fromLane: laneIdx, toLane: existingLane, color: laneColor(existingLane) })
      }
    }

    // 清理末尾的 null 泳道
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop()
    }

    return {
      commit,
      lane: laneIdx,
      color,
      isMerge: parents.length > 1,
      segments,
    }
  })

  return rows
}
