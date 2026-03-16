import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../lib/store/app'
import { api } from '../../lib/api'
import { IconLogo } from '../../ui/icon'
import type { Project, Task } from '../../lib/api/types'
import styles from './project-selector.module.css'

interface ProjectWithMeta extends Project {
  tasks: Task[]
  task_count: number
  done_count: number
  current_stage: string
}

// 颜色池：给每个项目分配不同的头像背景色
const AVATAR_COLORS = [
  '#007acc', '#16825d', '#bf8803', '#e51400',
  '#68217a', '#005fb8', '#a6e22e', '#66d9ef',
]

function getAvatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length]
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'
  if (diffDays < 7) return `${diffDays} 天前`
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

const STAGE_LABELS: Record<string, string> = {
  input: '需求',
  analysis: '分析',
  prd: 'PRD',
  ui: 'UI',
  plan: '计划',
  dev: '开发',
  test: '测试',
  deploy: '部署',
  monitor: '监控',
  done: '完成',
}

export default function ProjectSelector() {
  const { t } = useTranslation()
  const { activeProjectId, recentProjectIds, setActiveProjectId } = useAppStore()
  const [projects, setProjects] = useState<ProjectWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    setLoading(true)
    setError('')
    try {
      const list = await api.getProjects()
      const withMeta: ProjectWithMeta[] = await Promise.all(
        list.map(async (p) => {
          try {
            const tasks = await api.getTasks(p.id)
            const doneCount = tasks.filter((t) => t.status === 'done' || t.current_stage === 'done').length
            const latestTask = tasks.length > 0 ? tasks[tasks.length - 1] : null
            return {
              ...p,
              tasks,
              task_count: tasks.length,
              done_count: doneCount,
              current_stage: latestTask?.current_stage ?? '',
            }
          } catch {
            return { ...p, tasks: [], task_count: 0, done_count: 0, current_stage: '' }
          }
        })
      )
      setProjects(withMeta)
    } catch {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  function handleSelect(project: ProjectWithMeta) {
    setActiveProjectId(String(project.id))
  }

  // 分类
  const recentSet = new Set(recentProjectIds)
  const recent: ProjectWithMeta[] = []
  const withContent: ProjectWithMeta[] = []
  const empty: ProjectWithMeta[] = []

  for (const p of projects) {
    const pid = String(p.id)
    if (recentSet.has(pid)) {
      recent.push(p)
    } else if (p.task_count > 0) {
      withContent.push(p)
    } else {
      empty.push(p)
    }
  }

  recent.sort((a, b) => {
    return recentProjectIds.indexOf(String(a.id)) - recentProjectIds.indexOf(String(b.id))
  })

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.logoRow}>
          <IconLogo size={28} className={styles.logoIcon} />
          <h1 className={styles.title}>TaskConductor</h1>
        </div>
        <p className={styles.subtitle}>{t('project.select_hint')}</p>
      </div>

      {loading && (
        <div className={styles.loading}><div className={styles.spinner} /></div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {!loading && !error && projects.length === 0 && (
        <p className={styles.empty}>{t('project.no_projects')}</p>
      )}

      {!loading && !error && (
        <>
          {recent.length > 0 && (
            <CategorySection
              title={t('project.recent')}
              count={recent.length}
              projects={recent}
              activeProjectId={activeProjectId}
              onSelect={handleSelect}
            />
          )}
          {withContent.length > 0 && (
            <CategorySection
              title={t('project.with_content')}
              count={withContent.length}
              projects={withContent}
              activeProjectId={activeProjectId}
              onSelect={handleSelect}
            />
          )}
          {empty.length > 0 && (
            <CategorySection
              title={t('project.empty')}
              count={empty.length}
              projects={empty}
              activeProjectId={activeProjectId}
              onSelect={handleSelect}
            />
          )}
        </>
      )}
    </div>
  )
}

function CategorySection({
  title,
  count,
  projects,
  activeProjectId,
  onSelect,
}: {
  title: string
  count: number
  projects: ProjectWithMeta[]
  activeProjectId: string | null
  onSelect: (p: ProjectWithMeta) => void
}) {
  return (
    <div className={styles.category}>
      <div className={styles.categoryHeader}>
        <span className={styles.categoryTitle}>{title}</span>
        <span className={styles.categoryCount}>{count}</span>
      </div>
      <div className={styles.grid}>
        {projects.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            isActive={String(p.id) === activeProjectId}
            onClick={() => onSelect(p)}
          />
        ))}
      </div>
    </div>
  )
}

function ProjectCard({
  project,
  isActive,
  onClick,
}: {
  project: ProjectWithMeta
  isActive: boolean
  onClick: () => void
}) {
  const isEmpty = project.task_count === 0
  const progress = project.task_count > 0
    ? Math.round((project.done_count / project.task_count) * 100)
    : 0
  const initial = project.name.charAt(0).toUpperCase()
  const stageLabel = STAGE_LABELS[project.current_stage] ?? project.current_stage
  const isStageActive = project.current_stage && project.current_stage !== 'done' && project.current_stage !== 'input'

  return (
    <div
      className={`${styles.card} ${isActive ? styles.cardActive : ''} ${isEmpty ? styles.cardEmpty : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <div className={styles.cardTop}>
        <div
          className={styles.cardAvatar}
          style={{ background: getAvatarColor(project.id) }}
        >
          {initial}
        </div>
        <div className={styles.cardName}>{project.name}</div>
      </div>

      <div className={styles.cardDesc}>
        {project.description || (isEmpty ? '暂无内容' : '无描述')}
      </div>

      {!isEmpty && (
        <>
          <div className={styles.cardStats}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{project.task_count}</span>
              <span className={styles.statLabel}>任务</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{project.done_count}</span>
              <span className={styles.statLabel}>完成</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{progress}%</span>
              <span className={styles.statLabel}>进度</span>
            </div>
          </div>

          <div className={styles.progressWrap}>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${progress}%` }} />
            </div>
          </div>
        </>
      )}

      <div className={styles.cardFooter}>
        <span className={styles.cardTime}>{formatDate(project.created_at)}</span>
        {stageLabel && (
          <span className={`${styles.stageBadge} ${isStageActive ? styles.stageBadgeActive : ''}`}>
            {stageLabel}
          </span>
        )}
      </div>
    </div>
  )
}
