import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../lib/store/app'
import { api } from '../../lib/api'
import { IconLogo, IconFolder } from '../../ui/icon'
import type { Project } from '../../lib/api/types'
import styles from './project-selector.module.css'

interface ProjectWithTasks extends Project {
  task_count: number
}

export default function ProjectSelector() {
  const { t } = useTranslation()
  const { activeProjectId, recentProjectIds, setActiveProjectId } = useAppStore()
  const [projects, setProjects] = useState<ProjectWithTasks[]>([])
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
      // 为每个项目获取任务数（后续可优化为后端返回）
      const withTasks: ProjectWithTasks[] = await Promise.all(
        list.map(async (p) => {
          try {
            const tasks = await api.getTasks(p.id)
            return { ...p, task_count: tasks.length }
          } catch {
            return { ...p, task_count: 0 }
          }
        })
      )
      setProjects(withTasks)
    } catch {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  function handleSelect(project: ProjectWithTasks) {
    setActiveProjectId(String(project.id))
  }

  // 分类：最近打开 → 有内容 → 空项目
  const recentSet = new Set(recentProjectIds)
  const recent: ProjectWithTasks[] = []
  const withContent: ProjectWithTasks[] = []
  const empty: ProjectWithTasks[] = []

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

  // 最近打开的按 recentProjectIds 顺序排
  recent.sort((a, b) => {
    const ai = recentProjectIds.indexOf(String(a.id))
    const bi = recentProjectIds.indexOf(String(b.id))
    return ai - bi
  })

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <IconLogo size={28} className={styles.logoIcon} />
          <h1 className={styles.title}>TaskConductor</h1>
        </div>
        <p className={styles.subtitle}>{t('project.select_hint')}</p>

        {loading && (
          <div className={styles.loading}>
            <div className={styles.spinner} />
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        {!loading && !error && projects.length === 0 && (
          <p className={styles.empty}>{t('project.no_projects')}</p>
        )}

        {!loading && !error && projects.length > 0 && (
          <>
            {recent.length > 0 && (
              <div className={styles.category}>
                <div className={styles.categoryTitle}>{t('project.recent')}</div>
                <div className={styles.list}>
                  {recent.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      isActive={String(p.id) === activeProjectId}
                      onClick={() => handleSelect(p)}
                    />
                  ))}
                </div>
              </div>
            )}

            {withContent.length > 0 && (
              <div className={styles.category}>
                <div className={styles.categoryTitle}>{t('project.with_content')}</div>
                <div className={styles.list}>
                  {withContent.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      isActive={String(p.id) === activeProjectId}
                      onClick={() => handleSelect(p)}
                    />
                  ))}
                </div>
              </div>
            )}

            {empty.length > 0 && (
              <div className={styles.category}>
                <div className={styles.categoryTitle}>{t('project.empty')}</div>
                <div className={styles.list}>
                  {empty.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      isActive={String(p.id) === activeProjectId}
                      onClick={() => handleSelect(p)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ProjectCard({
  project,
  isActive,
  onClick,
}: {
  project: ProjectWithTasks
  isActive: boolean
  onClick: () => void
}) {
  return (
    <div
      className={`${styles.card} ${isActive ? styles.cardActive : ''}`}
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
      <div className={styles.cardIcon}>
        <IconFolder size={18} />
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardName}>{project.name}</div>
        {project.description && (
          <div className={styles.cardDesc}>{project.description}</div>
        )}
      </div>
      <div className={styles.cardMeta}>
        <div className={styles.cardTaskCount}>
          {project.task_count > 0 ? `${project.task_count} 项` : '—'}
        </div>
      </div>
    </div>
  )
}
