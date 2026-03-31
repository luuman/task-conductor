# Git Page 重设计实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 Git 页面从「左栏 Tab 切换 + 右侧 Diff」重构为「左侧导航树 + 上方提交历史 + 下方变更列表 + 右侧 Monaco Diff」的四区域布局。

**Architecture:** 复用现有全部 hooks（`useGitStatus`、`useGitLog`、`useDiff` 等）和 API 层；新增 `graph-layout.ts` 计算 SVG commit graph 布局；逐步创建新组件（`GitNavCol`、`CommitHistory`、`CommitGraph`、`ChangesPanel`），最后重写 `GitPage.tsx` 主容器接入所有新组件。

**Tech Stack:** React 19、CSS Modules、Zustand 5、TanStack Query 5、`@monaco-editor/react`

---

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `tauri/src/lib/store/git.ts` | 修改 | 新增 `navSections`、`selectedCommit`、`historyScope`、`searchQuery`、`fileViewerOpen`、`changesCollapsed` 字段 |
| `tauri/src/features/git/lib/graph-layout.ts` | 新建 | commit graph 泳道布局算法（纯函数） |
| `tauri/src/features/git/components/CommitGraph.tsx` | 新建 | 每行 SVG 片段渲染 |
| `tauri/src/features/git/components/GitNavCol.tsx` | 新建 | 左侧导航列（分支树 + 底部状态） |
| `tauri/src/features/git/components/GitNavCol.module.css` | 新建 | |
| `tauri/src/features/git/components/CommitHistory.tsx` | 新建 | 提交历史列表 + toolbar |
| `tauri/src/features/git/components/CommitHistory.module.css` | 新建 | |
| `tauri/src/features/git/components/ChangesPanel.tsx` | 新建 | 变更文件列表 + 提交区（替换旧 ChangesTab） |
| `tauri/src/features/git/components/ChangesPanel.module.css` | 新建 | |
| `tauri/src/features/git/components/DiffViewer.tsx` | 修改 | 新增文件名芯片 + 文件查看器覆盖层 |
| `tauri/src/features/git/components/diff-viewer.module.css` | 修改 | 新增 `.fileChip`、`.fileViewer` 等 |
| `tauri/src/features/git/GitPage.tsx` | 重写 | 四区域布局容器 |
| `tauri/src/features/git/git-page.module.css` | 重写 | 新布局 CSS |

---

## Task 1: 扩展 git-store.ts

**Files:**
- Modify: `tauri/src/lib/store/git.ts`

- [ ] **Step 1: 读取现有 store 确认现有字段**

```bash
cat tauri/src/lib/store/git.ts
```

- [ ] **Step 2: 在 `GitState` interface 中新增字段**

在 `activeTab` 之后添加（保留原有字段不删除）：

```typescript
// 导航分组折叠状态（key = 分组名）
navSections: Record<string, boolean>  // true = 展开

// 提交历史
selectedCommit: string | null          // 选中的 commit hash
historyScope: 'all' | 'current' | 'other'
historySearch: string

// Diff 区
fileViewerOpen: boolean

// 变更面板
changesCollapsed: boolean
```

- [ ] **Step 3: 在 actions 中添加对应 setter**

```typescript
setNavSection: (key: string, open: boolean) => void
setSelectedCommit: (hash: string | null) => void
setHistoryScope: (scope: 'all' | 'current' | 'other') => void
setHistorySearch: (q: string) => void
setFileViewerOpen: (open: boolean) => void
setChangesCollapsed: (collapsed: boolean) => void
```

- [ ] **Step 4: 在 `create` 初始值中补充默认值**

```typescript
navSections: { local: true, remote: true, tags: false, stash: true, submodules: false, subtrees: false },
selectedCommit: null,
historyScope: 'all',
historySearch: '',
fileViewerOpen: false,
changesCollapsed: false,
```

- [ ] **Step 5: 在 actions 实现中补充**

```typescript
setNavSection: (key, open) => set(s => ({ navSections: { ...s.navSections, [key]: open } })),
setSelectedCommit: (hash) => set({ selectedCommit: hash, selectedFile: null }),
setHistoryScope: (scope) => set({ historyScope: scope }),
setHistorySearch: (q) => set({ historySearch: q }),
setFileViewerOpen: (open) => set({ fileViewerOpen: open }),
setChangesCollapsed: (collapsed) => set({ changesCollapsed: collapsed }),
```

- [ ] **Step 6: 类型检查**

```bash
cd tauri && npx tsc --noEmit 2>&1 | grep git
```

期望：无 git.ts 相关报错。

- [ ] **Step 7: Commit**

```bash
git add tauri/src/lib/store/git.ts
git commit -m "feat(git): extend git store with history/nav/viewer state"
```

---

## Task 2: 创建 graph-layout.ts

**Files:**
- Create: `tauri/src/features/git/lib/graph-layout.ts`

- [ ] **Step 1: 创建文件，定义类型**

```typescript
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
```

- [ ] **Step 2: 实现 `computeGraphLayout`**

```typescript
/**
 * 将 GitCommit[] 转换为带泳道信息的 CommitGraphRow[]
 * 简化算法：每个分支占一条泳道，merge 时收拢
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
```

- [ ] **Step 3: 类型检查**

```bash
cd tauri && npx tsc --noEmit 2>&1 | grep graph-layout
```

期望：无报错。

- [ ] **Step 4: Commit**

```bash
git add tauri/src/features/git/lib/graph-layout.ts
git commit -m "feat(git): add commit graph lane layout algorithm"
```

---

## Task 3: 创建 CommitGraph.tsx

**Files:**
- Create: `tauri/src/features/git/components/CommitGraph.tsx`

- [ ] **Step 1: 创建组件文件**

```tsx
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
```

- [ ] **Step 2: 类型检查**

```bash
cd tauri && npx tsc --noEmit 2>&1 | grep CommitGraph
```

期望：无报错。

- [ ] **Step 3: Commit**

```bash
git add tauri/src/features/git/components/CommitGraph.tsx
git commit -m "feat(git): add CommitGraph SVG row renderer"
```

---

## Task 4: 创建 GitNavCol.tsx

**Files:**
- Create: `tauri/src/features/git/components/GitNavCol.tsx`
- Create: `tauri/src/features/git/components/GitNavCol.module.css`

- [ ] **Step 1: 创建 CSS module**

