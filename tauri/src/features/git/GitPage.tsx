import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAppStore } from '../../lib/store/app'
import { useGitStore } from '../../lib/store/git'
import { GitNavCol } from './components/GitNavCol'
import { CommitHistory } from './components/CommitHistory'
import { ChangesPanel } from './components/ChangesPanel'
import { DiffViewer } from './components/DiffViewer'
import styles from './git-page.module.css'

export function GitPage() {
  const projectId = useAppStore((s) => s.activeProjectId)
  const setActiveTab = useGitStore((s) => s.setActiveTab)
  const setSelectedTask = useGitStore((s) => s.setSelectedTask)
  const selectedCommit = useGitStore((s) => s.selectedCommit)
  const [searchParams] = useSearchParams()

  // Auto-select task from URL param (preserve existing behavior)
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
        const branchName = (task as unknown as Record<string, unknown>).branch_name as string | undefined
        if (branchName) {
          setActiveTab('branches')
          setSelectedTask(taskId, branchName)
        }
      }
    }
  }, [taskParam, tasks, setActiveTab, setSelectedTask])

  function handleConfigClick() {
    // TODO: navigate to repo config view (future feature)
  }

  return (
    <div className={styles.page}>
      {/* 左侧导航（全高） */}
      <div className={styles.navCol}>
        <GitNavCol onConfigClick={handleConfigClick} />
      </div>

      {/* 右侧主区域 */}
      <div className={styles.mainArea}>
        {/* 上：提交历史 */}
        <div className={styles.topHalf}>
          <CommitHistory />
        </div>

        <div className={styles.divider} />

        {/* 下：变更列表 + Diff */}
        <div className={styles.botHalf}>
          <ChangesPanel />
          <div className={styles.diffArea}>
            <DiffViewer selectedCommit={selectedCommit} />
          </div>
        </div>
      </div>
    </div>
  )
}
