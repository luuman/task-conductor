import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAppStore } from '../../lib/store/app'
import { useGitStore } from '../../lib/store/git'
import { ChangesTab } from './components/ChangesTab'
import { BranchesTab } from './components/BranchesTab'
import { LogTab } from './components/LogTab'
import { DiffViewer } from './components/DiffViewer'
import styles from './git-page.module.css'

type Tab = 'changes' | 'branches' | 'log'

const TABS: { key: Tab; labelKey: string }[] = [
  { key: 'changes', labelKey: 'git.changes' },
  { key: 'branches', labelKey: 'git.branches' },
  { key: 'log', labelKey: 'git.log' },
]

export function GitPage() {
  const { t } = useTranslation()
  const projectId = useAppStore((s) => s.activeProjectId)
  const activeTab = useGitStore((s) => s.activeTab)
  const setActiveTab = useGitStore((s) => s.setActiveTab)
  const setSelectedTask = useGitStore((s) => s.setSelectedTask)
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  const [searchParams] = useSearchParams()

  // Auto-select task from URL param
  const taskParam = searchParams.get('task')
  const { data: tasks } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => api.getTasks(Number(projectId!)),
    enabled: !!projectId && !!taskParam,
    staleTime: 10_000,
  })

  useEffect(() => {
    if (taskParam && tasks) {
      const taskId = Number(taskParam)
      const task = tasks.find((t) => t.id === taskId)
      if (task) {
        const branchName = (task as Record<string, unknown>).branch_name as string | undefined
        if (branchName) {
          setActiveTab('branches')
          setSelectedTask(taskId, branchName)
        }
      }
    }
  }, [taskParam, tasks, setActiveTab, setSelectedTask])

  return (
    <div className={styles.page}>
      {/* Left panel */}
      <div className={styles.left}>
        <div className={styles.tabs}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
        <div className={styles.tabContent}>
          {activeTab === 'changes' && <ChangesTab />}
          {activeTab === 'branches' && <BranchesTab />}
          {activeTab === 'log' && (
            <LogTab
              selectedCommit={selectedCommit}
              onSelectCommit={setSelectedCommit}
            />
          )}
        </div>
      </div>

      {/* Right panel — Diff viewer */}
      <div className={styles.right}>
        <DiffViewer selectedCommit={selectedCommit} />
      </div>
    </div>
  )
}