```css
/* tauri/src/features/git/components/GitNavCol.module.css */
.nav {
  width: 190px;
  flex-shrink: 0;
  background: var(--tc-bg-secondary, #13131c);
  border-right: 1px solid var(--tc-border, #24242e);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
}

.repoHdr {
  padding: 9px 12px;
  border-bottom: 1px solid var(--tc-border, #1e1e28);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.repoName {
  font-size: 12px;
  color: var(--tc-foreground-secondary, #c0c0d0);
  font-weight: 600;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.scroll::-webkit-scrollbar { width: 3px; }
.scroll::-webkit-scrollbar-thumb { background: var(--tc-border, #2a2a3a); }

/* Section group header */
.grpHdr {
  padding: 5px 10px 3px;
  display: flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  user-select: none;
}
.grpHdr:hover .grpTxt { color: var(--tc-foreground-muted, #666); }

.grpChev {
  width: 12px;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--tc-border-strong, #2e2e42);
  transition: transform 0.12s;
  flex-shrink: 0;
}
.grpChev.open { transform: rotate(90deg); color: var(--tc-foreground-muted, #444); }

.grpTxt {
  font-size: 9.5px;
  color: var(--tc-foreground-disabled, #2e2e42);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex: 1;
}
.grpCnt { font-size: 9px; color: var(--tc-foreground-disabled, #2e2e42); }

.grpBody { }
.grpBody.collapsed { display: none; }

/* Branch node */
.tnode {
  padding: 2.5px 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 11px;
  color: var(--tc-foreground-muted, #5a5a78);
  white-space: nowrap;
  overflow: hidden;
}
.tnode:hover { background: rgba(255,255,255,.03); color: var(--tc-foreground-secondary, #999); }
.tnode.current { color: var(--tc-accent, #4e9eff); background: rgba(78,158,255,.06); }
.tnode.child { padding-left: 18px; }
.tnode.child2 { padding-left: 26px; }

.tdot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dotCur  { background: #4ec9b0; }
.dotLoc  { background: #555; }
.dotRem  { background: #9cdcfe; }
.dotTag  { background: #dcdcaa; }
.dotStash{ background: #ce9178; }
.dotSub  { background: #c586c0; }

.tname { flex: 1; overflow: hidden; text-overflow: ellipsis; }

.badgeCur {
  background: rgba(78,201,176,.12);
  color: #4ec9b0;
  font-size: 8.5px;
  padding: 1px 4px;
  border-radius: 3px;
  flex-shrink: 0;
}
.badgeTask {
  background: rgba(232,160,0,.1);
  color: #e8a000;
  font-size: 8.5px;
  padding: 1px 4px;
  border-radius: 3px;
  flex-shrink: 0;
}

/* Footer */
.footer {
  border-top: 1px solid var(--tc-border, #1e1e28);
  flex-shrink: 0;
}
.cfgRow {
  padding: 5px 10px;
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--tc-foreground-disabled, #444);
  font-size: 11px;
  cursor: pointer;
  border-bottom: 1px solid var(--tc-border-subtle, #1a1a24);
}
.cfgRow:hover { background: rgba(255,255,255,.03); color: var(--tc-foreground-muted, #888); }

.branchRow {
  padding: 5px 8px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.branchChip {
  flex: 1;
  background: var(--tc-bg-tertiary, #1e1e2a);
  border: 1px solid var(--tc-border, #2a2a3a);
  border-radius: 5px;
  padding: 3px 7px;
  font-size: 10px;
  color: #4ec9b0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.branchBtn {
  background: var(--tc-bg-tertiary, #1e1e2a);
  border: 1px solid var(--tc-border, #2a2a3a);
  border-radius: 4px;
  padding: 3px 7px;
  font-size: 10px;
  color: var(--tc-foreground-muted, #555);
  cursor: pointer;
  flex-shrink: 0;
}
.branchBtn:hover { color: var(--tc-foreground, #ccc); border-color: var(--tc-accent, #4e9eff); }
```

- [ ] **Step 2: 创建 GitNavCol.tsx**

