import { useMemo } from "react";
import { type GitCommit } from "../../lib/api";

interface GitGraphProps {
  commits: GitCommit[];
  selectedCommit: string | null;
  onSelectCommit: (sha: string) => void;
}

const ROW_HEIGHT = 32;
const LANE_WIDTH = 16;
const NODE_RADIUS = 4;
const LINE_WIDTH = 2;
const GRAPH_LEFT_PAD = 12;

const COLORS = [
  "#7aa2f7", "#9ece6a", "#e0af68", "#f7768e",
  "#bb9af7", "#7dcfff", "#ff9e64", "#73daca",
];

function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

interface LaneInfo {
  lane: number;
  color: string;
}

interface Edge {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
}

function computeGraph(commits: GitCommit[]) {
  // lanes[i] = hash that has reserved lane i, or null if free
  const lanes: (string | null)[] = [];
  // map hash -> { lane, color }
  const commitLaneMap = new Map<string, LaneInfo>();
  // track which lane color index to assign next
  let nextColorIdx = 0;

  function laneX(lane: number) {
    return GRAPH_LEFT_PAD + lane * LANE_WIDTH;
  }

  function findOrAllocLane(hash: string): number {
    // Check if hash already has a reserved lane
    const idx = lanes.indexOf(hash);
    if (idx !== -1) return idx;
    // Find first empty lane
    const empty = lanes.indexOf(null);
    if (empty !== -1) {
      lanes[empty] = hash;
      return empty;
    }
    // Push new lane
    lanes.push(hash);
    return lanes.length - 1;
  }

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const _y = i * ROW_HEIGHT + ROW_HEIGHT / 2;

    // Find this commit's lane
    let myLane = lanes.indexOf(commit.hash);
    if (myLane === -1) {
      myLane = findOrAllocLane(commit.hash);
    }

    // Assign color: if this lane already had a color from reservation, use it;
    // otherwise assign a new one
    let color: string;
    const existing = commitLaneMap.get(commit.hash);
    if (existing) {
      color = existing.color;
    } else {
      color = COLORS[nextColorIdx % COLORS.length];
      nextColorIdx++;
    }

    commitLaneMap.set(commit.hash, { lane: myLane, color });

    // Free this lane (commit has been placed)
    lanes[myLane] = null;

    // Process parents
    for (let p = 0; p < commit.parents.length; p++) {
      const parentHash = commit.parents[p];

      if (p === 0) {
        // First parent: straight line, same lane
        if (lanes[myLane] === null) {
          lanes[myLane] = parentHash;
        } else {
          findOrAllocLane(parentHash);
        }
        const parentLane = lanes.indexOf(parentHash);
        const parentColor = color; // inherit color from this commit
        // Pre-register parent so it picks up the color
        if (!commitLaneMap.has(parentHash)) {
          commitLaneMap.set(parentHash, { lane: parentLane, color: parentColor });
        }
      } else {
        // Merge parent: different lane
        const parentLaneIdx = findOrAllocLane(parentHash);
        const mergeColor = COLORS[nextColorIdx % COLORS.length];
        nextColorIdx++;
        if (!commitLaneMap.has(parentHash)) {
          commitLaneMap.set(parentHash, { lane: parentLaneIdx, color: mergeColor });
        }
      }
    }

    // Generate edges to parents (will be drawn as lines to wherever the parent ends up)
    // We store edges referencing parent hashes; we'll resolve positions in a second pass
  }

  // Second pass: generate edges
  const edgesResult: Edge[] = [];
  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const info = commitLaneMap.get(commit.hash)!;
    const fromY = i * ROW_HEIGHT + ROW_HEIGHT / 2;
    const fromXPos = laneX(info.lane);

    for (const parentHash of commit.parents) {
      // Find the parent commit's index
      const parentIdx = commits.findIndex((c) => c.hash === parentHash);
      if (parentIdx === -1) {
        // Parent not in the visible list; draw line to bottom
        const parentInfo = commitLaneMap.get(parentHash);
        if (parentInfo) {
          edgesResult.push({
            fromX: fromXPos,
            fromY,
            toX: laneX(parentInfo.lane),
            toY: commits.length * ROW_HEIGHT,
            color: parentInfo.color,
          });
        }
        continue;
      }

      const parentInfo = commitLaneMap.get(parentHash)!;
      const toY = parentIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
      const toXPos = laneX(parentInfo.lane);

      edgesResult.push({
        fromX: fromXPos,
        fromY,
        toX: toXPos,
        toY,
        color: parentInfo.color,
      });
    }
  }

  const maxLane = Math.max(0, ...Array.from(commitLaneMap.values()).map((v) => v.lane));

  return {
    commitLaneMap,
    edges: edgesResult,
    maxLane,
    laneX,
  };
}

