import { create } from 'zustand'

interface GitState {
  activeTab: 'changes' | 'branches' | 'log'
  selectedTaskId: number | null
  virtualBranch: string | null
  diffMode: 'side' | 'inline' | 'file'
  selectedFile: string | null

  setActiveTab: (tab: GitState['activeTab']) => void
  setSelectedTask: (taskId: number | null, branch: string | null) => void
  setVirtualBranch: (branch: string | null) => void
  setDiffMode: (mode: GitState['diffMode']) => void
  setSelectedFile: (file: string | null) => void
}

export const useGitStore = create<GitState>()((set) => ({
  activeTab: 'branches',
  selectedTaskId: null,
  virtualBranch: null,
  diffMode: 'side',
  selectedFile: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedTask: (taskId, branch) =>
    set({ selectedTaskId: taskId, virtualBranch: branch, selectedFile: null }),
  setVirtualBranch: (branch) => set({ virtualBranch: branch, selectedFile: null }),
  setDiffMode: (mode) => set({ diffMode: mode }),
  setSelectedFile: (file) => set({ selectedFile: file }),
}))