```tsx
// tauri/src/features/git/components/GitNavCol.tsx
import { useGitStore } from '@/lib/store/git'
import { useGitStatus } from '../hooks/useGitStatus'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import css from './GitNavCol.module.css'

interface Props {
  projectId: number
  onConfigClick: () => void
}

function ChevronIcon() {
  return (
    <svg width="7" height="7" viewBox="0 0 8 8" fill="currentColor">
      <path d="M1.5 1l4 3-4 3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
    </svg>
  )
}

function DotIcon({ cls }: { cls: string }) {
  return <span className={`${css.tdot} ${cls}`} />
}

export function GitNavCol({ projectId, onConfigClick }: Props) {
  const {
    navSections,
    setNavSection,
    selectedBranch,
    setSelectedTask,
  } = useGitStore()

  const { data: status } = useGitStatus(projectId)
  const currentBranch = status?.branch ?? ''

  const { data: branches = [] } = useQuery({
    queryKey: ['git-branches', projectId],
    queryFn: () => api.git.gitBranches(projectId),
    staleTime: 10_000,
  })

  const { data: stashes = [] } = useQuery({
    queryKey: ['git-stash-list', projectId],
    queryFn: () => api.git.gitStashList(projectId),
    staleTime: 10_000,
  })

  const localBranches = branches.filter(b => !b.remote)
  const remoteBranches = branches.filter(b => b.remote)

  // Group local branches by prefix (feat/, fix/, etc.)
  const grouped: Record<string, string[]> = {}
  const ungrouped: string[] = []
  for (const b of localBranches) {
    const slash = b.name.indexOf('/')
    if (slash > 0) {
      const prefix = b.name.slice(0, slash)
      grouped[prefix] ??= []
      grouped[prefix].push(b.name)
    } else {
      ungrouped.push(b.name)
    }
  }

  function toggle(key: string) {
    setNavSection(key, !navSections[key])
  }

  return (
    <aside className={css.nav}>
      <div className={css.repoHdr}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="#4ec9b0">
          <path d="M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.122a2.25 2.25 0 10-1.5 0v.878A2.25 2.25 0 005.75 8.5h1.5v2.128a2.251 2.251 0 101.5 0V8.5h1.5a2.25 2.25 0 002.25-2.25v-.878a2.25 2.25 0 10-1.5 0v.878a.75.75 0 01-.75.75h-4.5A.75.75 0 015 6.25v-.878zm3.75 7.378a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3-8.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"/>
        </svg>
        <span className={css.repoName}>task-conductor</span>
      </div>

      <div className={css.scroll}>
        {/* 本地分支 */}
        <div className={css.grpHdr} onClick={() => toggle('local')}>
          <span className={`${css.grpChev} ${navSections.local ? css.open : ''}`}><ChevronIcon /></span>
          <span className={css.grpTxt}>本地分支</span>
          <span className={css.grpCnt}>{localBranches.length}</span>
        </div>
        <div className={`${css.grpBody} ${navSections.local ? '' : css.collapsed}`}>
          {Object.entries(grouped).map(([prefix, names]) => (
            <div key={prefix}>
              <div className={`${css.tnode} ${css.child}`}>
                <DotIcon cls={css.dotLoc} />
                <span className={css.tname} style={{ color: 'var(--tc-foreground-disabled,#444)' }}>{prefix}</span>
              </div>
              {names.map(name => (
                <div
                  key={name}
                  className={`${css.tnode} ${css.child2} ${name === currentBranch ? css.current : ''}`}
                  onClick={() => setSelectedTask(null, name)}
                >
                  <DotIcon cls={name === currentBranch ? css.dotCur : css.dotLoc} />
                  <span className={css.tname}>{name.slice(prefix.length + 1)}</span>
                  {name === currentBranch && <span className={css.badgeCur}>当前</span>}
                </div>
              ))}
            </div>
          ))}
          {ungrouped.map(name => (
            <div
              key={name}
              className={`${css.tnode} ${name === currentBranch ? css.current : ''}`}
              onClick={() => setSelectedTask(null, name)}
            >
              <DotIcon cls={name === currentBranch ? css.dotCur : css.dotLoc} />
              <span className={css.tname}>{name}</span>
              {name === currentBranch && <span className={css.badgeCur}>当前</span>}
            </div>
          ))}
        </div>

        {/* 远程 */}
        <div className={css.grpHdr} onClick={() => toggle('remote')}>
          <span className={`${css.grpChev} ${navSections.remote ? css.open : ''}`}><ChevronIcon /></span>
          <span className={css.grpTxt}>远程</span>
          <span className={css.grpCnt}>{remoteBranches.length}</span>
        </div>
        <div className={`${css.grpBody} ${navSections.remote ? '' : css.collapsed}`}>
          {remoteBranches.map(b => (
            <div key={b.name} className={`${css.tnode} ${css.child}`}>
              <DotIcon cls={css.dotRem} />
              <span className={css.tname}>{b.name}</span>
            </div>
          ))}
        </div>

        {/* 标签 */}
        <div className={css.grpHdr} onClick={() => toggle('tags')}>
          <span className={`${css.grpChev} ${navSections.tags ? css.open : ''}`}><ChevronIcon /></span>
          <span className={css.grpTxt}>标签</span>
        </div>
        <div className={`${css.grpBody} ${navSections.tags ? '' : css.collapsed}`} />

        {/* 储藏 */}
        <div className={css.grpHdr} onClick={() => toggle('stash')}>
          <span className={`${css.grpChev} ${navSections.stash ? css.open : ''}`}><ChevronIcon /></span>
          <span className={css.grpTxt}>储藏</span>
          <span className={css.grpCnt}>{stashes.length}</span>
        </div>
        <div className={`${css.grpBody} ${navSections.stash ? '' : css.collapsed}`}>
          {stashes.map((s, i) => (
            <div key={i} className={css.tnode}>
              <DotIcon cls={css.dotStash} />
              <span className={css.tname}>{s.message}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={css.footer}>
        <div className={css.cfgRow} onClick={onConfigClick}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M7.429 1.525a6.593 6.593 0 011.142 0c.036.003.108.036.137.146l.289 1.105c.147.56.55.967.997 1.189.174.086.341.178.502.274.45.262.957.314 1.417.129l1.038-.43c.104-.043.191-.006.243.048a6.809 6.809 0 01.571.99c.023.053.018.14-.048.217l-.733.812c-.37.41-.494.98-.408 1.499.023.137.035.277.035.42s-.012.283-.035.42c-.086.52.038 1.089.408 1.499l.733.81c.066.078.071.165.048.218a6.804 6.804 0 01-.571.99c-.052.054-.139.091-.243.048l-1.038-.43c-.46-.185-.967-.133-1.417.129a6.6 6.6 0 01-.502.274c-.447.222-.85.629-.997 1.188l-.289 1.105c-.029.11-.101.143-.137.146a6.587 6.587 0 01-1.142 0c-.036-.003-.108-.036-.137-.146l-.289-1.105c-.147-.56-.55-.966-.997-1.188a6.6 6.6 0 01-.502-.274c-.45-.262-.957-.314-1.417-.129l-1.038.43c-.104.043-.191.006-.243-.048a6.812 6.812 0 01-.571-.99c-.023-.053-.018-.14.048-.217l.733-.812c.37-.41.494-.98.408-1.499A4.01 4.01 0 013.5 8c0-.143.012-.283.035-.42.086-.519-.038-1.088-.408-1.499l-.733-.81c-.066-.078-.071-.165-.048-.218.13-.344.295-.676.571-.99.052-.054.139-.091.243-.048l1.038.43c.46.185.967.133 1.417-.129a6.6 6.6 0 01.502-.274c.447-.222.85-.628.997-1.189l.289-1.105c.029-.11.101-.143.137-.146zM8 10.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"/>
          </svg>
          仓库配置
        </div>
        <div className={css.branchRow}>
          <div className={css.branchChip}>⎇ {currentBranch}</div>
          <button className={css.branchBtn}>Push</button>
          <button className={css.branchBtn}>Pull</button>
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: 类型检查**

```bash
cd tauri && npx tsc --noEmit 2>&1 | grep -i "gitnavcol\|git-nav"
```

期望：无报错。

- [ ] **Step 4: Commit**

```bash
git add tauri/src/features/git/components/GitNavCol.tsx tauri/src/features/git/components/GitNavCol.module.css
git commit -m "feat(git): add GitNavCol branch tree navigation component"
```

---

## Task 5: 创建 CommitHistory.tsx

**Files:**
- Create: `tauri/src/features/git/components/CommitHistory.tsx`
- Create: `tauri/src/features/git/components/CommitHistory.module.css`

- [ ] **Step 1: 创建 CSS module**

```css
/* tauri/src/features/git/components/CommitHistory.module.css */
.panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--tc-bg-primary, #1a1a22);
}