function renderEdgePath(edge: Edge): string {
  const { fromX, fromY, toX, toY } = edge;
  if (fromX === toX) {
    // Straight vertical line
    return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  }
  // Curved line (quadratic bezier)
  // Go down from source, then curve to target lane, then straight down to target
  const midY = fromY + ROW_HEIGHT * 0.75;
  return `M ${fromX} ${fromY} L ${fromX} ${Math.min(midY, toY)} Q ${fromX} ${midY + ROW_HEIGHT * 0.25} ${toX} ${midY + ROW_HEIGHT * 0.5} L ${toX} ${toY}`;
}

function refBadge(ref: string) {
  const isHead = ref === "HEAD";
  const isTag = ref.startsWith("tag: ");
  const label = isTag ? ref.slice(5) : ref;

  let bg = "bg-blue-500/20 text-blue-400 border-blue-500/30";
  if (isHead) bg = "bg-green-500/20 text-green-400 border-green-500/30";
  else if (isTag) bg = "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";

  return (
    <span
      key={ref}
      className={`inline-flex items-center px-1.5 py-0 text-[10px] font-medium rounded border mr-1 ${bg}`}
    >
      {label}
    </span>
  );
}

export default function GitGraph({ commits, selectedCommit, onSelectCommit }: GitGraphProps) {
  const { commitLaneMap, edges, maxLane, laneX } = useMemo(
    () => computeGraph(commits),
    [commits]
  );

  const graphWidth = GRAPH_LEFT_PAD + (maxLane + 1) * LANE_WIDTH + 8;
  const totalHeight = commits.length * ROW_HEIGHT;

  return (
    <div className="overflow-y-auto relative" style={{ maxHeight: "100%" }}>
      <div className="relative" style={{ minHeight: totalHeight }}>
        {/* Background SVG for edges */}
        <svg
          className="absolute top-0 left-0 pointer-events-none"
          width={graphWidth}
          height={totalHeight}
          style={{ zIndex: 0 }}
        >
          {edges.map((edge, i) => (
            <path
              key={i}
              d={renderEdgePath(edge)}
              stroke={edge.color}
              strokeWidth={LINE_WIDTH}
              fill="none"
            />
          ))}
        </svg>

        {/* Commit rows */}
        {commits.map((commit, i) => {
          const info = commitLaneMap.get(commit.hash);
          if (!info) return null;
          const y = i * ROW_HEIGHT;
          const cy = ROW_HEIGHT / 2;
          const cx = laneX(info.lane);
          const isSelected = selectedCommit === commit.hash;

          return (
            <div
              key={commit.hash}
              className={`flex items-center cursor-pointer hover:bg-white/[0.03] ${
                isSelected ? "bg-white/[0.06]" : ""
              }`}
              style={{ height: ROW_HEIGHT }}
              onClick={() => onSelectCommit(commit.hash)}
            >
              {/* Graph node (inline SVG) */}
              <svg
                width={graphWidth}
                height={ROW_HEIGHT}
                className="shrink-0"
                style={{ zIndex: 1 }}
              >
                {/* Node */}
                {isSelected ? (
                  <>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={NODE_RADIUS + 3}
                      fill="none"
                      stroke={info.color}
                      strokeWidth={1.5}
                      opacity={0.5}
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={NODE_RADIUS}
                      fill={info.color}
                    />
                  </>
                ) : (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={NODE_RADIUS}
                    fill={info.color}
                  />
                )}
              </svg>

              {/* Commit info */}
              <div className="flex items-center gap-2 min-w-0 flex-1 pr-3">
                <span
                  className="font-mono text-xs shrink-0"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {commit.hash.slice(0, 7)}
                </span>
                {commit.refs.length > 0 && (
                  <span className="shrink-0 flex items-center">
                    {commit.refs.map((r) => refBadge(r))}
                  </span>
                )}
                <span
                  className="text-sm truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {commit.message}
                </span>
                <span
                  className="text-xs shrink-0 ml-auto"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {commit.author}
                </span>
                <span
                  className="text-xs shrink-0"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {relativeTime(commit.date)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
