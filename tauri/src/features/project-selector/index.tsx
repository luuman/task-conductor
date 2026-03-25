import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../lib/store/app'
import { api } from '../../lib/api'
import { IconLogo } from '../../ui/icon'
import { EmptyState } from '../../ui/empty-state'
import type { Project } from '../../lib/api/types'
import styles from './project-selector.module.css'

interface ProjectMeta extends Project {
  file_count: number
  knowledge_count: number
  task_count: number
}

const AVATAR_COLORS = [
  '#7c6af5', '#16825d', '#f59e0b', '#ef4444',
  '#a855f7', '#3b82f6', '#10b981', '#f97316',
]

function getAvatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length]
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'
  if (diffDays < 7) return `${diffDays} 天前`
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function getFolderName(repoUrl: string) {
  return repoUrl.split('/').pop() ?? repoUrl
}

export default function ProjectSelector() {
  const { t } = useTranslation()
  const { activeProjectId, recentProjectIds, setActiveProjectId } = useAppStore()
  const [projects, setProjects] = useState<ProjectMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { loadProjects() }, [])

  async function loadProjects() {
    setLoading(true)
    setError('')
    try {
      const list = await api.getProjects()

      // 先渲染项目列表（无 meta），避免等待
      const initial: ProjectMeta[] = list.map((p) => ({
        ...p, file_count: 0, knowledge_count: 0, task_count: 0,
      }))
      setProjects(initial)
      setLoading(false)

      // 异步并行补充每个项目的 meta 数据
      const enriched = await Promise.all(
        list.map(async (p) => {
          const isLocal = p.repo_url && !p.repo_url.startsWith('http')
          const [files, knowledge, tasks] = await Promise.all([
            isLocal ? api.getProjectFiles(p.id).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
            api.getProjectKnowledge(p.id).catch(() => []),
            api.getTasks(p.id).catch(() => []),
          ])
          return {
            ...p,
            file_count: files.items.length,
            knowledge_count: knowledge.length,
            task_count: tasks.length,
          }
        })
      )
      setProjects(enriched)
    } catch {
      setError(t('common.error'))
      setLoading(false)
    }
  }

  // 分类：最近打开 → 有文件内容 → 空项目
  const recentSet = new Set(recentProjectIds)
  const recent: ProjectMeta[] = []
  const withContent: ProjectMeta[] = []
  const empty: ProjectMeta[] = []

  for (const p of projects) {
    const pid = String(p.id)
    if (recentSet.has(pid)) {
      recent.push(p)
    } else if (p.file_count > 0) {
      withContent.push(p)
    } else {
      empty.push(p)
    }
  }

  recent.sort((a, b) =>
    recentProjectIds.indexOf(String(a.id)) - recentProjectIds.indexOf(String(b.id))
  )

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.logoRow}>
          <IconLogo size={28} className={styles.logoIcon} />
          <h1 className={styles.title}>TaskConductor</h1>
        </div>
        <p className={styles.subtitle}>{t('project.select_hint')}</p>
      </div>

      {loading && <div className={styles.loading}><div className={styles.spinner} /></div>}
      {error && <p className={styles.error}>{error}</p>}
      {!loading && !error && projects.length === 0 && (
        <EmptyState icon="\uD83D\uDCCB" title={t('project.no_projects')} />
      )}

      {!loading && !error && (
        <>
          {recent.length > 0 && (
            <Section title={t('project.recent')} count={recent.length}>
              {recent.map((p) => (
                <Card key={p.id} project={p} isActive={String(p.id) === activeProjectId}
                  onClick={() => setActiveProjectId(String(p.id))} />
              ))}
            </Section>
          )}
          {withContent.length > 0 && (
            <Section title={t('project.with_content')} count={withContent.length}>
              {withContent.map((p) => (
                <Card key={p.id} project={p} isActive={String(p.id) === activeProjectId}
                  onClick={() => setActiveProjectId(String(p.id))} />
              ))}
            </Section>
          )}
          {empty.length > 0 && (
            <Section title={t('project.empty')} count={empty.length}>
              {empty.map((p) => (
                <Card key={p.id} project={p} isActive={String(p.id) === activeProjectId}
                  onClick={() => setActiveProjectId(String(p.id))} />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className={styles.category}>
      <div className={styles.categoryHeader}>
        <span className={styles.categoryTitle}>{title}</span>
        <span className={styles.categoryCount}>{count}</span>
      </div>
      <div className={styles.grid}>{children}</div>
    </div>
  )
}

function Card({ project, isActive, onClick }: { project: ProjectMeta; isActive: boolean; onClick: () => void }) {
  const isEmpty = project.file_count === 0 && project.task_count === 0
  const initial = project.name.charAt(0).toUpperCase()
  const folderPath = getFolderName(project.repo_url)
  const hasKnowledge = project.knowledge_count > 0

  return (
    <div
      className={`${styles.card} ${isActive ? styles.cardActive : ''} ${isEmpty ? styles.cardEmpty : ''}`}
      onClick={onClick} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
    >
      <div className={styles.cardTop}>
        <div className={styles.cardAvatar} style={{ background: getAvatarColor(project.id) }}>
          {initial}
        </div>
        <div className={styles.cardNameWrap}>
          <div className={styles.cardName}>{project.name}</div>
          <div className={styles.cardPath}>{folderPath}</div>
        </div>
      </div>

      {project.description && (
        <div className={styles.cardDesc}>{project.description}</div>
      )}

      {!isEmpty && (
        <div className={styles.cardStats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{project.file_count}</span>
            <span className={styles.statLabel}>文件</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{project.task_count}</span>
            <span className={styles.statLabel}>任务</span>
          </div>
          {hasKnowledge && (
            <div className={styles.stat}>
              <span className={styles.statValue}>{project.knowledge_count}</span>
              <span className={styles.statLabel}>经验</span>
            </div>
          )}
        </div>
      )}

      <div className={styles.cardFooter}>
        <span className={styles.cardTime}>{formatDate(project.created_at)}</span>
        {hasKnowledge && <span className={styles.knowledgeBadge}>有经验记录</span>}
      </div>
    </div>
  )
}