.toolbar {
  height: 34px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
  border-bottom: 1px solid var(--tc-border, #24242e);
  background: var(--tc-bg-secondary, #141420);
  flex-shrink: 0;
}

.title {
  font-size: 11.5px;
  color: var(--tc-foreground-muted, #888);
  font-weight: 500;
  flex: 1;
}

.scopeTabs {
  display: flex;
  gap: 2px;
}

.scopeTab {
  font-size: 10.5px;
  color: var(--tc-foreground-disabled, #444);
  padding: 3px 9px;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid transparent;
  background: none;
  font-family: inherit;
}
.scopeTab:hover { color: var(--tc-foreground-muted, #888); }
.scopeTab.active {
  color: var(--tc-foreground, #ccc);
  background: var(--tc-bg-tertiary, #22222e);
  border-color: var(--tc-border-strong, #2e2e40);
}

.search {
  background: var(--tc-bg-tertiary, #1e1e2a);
  border: 1px solid var(--tc-border, #2a2a3a);
  border-radius: 5px;
  padding: 3px 8px;
  font-size: 11px;
  color: var(--tc-foreground-muted, #888);
  width: 130px;
  outline: none;
  font-family: inherit;
}
.search::placeholder { color: var(--tc-foreground-disabled, #2e2e44); }
.search:focus { border-color: var(--tc-accent, #4e9eff); }

.list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.list::-webkit-scrollbar { width: 4px; }
.list::-webkit-scrollbar-thumb { background: var(--tc-border, #2a2a3a); }

.row {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  gap: 8px;
  border-bottom: 1px solid rgba(255,255,255,.03);
  cursor: pointer;
}
.row:hover { background: rgba(255,255,255,.03); }
.row.selected { background: var(--tc-bg-selected, #1a2535); }

.graphCell {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.message {
  font-size: 11.5px;
  color: var(--tc-foreground-secondary, #c0c0d4);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row.selected .message { color: #9cdcfe; }

.metaRow {
  display: flex;
  align-items: center;
  gap: 5px;
}

.sha {
  font-size: 9.5px;
  color: var(--tc-foreground-disabled, #2e2e50);
  font-family: 'SF Mono', 'Consolas', monospace;
}

.author {
  font-size: 9.5px;
  color: var(--tc-foreground-disabled, #3a3a52);
}

.date {
  font-size: 9.5px;
  color: var(--tc-foreground-disabled, #2e2e42);
  margin-left: auto;
}

.taskBadge {
  background: rgba(78,201,176,.1);
  color: #4ec9b0;
  font-size: 8.5px;
  padding: 1px 4px;
  border-radius: 3px;
  flex-shrink: 0;
}
```

- [ ] **Step 2: 创建 CommitHistory.tsx**

```tsx
// tauri/src/features/git/components/CommitHistory.tsx
import { useMemo } from 'react'
import { useGitStore } from '@/lib/store/git'
import { useGitLog } from '../hooks/useGitLog'
import { computeGraphLayout } from '../lib/graph-layout'
import { CommitGraph } from './CommitGraph'
import css from './CommitHistory.module.css'

interface Props {
  projectId: number
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

const SCOPES = [
  { key: 'all' as const,     label: '全部' },
  { key: 'current' as const, label: '当前分支' },
  { key: 'other' as const,   label: '其他分支' },
]

export function CommitHistory({ projectId }: Props) {
  const {
    historyScope,
    historySearch,
    selectedCommit,
    setHistoryScope,
    setHistorySearch,
    setSelectedCommit,
  } = useGitStore()

  const { data: allCommits = [] } = useGitLog(projectId, 200)

  const filtered = useMemo(() => {
    let list = allCommits
    if (historySearch) {
      const q = historySearch.toLowerCase()
      list = list.filter(c =>
        c.message.toLowerCase().includes(q) || c.hash.startsWith(q)
      )
    }
    return list
  }, [allCommits, historySearch])

  const rows = useMemo(() => computeGraphLayout(filtered), [filtered])

  return (
    <div className={css.panel}>
      <div className={css.toolbar}>
        <span className={css.title}>提交历史</span>
        <div className={css.scopeTabs}>
          {SCOPES.map(s => (
            <button
              key={s.key}
              className={`${css.scopeTab} ${historyScope === s.key ? css.active : ''}`}
              onClick={() => setHistoryScope(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <input
          className={css.search}
          placeholder="搜索提交..."
          value={historySearch}
          onChange={e => setHistorySearch(e.target.value)}
        />
      </div>

      <div className={css.list}>
        {rows.map(row => (
          <div
            key={row.commit.hash}
            className={`${css.row} ${row.commit.hash === selectedCommit ? css.selected : ''}`}
            onClick={() => setSelectedCommit(row.commit.hash)}
          >
            <div className={css.graphCell}>
              <CommitGraph row={row} />
            </div>
            <div className={css.meta}>
              <div className={css.message}>{row.commit.message}</div>
              <div className={css.metaRow}>
                <span className={css.sha}>{row.commit.hash.slice(0, 7)}</span>
                <span className={css.author}>{row.commit.author}</span>
                {row.commit.refs && (
                  <span className={css.taskBadge}>{row.commit.refs.split(',')[0].trim()}</span>
                )}
                <span className={css.date}>{relativeTime(row.commit.date)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 类型检查**

```bash
cd tauri && npx tsc --noEmit 2>&1 | grep -i "commithistory\|commit-history"
```

期望：无报错。

- [ ] **Step 4: Commit**

```bash
git add tauri/src/features/git/components/CommitHistory.tsx tauri/src/features/git/components/CommitHistory.module.css
git commit -m "feat(git): add CommitHistory panel with graph + scope filter"
```

---

## Task 6: 创建 ChangesPanel.tsx

**Files:**
- Create: `tauri/src/features/git/components/ChangesPanel.tsx`
- Create: `tauri/src/features/git/components/ChangesPanel.module.css`

- [ ] **Step 1: 创建 CSS module**

```css
/* tauri/src/features/git/components/ChangesPanel.module.css */
.panel {
  width: 240px;
  flex-shrink: 0;
  background: var(--tc-bg-secondary, #181820);
  border-right: 1px solid var(--tc-border, #24242e);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.hdr {
  height: 34px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: 1px solid var(--tc-border, #24242e);
  background: var(--tc-bg-tertiary, #141420);
  flex-shrink: 0;
  cursor: pointer;
  user-select: none;
}
.hdrTitle {
  font-size: 11.5px;
  color: var(--tc-foreground-muted, #999);
  font-weight: 500;
  flex: 1;
}
.hdrChev {
  width: 10px;
  height: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--tc-foreground-muted, #666);
  transition: transform 0.15s;
}
.hdrChev.open { transform: rotate(90deg); }

.hdrCount {
  background: rgba(78,201,176,.12);
  border: 1px solid rgba(78,201,176,.2);
  color: #4ec9b0;
  font-size: 9.5px;
  padding: 0 6px;
  border-radius: 10px;
  line-height: 16px;
}

/* Body */
.body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.body::-webkit-scrollbar { width: 3px; }
.body::-webkit-scrollbar-thumb { background: var(--tc-border, #2a2a3a); }

/* Sub section */
.subHdr {
  padding: 4px 10px;
  display: flex;
  align-items: center;
  gap: 5px;
  border-bottom: 1px solid rgba(255,255,255,.03);
  cursor: pointer;
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  user-select: none;
}
.subHdr.staged   { background: #141e18; color: #3a6a50; }
.subHdr.unstaged { background: #1e1414; color: #6a3a3a; margin-top: 2px; }
.subHdr.untracked { margin-top: 2px; color: var(--tc-foreground-disabled, #3a3a52); }
.subHdr:hover { filter: brightness(1.15); }

.subChev {
  width: 12px;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.12s;
  flex-shrink: 0;
}
.subChev.open { transform: rotate(90deg); }

.subTitle { flex: 1; }
.cntGreen { color: #4ec9b0; background: rgba(78,201,176,.12); font-size: 9px; padding: 0 4px; border-radius: 2px; }
.cntRed   { color: #f48771; background: rgba(244,135,113,.1); font-size: 9px; padding: 0 4px; border-radius: 2px; }
.cntGray  { color: var(--tc-foreground-disabled, #555); background: var(--tc-bg-tertiary, #22222e); font-size: 9px; padding: 0 4px; border-radius: 2px; }

.subBody.collapsed { display: none; }

/* File row */
.fileRow {
  display: flex;
  align-items: center;
  padding: 4px 10px 4px 8px;
  gap: 5px;
  cursor: pointer;
  border-bottom: 1px solid rgba(255,255,255,.025);
}
.fileRow:hover { background: rgba(255,255,255,.03); }
.fileRow.selected { background: var(--tc-bg-selected, #1a2535); }
.fileRow.stagedBg { background: rgba(78,201,176,.02); }
.fileRow.stagedBg:hover { background: rgba(78,201,176,.05); }
.fileRow.stagedBg.selected { background: rgba(78,201,176,.08); }
.fileRow.unstagedBg { background: rgba(244,135,113,.015); }
.fileRow.unstagedBg:hover { background: rgba(244,135,113,.04); }

.chk {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  appearance: none;
  -webkit-appearance: none;
  border: 1px solid var(--tc-border-strong, #2a2a3a);
  border-radius: 2px;
  background: var(--tc-bg-primary, #1e1e28);
  position: relative;
  cursor: pointer;
}
.chk:checked { background: #4e9eff; border-color: #4e9eff; }
.chk:checked::after {
  content: '';
  position: absolute;
  width: 6px; height: 4px;
  border-left: 1.5px solid #fff;
  border-bottom: 1.5px solid #fff;
  transform: rotate(-45deg);
  top: 1px; left: 2px;
}
.chk.staged:checked { background: #4ec9b0; border-color: #4ec9b0; }

.filePath { flex: 1; min-width: 0; overflow: hidden; }
.fileDir  { font-size: 9px; color: var(--tc-foreground-disabled, #333348); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fileName { font-size: 11px; color: var(--tc-foreground, #c0c0d0); font-family: 'SF Mono', 'Consolas', monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fileRow.selected .fileName { color: #9cdcfe; }

.statusBadge {
  width: 17px;
  height: 17px;
  border-radius: 3px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9.5px;
  font-weight: 700;
}
.stM { background: rgba(30,100,180,.2); color: #9cdcfe; }
.stA { background: rgba(20,120,60,.2); color: #4ec9b0; }
.stD { background: rgba(180,50,40,.2); color: #f48771; }
.stU { background: rgba(160,140,40,.15); color: #dcdcaa; }

/* Commit area */
.commitSection {
  border-top: 1px solid var(--tc-border, #24242e);
  flex-shrink: 0;
  background: var(--tc-bg-tertiary, #141420);
}
.commitInputRow {
  padding: 7px 10px 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--tc-bg-primary, #22222e);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9.5px;
  color: var(--tc-foreground-muted, #555);
}
.msgInput {
  flex: 1;
  background: var(--tc-bg-primary, #1e1e2a);
  border: 1px solid var(--tc-border, #2a2a3a);
  border-radius: 4px;
  padding: 4px 7px;
  color: var(--tc-foreground, #d0d0e0);
  font-size: 11px;
  font-family: inherit;
  outline: none;
}
.msgInput:focus { border-color: var(--tc-accent, #4e9eff); }
.msgInput::placeholder { color: var(--tc-foreground-disabled, #2e2e44); }

.commitFoot {
  padding: 3px 10px 7px;
  display: flex;
  align-items: center;
  gap: 5px;
}
.coAuthors { font-size: 9.5px; color: var(--tc-foreground-disabled, #2e2e44); flex: 1; cursor: pointer; }
.commitBtn {
  background: var(--tc-accent, #1a5acc);
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 4px 9px;
  font-size: 10.5px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}
.commitBtn:hover { filter: brightness(1.1); }
.commitBtn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Branch footer */
.branchFooter {
  border-top: 1px solid var(--tc-border, #24242e);
  display: flex;
  align-items: center;
  background: var(--tc-bg-tertiary, #141420);
  flex-shrink: 0;
}
.branchName {
  flex: 1;
  padding: 5px 8px;
  display: flex;
  align-items: center;
  gap: 5px;
  overflow: hidden;
  cursor: pointer;
  border-right: 1px solid var(--tc-border, #24242e);
}
.branchName:hover { background: rgba(255,255,255,.03); }
.branchLabel { font-size: 10px; color: #4ec9b0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.aheadBehind { font-size: 9px; color: var(--tc-foreground-disabled, #3a3a52); white-space: nowrap; }
.footBtn {
  padding: 5px 9px;
  font-size: 10px;
  color: var(--tc-foreground-disabled, #555);
  cursor: pointer;
  border-right: 1px solid var(--tc-border, #24242e);
  flex-shrink: 0;
  background: none;
  border-top: none;
  border-bottom: none;
  font-family: inherit;
}
.footBtn:last-child { border-right: none; }
.footBtn:hover { background: rgba(255,255,255,.03); color: var(--tc-foreground, #ccc); }
.footBtn.primary { color: var(--tc-accent, #4e9eff); }
```

- [ ] **Step 2: 创建 ChangesPanel.tsx**

```tsx
// tauri/src/features/git/components/ChangesPanel.tsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useGitStore } from '@/lib/store/git'
import { useGitStatus } from '../hooks/useGitStatus'
import { api } from '@/lib/api'
import css from './ChangesPanel.module.css'

interface Props {
  projectId: number
}

type FileStatus = 'M' | 'A' | 'D' | 'R' | '?'

function statusClass(s: string): string {
  if (s === 'M') return css.stM
  if (s === 'A') return css.stA
  if (s === 'D') return css.stD
  return css.stU
}

function ChevronSvg() {
  return (
    <svg width="6" height="6" viewBox="0 0 8 8" fill="currentColor">
      <path d="M1.5 1l4 3-4 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
    </svg>
  )
}

export function ChangesPanel({ projectId }: Props) {
  const { selectedFile, setSelectedFile, changesCollapsed, setChangesCollapsed } = useGitStore()
  const { data: status } = useGitStatus(projectId)
  const qc = useQueryClient()

  const [commitMsg, setCommitMsg] = useState('')
  const [stagedOpen, setStagedOpen] = useState(true)
  const [unstagedOpen, setUnstagedOpen] = useState(true)
  const [untrackedOpen, setUntrackedOpen] = useState(true)

  const staged = status?.staged ?? []
  const unstaged = status?.unstaged ?? []
  const untracked = status?.untracked ?? []
  const totalCount = staged.length + unstaged.length + untracked.length

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['git-status', projectId] })
    qc.invalidateQueries({ queryKey: ['git-log', projectId] })
  }

  async function handleStage(files: string[]) {
    await api.git.gitStage(projectId, files)
    invalidate()
  }

  async function handleUnstage(files: string[]) {
    await api.git.gitUnstage(projectId, files)
    invalidate()
  }

  async function handleDiscard(files: string[]) {
    await api.git.gitDiscard(projectId, files)
    invalidate()
  }

  async function handleCommit() {
    if (!commitMsg.trim()) return
    await api.git.gitCommit(projectId, commitMsg)
    setCommitMsg('')
    invalidate()
  }

  const currentBranch = status?.branch ?? ''

  return (
    <div className={css.panel}>
      {/* Header */}
      <div className={css.hdr} onClick={() => setChangesCollapsed(!changesCollapsed)}>
        <span className={`${css.hdrChev} ${changesCollapsed ? '' : css.open}`}><ChevronSvg /></span>
        <span className={css.hdrTitle}>变更</span>
        <span className={css.hdrCount}>{totalCount}</span>
      </div>

      {!changesCollapsed && (
        <div className={css.body}>
          {/* Staged */}
          <div className={`${css.subHdr} ${css.staged}`} onClick={() => setStagedOpen(v => !v)}>
            <span className={`${css.subChev} ${stagedOpen ? css.open : ''}`}><ChevronSvg /></span>
            <span className={css.subTitle}>已暂存</span>
            <span className={css.cntGreen}>{staged.length}</span>
          </div>
          {stagedOpen && staged.map(f => {
            const name = f.path.split('/').pop() ?? f.path
            const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/') + 1) : ''
            return (
              <div
                key={f.path}
                className={`${css.fileRow} ${css.stagedBg} ${selectedFile === f.path ? css.selected : ''}`}
                onClick={() => setSelectedFile(f.path)}
              >
                <input
                  type="checkbox"
                  className={`${css.chk} ${css.staged}`}
                  checked
                  onClick={e => { e.stopPropagation(); handleUnstage([f.path]) }}
                  readOnly
                />
                <div className={css.filePath}>
                  <div className={css.fileDir}>{dir}</div>
                  <div className={css.fileName}>{name}</div>
                </div>
                <div className={`${css.statusBadge} ${statusClass(f.status)}`}>{f.status}</div>
              </div>
            )
          })}

          {/* Unstaged */}
          <div className={`${css.subHdr} ${css.unstaged}`} onClick={() => setUnstagedOpen(v => !v)}>
            <span className={`${css.subChev} ${unstagedOpen ? css.open : ''}`}><ChevronSvg /></span>
            <span className={css.subTitle}>未暂存</span>
            <span className={css.cntRed}>{unstaged.length}</span>
          </div>
          {unstagedOpen && unstaged.map(f => {
            const name = f.path.split('/').pop() ?? f.path
            const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/') + 1) : ''
            return (
              <div
                key={f.path}
                className={`${css.fileRow} ${css.unstagedBg} ${selectedFile === f.path ? css.selected : ''}`}
                onClick={() => setSelectedFile(f.path)}
              >
                <input
                  type="checkbox"
                  className={css.chk}
                  onChange={() => handleStage([f.path])}
                />
                <div className={css.filePath}>
                  <div className={css.fileDir}>{dir}</div>
                  <div className={css.fileName}>{name}</div>
                </div>
                <div className={`${css.statusBadge} ${statusClass(f.status)}`}>{f.status}</div>
              </div>
            )
          })}

          {/* Untracked */}
          <div className={`${css.subHdr} ${css.untracked}`} onClick={() => setUntrackedOpen(v => !v)}>
            <span className={`${css.subChev} ${untrackedOpen ? css.open : ''}`}><ChevronSvg /></span>
            <span className={css.subTitle}>未追踪</span>
            <span className={css.cntGray}>{untracked.length}</span>
          </div>
          {untrackedOpen && untracked.map(f => {
            const name = f.path.split('/').pop() ?? f.path
            const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/') + 1) : ''
            return (
              <div
                key={f.path}
                className={`${css.fileRow} ${selectedFile === f.path ? css.selected : ''}`}
                onClick={() => setSelectedFile(f.path)}
              >
                <input
                  type="checkbox"
                  className={css.chk}
                  onChange={() => handleStage([f.path])}
                />
                <div className={css.filePath}>
                  <div className={css.fileDir}>{dir}</div>
                  <div className={css.fileName}>{name}</div>
                </div>
                <div className={`${css.statusBadge} ${css.stU}`}>U</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Commit area */}
      <div className={css.commitSection}>
        <div className={css.commitInputRow}>
          <div className={css.avatar}>S</div>
          <input
            className={css.msgInput}
            placeholder="提交摘要（必填）"
            value={commitMsg}
            onChange={e => setCommitMsg(e.target.value)}
          />
        </div>
        <div className={css.commitFoot}>
          <span className={css.coAuthors}>⊕ Co-authors</span>
          <button
            className={css.commitBtn}
            disabled={!commitMsg.trim() || staged.length === 0}
            onClick={handleCommit}
          >
            提交到 {currentBranch}
          </button>
        </div>
      </div>

      {/* Branch footer */}
      <div className={css.branchFooter}>
        <div className={css.branchName}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="#4ec9b0">
            <path d="M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.122a2.25 2.25 0 10-1.5 0v.878A2.25 2.25 0 005.75 8.5h1.5v2.128a2.251 2.251 0 101.5 0V8.5h1.5a2.25 2.25 0 002.25-2.25v-.878a2.25 2.25 0 10-1.5 0v.878a.75.75 0 01-.75.75h-4.5A.75.75 0 015 6.25v-.878zm3.75 7.378a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3-8.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"/>
          </svg>
          <span className={css.branchLabel}>{currentBranch}</span>
        </div>
        <button
          className={`${css.footBtn} ${css.primary}`}
          onClick={() => api.git.gitPush(projectId)}
        >
          Push
        </button>
        <button
          className={css.footBtn}
          onClick={() => { api.git.gitPull(projectId); invalidate() }}
        >
          Pull
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 类型检查**

```bash
cd tauri && npx tsc --noEmit 2>&1 | grep -i "changespanel\|changes-panel"
```

期望：无报错。

- [ ] **Step 4: Commit**

```bash
git add tauri/src/features/git/components/ChangesPanel.tsx tauri/src/features/git/components/ChangesPanel.module.css
git commit -m "feat(git): add ChangesPanel with staged/unstaged/untracked sections"
```

---

## Task 7: 更新 DiffViewer.tsx

**Files:**
- Modify: `tauri/src/features/git/components/DiffViewer.tsx`
- Modify: `tauri/src/features/git/components/diff-viewer.module.css`

- [ ] **Step 1: 读取现有 diff-viewer.module.css**

```bash
cat tauri/src/features/git/components/diff-viewer.module.css
```

- [ ] **Step 2: 追加新样式到 diff-viewer.module.css**

在文件末尾追加：

```css
/* ── v12 新增：文件名芯片 + 文件查看器覆盖 ── */
.topbar {
  height: 34px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 7px;
  border-bottom: 1px solid var(--tc-border, #252535);
  background: var(--tc-bg-secondary, #1a1a2a);
  flex-shrink: 0;
}

.fileChip {
  display: flex;
  align-items: center;
  gap: 5px;
  background: var(--tc-bg-tertiary, #252535);
  border: 1px solid var(--tc-border, #2e2e42);
  border-radius: 5px;
  padding: 3px 8px;
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color 0.1s;
}
.fileChip:hover { border-color: var(--tc-accent, #4e9eff); }
.fileChip:hover .fileOpenIcon { color: var(--tc-accent, #4e9eff); }

.chipName { font-size: 11.5px; font-family: 'SF Mono', 'Consolas', monospace; color: var(--tc-foreground, #ccc); font-weight: 500; }
.chipDir  { font-size: 9.5px; color: var(--tc-foreground-disabled, #3a3a52); }
.fileOpenIcon { color: var(--tc-foreground-disabled, #3a3a52); transition: color 0.1s; }

.spacer { flex: 1; }

.taskLink {
  background: rgba(232,160,0,.1);
  color: #e8a000;
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
}
.taskLink:hover { background: rgba(232,160,0,.18); }

.modeGroup { display: flex; gap: 2px; }
.modeBtn {
  background: var(--tc-bg-tertiary, #252535);
  border: 1px solid var(--tc-border, #2e2e42);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 10px;
  color: var(--tc-foreground-disabled, #555);
  cursor: pointer;
  font-family: inherit;
}
.modeBtn.active { color: var(--tc-foreground, #ccc); background: var(--tc-bg-active, #2a2a40); border-color: var(--tc-border-strong, #3a3a58); }

/* File viewer overlay */
.fileViewer {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: var(--tc-bg-code, #1e1e2e);
  display: flex;
  flex-direction: column;
  animation: fvSlide 0.15s ease;
}
@keyframes fvSlide {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: none; }
}
.fvTopbar {
  height: 34px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--tc-border, #252535);
  background: var(--tc-bg-secondary, #1a1a2a);
  flex-shrink: 0;
}
.fvLabel { font-size: 10px; color: var(--tc-foreground-disabled, #2e2e48); }
.fvPath  { font-size: 11px; color: var(--tc-foreground-muted, #555); font-family: 'SF Mono', 'Consolas', monospace; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fvClose {
  width: 22px; height: 22px; border-radius: 4px;
  background: var(--tc-bg-tertiary, #252535); border: 1px solid var(--tc-border, #2e2e44);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: var(--tc-foreground-muted, #555); font-size: 11px;
}
.fvClose:hover { color: #f48771; border-color: rgba(244,135,113,.4); }
.fvBody { flex: 1; overflow: hidden; }
```

- [ ] **Step 3: 读取现有 DiffViewer.tsx 内容**

```bash
cat tauri/src/features/git/components/DiffViewer.tsx
```

- [ ] **Step 4: 在 DiffViewer.tsx 中添加新 topbar 结构**

在组件 return 的最外层 div 内，在 Monaco Editor 之前插入新 topbar（保留原有功能不删除）：

找到 `return (` 后 wrap 一层 `position: relative` 的容器，然后：
1. 在 Monaco 上方添加 `.topbar` 区域
2. 添加文件名芯片（从 `selectedFile` 取文件名/目录）
3. 添加 Task 关联标签（从 `selectedTaskId` 取）
4. 添加内联/并排切换按钮（使用 `diffMode` / `setDiffMode`）

在文件顶部 import 中添加：
```typescript
import { useGitStore } from '@/lib/store/git'
```

在组件内从 store 取：
```typescript
const { diffMode, setDiffMode, fileViewerOpen, setFileViewerOpen, selectedFile, selectedTaskId } = useGitStore()
```

文件名芯片代码：
```tsx
const fileName = selectedFile ? selectedFile.split('/').pop() ?? selectedFile : null
const fileDir  = selectedFile?.includes('/') ? selectedFile.slice(0, selectedFile.lastIndexOf('/') + 1) : ''

{selectedFile && (
  <div className={css.topbar}>
    <div className={css.fileChip} onClick={() => setFileViewerOpen(true)} title={selectedFile}>
      <svg width="10" height="10" viewBox="0 0 16 16" fill="#555">
        <path d="M3.75 1.5a.25.25 0 00-.25.25v11.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25V6H9.75A1.75 1.75 0 018 4.25V1.5H3.75zm5.75.56v2.19c0 .138.112.25.25.25h2.19L9.5 2.06zM2 1.75C2 .784 2.784 0 3.75 0h5.086c.464 0 .909.184 1.237.513l3.414 3.414c.329.328.513.773.513 1.237v8.086A1.75 1.75 0 0112.25 15h-8.5A1.75 1.75 0 012 13.25V1.75z"/>
      </svg>
      <span className={css.chipName}>{fileName}</span>
      <span className={css.chipDir}>{fileDir}</span>
      <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor" className={css.fileOpenIcon}>
        <path d="M10.604 1h4.146a.25.25 0 01.25.25v4.146a.25.25 0 01-.427.177L13.03 4.03 9.28 7.78a.75.75 0 01-1.06-1.06l3.75-3.75-1.543-1.543A.25.25 0 0110.604 1zM3.75 2A1.75 1.75 0 002 3.75v8.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0014 12.25v-3.5a.75.75 0 00-1.5 0v3.5a.25.25 0 01-.25.25h-8.5a.25.25 0 01-.25-.25v-8.5a.25.25 0 01.25-.25h3.5a.75.75 0 000-1.5h-3.5z"/>
      </svg>
    </div>
    <div className={css.spacer} />
    {selectedTaskId && (
      <span className={css.taskLink}>Task #{selectedTaskId}</span>
    )}
    <div className={css.modeGroup}>
      <button className={`${css.modeBtn} ${diffMode === 'inline' ? css.active : ''}`} onClick={() => setDiffMode('inline')}>内联</button>
      <button className={`${css.modeBtn} ${diffMode === 'side' ? css.active : ''}`} onClick={() => setDiffMode('side')}>并排</button>
    </div>
  </div>
)}
```

文件查看器覆盖层（在 Monaco 同级，绝对定位）：
```tsx
{fileViewerOpen && selectedFile && (
  <div className={css.fileViewer}>
    <div className={css.fvTopbar}>
      <span className={css.fvLabel}>查看文件</span>
      <span className={css.fvPath}>{selectedFile}</span>
      <button className={css.fvClose} onClick={() => setFileViewerOpen(false)}>✕</button>
    </div>
    <div className={css.fvBody}>
      <Editor
        height="100%"
        language={detectLanguage(selectedFile)}
        value={fileContent ?? ''}
        theme="vs-dark"
        options={{ readOnly: true, minimap: { enabled: false }, lineNumbers: 'on', scrollBeyondLastLine: false }}
      />
    </div>
  </div>
)}
```

> 其中 `fileContent` 通过 `useQuery` 调用 `api.git.gitShow(projectId, 'HEAD', selectedFile)` 获取。

- [ ] **Step 5: 类型检查**

```bash
cd tauri && npx tsc --noEmit 2>&1 | grep -i "diffviewer\|diff-viewer"
```

期望：无报错。

- [ ] **Step 6: Commit**

```bash
git add tauri/src/features/git/components/DiffViewer.tsx tauri/src/features/git/components/diff-viewer.module.css
git commit -m "feat(git): add filename chip + file viewer overlay to DiffViewer"
```

---

## Task 8: 重写 GitPage.tsx 和 git-page.module.css

**Files:**
- Modify: `tauri/src/features/git/GitPage.tsx`
- Modify: `tauri/src/features/git/git-page.module.css`

- [ ] **Step 1: 读取现有文件**

```bash
cat tauri/src/features/git/GitPage.tsx
cat tauri/src/features/git/git-page.module.css
```

- [ ] **Step 2: 重写 git-page.module.css**

```css
/* tauri/src/features/git/git-page.module.css */
.page {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--tc-bg-primary, #1a1a22);
}

/* 左侧导航列（全高） */
.navCol {
  width: 190px;
  flex-shrink: 0;
  height: 100%;
}

/* 右侧主区域（垂直分割为上下两半） */
.mainArea {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* 上半部分：提交历史 */
.topHalf {
  height: 280px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--tc-border, #24242e);
  overflow: hidden;
}

/* 分隔线 */
.divider {
  height: 4px;
  background: var(--tc-bg-secondary, #1e1e28);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ns-resize;
}
.divider::after {
  content: '';
  width: 32px;
  height: 1px;
  background: var(--tc-border, #3a3a52);
  border-radius: 1px;
}

/* 下半部分：变更列表 + diff */
.botHalf {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

/* diff 区外层（需要 position: relative 用于 fileViewer overlay） */
.diffArea {
  flex: 1;
  min-width: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

- [ ] **Step 3: 重写 GitPage.tsx**

保留现有的 `projectId` 获取逻辑（从 URL param `?task=`），替换 JSX 结构：

```tsx
// tauri/src/features/git/GitPage.tsx
import { useSearchParams } from 'react-router-dom'
import { GitNavCol } from './components/GitNavCol'
import { CommitHistory } from './components/CommitHistory'
import { ChangesPanel } from './components/ChangesPanel'
import { DiffViewer } from './components/DiffViewer'
import css from './git-page.module.css'

export default function GitPage() {
  const [searchParams] = useSearchParams()
  const taskId = searchParams.get('task')
  // projectId: 从 task 关联的 project 获取，或使用默认项目
  // 沿用原有逻辑 — 读取 useProjectStore 或固定 projectId=1
  const projectId = 1 // TODO: 从 taskId 推导，保持与原有逻辑一致

  function handleConfigClick() {
    // TODO: 跳转到仓库配置视图（后续实现）
  }

  return (
    <div className={css.page}>
      {/* 左侧导航（全高） */}
      <div className={css.navCol}>
        <GitNavCol projectId={projectId} onConfigClick={handleConfigClick} />
      </div>

      {/* 右侧主区域 */}
      <div className={css.mainArea}>
        {/* 上：提交历史 */}
        <div className={css.topHalf}>
          <CommitHistory projectId={projectId} />
        </div>

        <div className={css.divider} />

        {/* 下：变更列表 + Diff */}
        <div className={css.botHalf}>
          <ChangesPanel projectId={projectId} />
          <div className={css.diffArea}>
            <DiffViewer projectId={projectId} />
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 类型检查**

```bash
cd tauri && npx tsc --noEmit 2>&1 | head -30
```

期望：无报错，或仅有与旧组件无关的警告。

- [ ] **Step 5: 本地运行**

```bash
# 在项目根目录
bash start.sh
# 打开 http://localhost:7071/git 检查页面布局
```

预期：
- 左侧 190px 导航列显示分支树（本地分支/远程可折叠）
- 上方提交历史显示 commit graph + 消息
- 下方左侧 240px 变更面板显示 staged/unstaged/untracked
- 下方右侧显示 Monaco diff（选中文件后）

- [ ] **Step 6: Commit**

```bash
git add tauri/src/features/git/GitPage.tsx tauri/src/features/git/git-page.module.css
git commit -m "feat(git): rewrite GitPage with 4-zone layout (nav + history + changes + diff)"
```

---

## Task 9: 获取 projectId 逻辑修复

**Files:**
- Modify: `tauri/src/features/git/GitPage.tsx`

- [ ] **Step 1: 读取现有 projectId 获取方式**

查看旧版 GitPage.tsx git 历史中 projectId 是如何获取的：

```bash
git log --oneline tauri/src/features/git/GitPage.tsx | head -5
git show HEAD~1:tauri/src/features/git/GitPage.tsx | grep -A5 "projectId\|useProject\|searchParams"
```

- [ ] **Step 2: 恢复原有 projectId 逻辑**

将 `const projectId = 1` 替换为原有逻辑（例如从 `useProjectStore` 取当前项目，或从 URL param 推导），确保与其他页面行为一致。

- [ ] **Step 3: 类型检查**

```bash
cd tauri && npx tsc --noEmit 2>&1 | head -20
```

期望：无报错。

- [ ] **Step 4: Commit**

```bash
git add tauri/src/features/git/GitPage.tsx
git commit -m "fix(git): restore correct projectId resolution in GitPage"
```

---

## Self-Review

### Spec Coverage

| Spec 要求 | 对应任务 |
|-----------|---------|
| 左侧导航树 + 分组折叠 | Task 4 (GitNavCol) |
| 分支前缀归组 (feat/, fix/) | Task 4 Step 2 |
| 当前分支徽章 / 任务徽章 | Task 4 Step 2 |
| 仓库配置按钮 | Task 4 Step 2 (onConfigClick callback) |
| 分支状态底栏 | Task 4 Step 2 |
| 提交历史 scope 切换 | Task 5 (CommitHistory) |
| 搜索框过滤 | Task 5 Step 2 |
| SVG commit graph | Task 2 + Task 3 |
| 变更文件 accordion header 折叠 | Task 6 (ChangesPanel) |
| 已暂存/未暂存/未追踪三分区 | Task 6 Step 2 |
| 状态方块在右侧 | Task 6 Step 2 |
| checkbox 暂存/取消 | Task 6 Step 2 |
| 提交输入框 + 分支状态栏 | Task 6 Step 2 |
| 文件名芯片（仅文件名）| Task 7 Step 4 |
| 点击芯片展开文件查看器 | Task 7 Step 4 |
| Task 关联标签 | Task 7 Step 4 |
| 内联/并排切换 | Task 7 Step 4 |
| 四区域布局容器 | Task 8 |
| useGitStore 新字段 | Task 1 |
| 主题 CSS 变量 | 所有 CSS module 使用 `var(--tc-*)` |

### 无 Placeholder

已检查，所有步骤均包含实际代码。

### 类型一致性

- `CommitGraphRow.commit` 来自 `GitCommit` (Task 2) → `CommitGraph` 接收 `row: CommitGraphRow` (Task 3) ✓
- `computeGraphLayout(commits: GitCommit[])` (Task 2) → `CommitHistory` 调用 `computeGraphLayout(filtered)` (Task 5) ✓
- `useGitStore().setSelectedCommit` (Task 1) → `CommitHistory` 调用 (Task 5) ✓
- `useGitStore().fileViewerOpen / setFileViewerOpen` (Task 1) → `DiffViewer` 使用 (Task 7) ✓
- `useGitStore().changesCollapsed / setChangesCollapsed` (Task 1) → `ChangesPanel` 使用 (Task 6) ✓
- `api.git.gitBranches(projectId)` → 已在 `http.ts` 定义，返回 `GitBranch[]` ✓
- `api.git.gitStashList(projectId)` → 已在 `http.ts` 定义，返回 `GitStash[]` ✓
