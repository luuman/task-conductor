import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../lib/store/app'
import { api } from '../../lib/api'
import { IconLayoutGrid } from '../../ui/icon'
import type { Project } from '../../lib/api/types'
import styles from './project-switcher.module.css'

interface ProjectWithMeta extends Project {
  task_count: number
}

const AVATAR_COLORS = [
  '#7c6af5', '#16825d', '#f59e0b', '#ef4444',
  '#a855f7', '#3b82f6', '#10b981', '#f97316',
]

function getAvatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length]
}

export function ProjectSwitcher() {
  const { t } = useTranslation()
  const { activeProjectId, recentProjectIds, setActiveProjectId, clearActiveProject } = useAppStore()
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<ProjectWithMeta[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const currentProject = projects.find((p) => String(p.id) === activeProjectId)
  const initial = currentProject ? currentProject.name.charAt(0).toUpperCase() : '?'
  const avatarBg = currentProject ? getAvatarColor(currentProject.id) : 'var(--tc-sidebar-item-hover)'

  // 初次渲染加载项目列表（用于显示当前项目名）
  useEffect(() => {
    api.getProjects().then((list) => {
      setProjects(list.map((p) => ({ ...p, task_count: 0 })))
    }).catch(() => {})
  }, [])

  // 打开时加载完整数据
  useEffect(() => {
    if (!open) return
    loadProjects()
    setTimeout(() => searchRef.current?.focus(), 50)
  }, [open])

  // 点击外部关闭
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (
      dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
      triggerRef.current && !triggerRef.current.contains(e.target as Node)
    ) {
      setOpen(false)
      setSearch('')
    }
  }, [])

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, handleClickOutside])

  async function loadProjects() {
    setLoading(true)
    try {
      const list = await api.getProjects()
      const withMeta: ProjectWithMeta[] = await Promise.all(
        list.map(async (p) => {
          try {
            const tasks = await api.getTasks(p.id)
            return { ...p, task_count: tasks.length }
          } catch {
            return { ...p, task_count: 0 }
          }
        })
      )
      setProjects(withMeta)
    } catch {
      // 静默
    } finally {
      setLoading(false)
    }
  }

  function handleSelect(project: ProjectWithMeta) {
    setActiveProjectId(String(project.id))
    setOpen(false)
    setSearch('')
  }

  const filtered = search
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.description?.toLowerCase().includes(search.toLowerCase())
      )
    : projects

  const recentSet = new Set(recentProjectIds)
  const recent: ProjectWithMeta[] = []
  const withContent: ProjectWithMeta[] = []
  const empty: ProjectWithMeta[] = []

  for (const p of filtered) {
    const pid = String(p.id)
    if (recentSet.has(pid)) {
      recent.push(p)
    } else if (p.task_count > 0) {
      withContent.push(p)
    } else {
      empty.push(p)
    }
  }

  recent.sort((a, b) =>
    recentProjectIds.indexOf(String(a.id)) - recentProjectIds.indexOf(String(b.id))
  )

  const getInitialChar = (name: string) => name.charAt(0).toUpperCase()

  return (
    <>
      <button
        ref={triggerRef}
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        onClick={() => setOpen(!open)}
        title={currentProject?.name ?? t('project.select_hint')}
      >
        <span className={styles.triggerAvatar} style={{ background: avatarBg }}>
          {initial}
        </span>
      </button>

      {open && (
        <div className={styles.dropdown} ref={dropdownRef}>
          <div className={styles.search}>
            <input
              ref={searchRef}
              type="text"
              className={styles.searchInput}
              placeholder={t('project.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className={styles.list}>
            {loading && <div className={styles.empty}>{t('common.loading')}</div>}

            {!loading && filtered.length === 0 && (
              <div className={styles.empty}>{t('project.no_projects')}</div>
            )}

            {!loading && (
              <>
                {recent.length > 0 && (
                  <>
                    <div className={styles.categoryLabel}>{t('project.recent')}</div>
                    {recent.map((p) => (
                      <ProjectItem
                        key={p.id}
                        project={p}
                        isActive={String(p.id) === activeProjectId}
                        initial={getInitialChar(p.name)}
                        onClick={() => handleSelect(p)}
                      />
                    ))}
                  </>
                )}

                {withContent.length > 0 && (
                  <>
                    <div className={styles.categoryLabel}>{t('project.with_content')}</div>
                    {withContent.map((p) => (
                      <ProjectItem
                        key={p.id}
                        project={p}
                        isActive={String(p.id) === activeProjectId}
                        initial={getInitialChar(p.name)}
                        onClick={() => handleSelect(p)}
                      />
                    ))}
                  </>
                )}

                {empty.length > 0 && (
                  <>
                    <div className={styles.categoryLabel}>{t('project.empty')}</div>
                    {empty.map((p) => (
                      <ProjectItem
                        key={p.id}
                        project={p}
                        isActive={String(p.id) === activeProjectId}
                        initial={getInitialChar(p.name)}
                        onClick={() => handleSelect(p)}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </div>

          <div className={styles.footer}>
            <button
              className={styles.footerBtn}
              onClick={() => {
                clearActiveProject()
                setOpen(false)
              }}
            >
              <IconLayoutGrid size={14} />
              <span>{t('project.view_all')}</span>
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function ProjectItem({
  project,
  isActive,
  initial,
  onClick,
}: {
  project: ProjectWithMeta
  isActive: boolean
  initial: string
  onClick: () => void
}) {
  return (
    <div
      className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
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
      <div className={styles.itemIcon}>{initial}</div>
      <div className={styles.itemBody}>
        <div className={styles.itemName}>{project.name}</div>
        {project.description && <div className={styles.itemDesc}>{project.description}</div>}
      </div>
      <div className={styles.itemMeta}>
        {project.task_count > 0 ? `${project.task_count}` : ''}
      </div>
    </div>
  )
}
