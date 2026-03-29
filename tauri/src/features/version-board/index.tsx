import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../lib/store/app'
import { api } from '../../lib/api'
import type { Version, Task, VersionCreate } from '../../lib/api/types'
import { Button } from '../../ui/button'
import styles from './version-board.module.css'

type FilterMode = 'incomplete' | 'all'

const STATUS_LABELS: Record<Version['status'], string> = {
  planning: '规划中',
  active: '开发中',
  shipped: '已上线',
}

// 计算任务已完成的阶段数和总阶段数
function parseTaskProgress(task: Task): { done: number; total: number; dots: Array<'done' | 'active' | 'pending'> } {
  const STAGE_ORDER = ['input', 'discovery', 'analysis', 'prd', 'architecture', 'ui', 'plan', 'dev', 'review', 'test', 'security', 'staging', 'deploy', 'monitor', 'done']
  let stages = STAGE_ORDER
  if (task.stages) {
    try { stages = JSON.parse(task.stages) } catch { /* ignore */ }
  }
  const currentIdx = stages.indexOf(task.stage)
  const total = stages.length
  const dots = stages.slice(0, Math.min(12, total)).map((_s, i): 'done' | 'active' | 'pending' => {
    if (i < currentIdx) return 'done'
    if (i === currentIdx) return task.status === 'running' ? 'active' : 'done'
    return 'pending'
  })
  return { done: currentIdx, total, dots }
}

function isTaskDone(task: Task) {
  return task.stage === 'done' || task.status === 'done' || task.status === 'completed'
}

// 版本是否完成
function isVersionDone(tasks: Task[]) {
  return tasks.length > 0 && tasks.every(isTaskDone)
}

