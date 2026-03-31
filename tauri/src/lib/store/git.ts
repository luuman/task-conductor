import { create } from 'zustand'

interface GitState {
  activeTab: 'changes' | 'branches' | 'log'
  selectedTaskId: number | null
  virtualBranch: string | null
  diffMode: 'side' | 'inline' | 'file'
  selectedFile: string | null

  // 导航分组折叠状态（key = 分组名）
  navSections: Record<string, boolean> // true = 展开

  // 提交历史
  selectedCommit: string | null // 选中的 commit hash
  historyScope: 'all' | 'current' | 'other'
  historySearch: string

  // Diff 区
  fileViewerOpen: boolean

  // 变更面板
  changesCollapsed: boolean

  setActiveTab: (tab: GitState['activeTab']) => void
  setSelectedTask: (taskId: number | null, branch: string | null) => void
  setVirtualBranch: (branch: string | null) => void
  setDiffMode: (mode: GitState['diffMode']) => void
  setSelectedFile: (file: string | null) => void

  setNavSection: (key: string, open: boolean) => void
  setSelectedCommit: (hash: string | null) => void
  setHistoryScope: (scope: 'all' | 'current' | 'other') => void
  setHistorySearch: (q: string) => void
  setFileViewerOpen: (open: boolean) => void
  setChangesCollapsed: (collapsed: boolean) => void
}

export const useGitStore = create<GitState>()((set) => ({
  activeTab: 'branches',
  selectedTaskId: null,
  virtualBranch: null,
  diffMode: 'side',
  selectedFile: null,

  navSections: { local: true, remote: true, tags: false, stash: true, submodules: false, subtrees: false },
  selectedCommit: null,
  historyScope: 'all',
  historySearch: '',
  fileViewerOpen: false,
  changesCollapsed: false,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedTask: (taskId, branch) =>
    set({ selectedTaskId: taskId, virtualBranch: branch, selectedFile: null }),
  setVirtualBranch: (branch) => set({ virtualBranch: branch, selectedFile: null }),
  setDiffMode: (mode) => set({ diffMode: mode }),
  setSelectedFile: (file) => set({ selectedFile: file }),

  setNavSection: (key, open) => set(s => ({ navSections: { ...s.navSections, [key]: open } })),
  setSelectedCommit: (hash) => set({ selectedCommit: hash, selectedFile: null }),
  setHistoryScope: (scope) => set({ historyScope: scope }),
  setHistorySearch: (q) => set({ historySearch: q }),
  setFileViewerOpen: (open) => set({ fileViewerOpen: open }),
  setChangesCollapsed: (collapsed) => set({ changesCollapsed: collapsed }),
}))