export default function VersionBoardPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const [filter, setFilter] = useState<FilterMode>('incomplete')
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [showNewVersion, setShowNewVersion] = useState(false)
  const [newVersionData, setNewVersionData] = useState<VersionCreate>({ name: '', status: 'planning' })
  const [newTaskVersionId, setNewTaskVersionId] = useState<number | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')

  const { data: versions = [], isLoading: vLoading } = useQuery({
    queryKey: ['versions', activeProjectId],
    queryFn: () => api.getVersions(activeProjectId!),
    enabled: !!activeProjectId,
  })

  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks', activeProjectId],
    queryFn: () => api.getTasks(activeProjectId!),
    enabled: !!activeProjectId,
  })

  const createVersionMut = useMutation({
    mutationFn: (data: VersionCreate) => api.createVersion(activeProjectId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['versions', activeProjectId] })
      setShowNewVersion(false)
      setNewVersionData({ name: '', status: 'planning' })
    },
  })

  const createTaskMut = useMutation({
    mutationFn: async ({ versionId, title }: { versionId: number; title: string }) => {
      const task = await api.createTask(activeProjectId!, { title, description: '' })
      await api.assignTaskToVersion(activeProjectId!, versionId, task.id)
      return task
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', activeProjectId] })
      setNewTaskVersionId(null)
      setNewTaskTitle('')
    },
  })

  const updateVersionMut = useMutation({
    mutationFn: ({ versionId, data }: { versionId: number; data: { status: Version['status'] } }) =>
      api.updateVersion(activeProjectId!, versionId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['versions', activeProjectId] }),
  })

  // 任务按版本分组
  const tasksByVersion = useMemo(() => {
    const map = new Map<number | null, Task[]>()
    allTasks.forEach((t) => {
      const key = t.version_id ?? null
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    })
    return map
  }, [allTasks])

  // 筛选：只显示未完成的版本
  const visibleVersions = useMemo(() => {
    if (filter === 'all') return versions
    return versions.filter((v) => {
      if (v.status === 'shipped') return false
      const tasks = tasksByVersion.get(v.id) ?? []
      return !isVersionDone(tasks)
    })
  }, [versions, filter, tasksByVersion])

  const toggleCollapse = (id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (!activeProjectId) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>请先选择一个项目</div>
          <div className={styles.emptyHint}>从侧边栏选择项目后查看版本规划</div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {/* 工具栏 */}
      <div className={styles.toolbar}>
        <span className={styles.toolbarTitle}>版本规划</span>
        <span className={styles.spacer} />
        <div className={styles.filterGroup}>
          <button
            className={`${styles.filterBtn} ${filter === 'incomplete' ? styles.active : ''}`}
            onClick={() => setFilter('incomplete')}
          >
            未完成
          </button>
          <button
            className={`${styles.filterBtn} ${filter === 'all' ? styles.active : ''}`}
            onClick={() => setFilter('all')}
          >
            全部
          </button>
        </div>
        <Button onClick={() => setShowNewVersion(true)}>+ 新建版本</Button>
      </div>

      {/* 版本列表 */}
      {vLoading ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyHint}>加载中…</div>
        </div>
      ) : visibleVersions.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>暂无版本</div>
          <div className={styles.emptyHint}>创建第一个版本来规划任务上线节奏</div>
        </div>
      ) : (
        <div className={styles.versions}>
          {visibleVersions.map((version) => {
            const tasks = tasksByVersion.get(version.id) ?? []
            const isCollapsed = collapsed.has(version.id)
            const doneTasks = tasks.filter(isTaskDone).length
            const progress = `${doneTasks}/${tasks.length}`

            return (
              <div
                key={version.id}
                className={`${styles.versionCard} ${version.status === 'active' ? styles.active : ''}`}
              >
                <div className={styles.versionHeader} onClick={() => toggleCollapse(version.id)}>
                  <span className={`${styles.versionBadge} ${styles[`badge-${version.status}`]}`}>
                    {version.name}
                  </span>
                  {version.title && <span className={styles.versionTitle}>{version.title}</span>}
                  <span className={styles.versionDesc}>{STATUS_LABELS[version.status]}</span>
                  <div className={styles.versionMeta}>
                    {version.target_date && (
                      <span className={styles.versionDate}>目标 {version.target_date}</span>
                    )}
                    <span className={styles.versionProgress}>
                      <span>{doneTasks}</span>/{tasks.length} 完成
                    </span>
                    {version.status !== 'shipped' && isVersionDone(tasks) && tasks.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          updateVersionMut.mutate({ versionId: version.id, data: { status: 'shipped' } })
                        }}
                      >
                        标记上线
                      </Button>
                    )}
                    <span className={`${styles.collapseIcon} ${isCollapsed ? styles.collapsed : ''}`}>▼</span>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className={styles.taskGrid}>
                    {tasks.map((task) => {
                      const { dots } = parseTaskProgress(task)
                      const done = isTaskDone(task)
                      const running = task.status === 'running' || task.status === 'pending'
                      return (
                        <div
                          key={task.id}
                          className={`${styles.taskCard} ${running ? styles.running : ''}`}
                          onClick={() => navigate(`/tasks/${task.id}`)}
                        >
                          {running && <div className={styles.taskRunningBadge}>进行中</div>}
                          <div className={styles.taskCardTop}>
                            <span className={styles.taskId}>#{task.id}</span>
                            <span className={styles.taskTitle}>{task.title}</span>
                          </div>
                          <div className={styles.stageDots}>
                            {dots.map((d, i) => (
                              <div key={i} className={`${styles.stageDot} ${styles[d]}`} />
                            ))}
                          </div>
                          <div className={styles.taskCardFooter}>
                            <span className={`${styles.taskStage} ${done ? styles.done : running ? styles.active : ''}`}>
                              {done ? '✓ 已完成' : task.stage}
                            </span>
                          </div>
                        </div>
                      )
                    })}

                    {/* 新建任务输入框或按钮 */}
                    {newTaskVersionId === version.id ? (
                      <form
                        className={styles.addTaskCard}
                        style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}
                        onSubmit={(e) => {
                          e.preventDefault()
                          if (!newTaskTitle.trim()) return
                          createTaskMut.mutate({ versionId: version.id, title: newTaskTitle.trim() })
                        }}
                      >
                        <input
                          autoFocus
                          className={styles.formInput}
                          placeholder="任务标题…"
                          value={newTaskTitle}
                          onChange={(e) => setNewTaskTitle(e.target.value)}
                          onKeyDown={(e) => e.key === 'Escape' && setNewTaskVersionId(null)}
                        />
                        <div style={{ display: 'flex', gap: 4 }}>
                          <Button type="submit" size="sm" disabled={createTaskMut.isPending}>
                            确认
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setNewTaskVersionId(null)}
                          >
                            取消
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <button
                        className={styles.addTaskCard}
                        onClick={() => {
                          setNewTaskVersionId(version.id)
                          setNewTaskTitle('')
                        }}
                      >
                        <span style={{ fontSize: 14 }}>+</span> 添加任务
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* 新建版本按钮 */}
          <button className={styles.addVersionBtn} onClick={() => setShowNewVersion(true)}>
            <span style={{ fontSize: 16 }}>+</span> 新建版本
          </button>
        </div>
      )}

      {/* 新建版本弹窗 */}
      {showNewVersion && (
        <div className={styles.modal} onClick={() => setShowNewVersion(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitle}>新建版本</div>

            <div className={styles.formRow}>
              <label className={styles.formLabel}>版本号 *</label>
              <input
                className={styles.formInput}
                placeholder="如 v1.0、v2.1、Beta"
                value={newVersionData.name}
                onChange={(e) => setNewVersionData((d) => ({ ...d, name: e.target.value }))}
              />
            </div>

            <div className={styles.formRow}>
              <label className={styles.formLabel}>标题</label>
              <input
                className={styles.formInput}
                placeholder="简短描述这个版本的主要目标"
                value={newVersionData.title ?? ''}
                onChange={(e) => setNewVersionData((d) => ({ ...d, title: e.target.value }))}
              />
            </div>

            <div className={styles.formRow}>
              <label className={styles.formLabel}>状态</label>
              <select
                className={styles.formInput}
                value={newVersionData.status}
                onChange={(e) =>
                  setNewVersionData((d) => ({ ...d, status: e.target.value as Version['status'] }))
                }
              >
                <option value="planning">规划中</option>
                <option value="active">开发中</option>
                <option value="shipped">已上线</option>
              </select>
            </div>

            <div className={styles.formRow}>
              <label className={styles.formLabel}>目标日期</label>
              <input
                type="date"
                className={styles.formInput}
                value={newVersionData.target_date ?? ''}
                onChange={(e) => setNewVersionData((d) => ({ ...d, target_date: e.target.value }))}
              />
            </div>

            <div className={styles.modalActions}>
              <Button variant="ghost" onClick={() => setShowNewVersion(false)}>
                取消
              </Button>
              <Button
                disabled={!newVersionData.name.trim() || createVersionMut.isPending}
                onClick={() => createVersionMut.mutate(newVersionData)}
              >
                创建版本
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
