import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../lib/store/app'
import { api } from '../../lib/api'
import { IconChevronLeft, IconFolder, IconLayoutGrid } from '../../ui/icon'
import type { Project } from '../../lib/api/types'
import styles from './project-switcher.module.css'

interface ProjectWithMeta extends Project {
  task_count: number
}

export function ProjectSwitcher() {
  const { t } = useTranslation()
  const { activeProjectId, recentProjectIds, setActiveProjectId, clearActiveProject } = useAppStore()
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<ProjectWithMeta[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // 当前项目名
  const currentProject = projects.find((p) => String(p.id) === activeProjectId)
  const displayName = currentProject?.name ?? t('project.select_hint')

  // 打开时加载项目
  useEffect(() => {
    if (!open) return
    loadProjects()
    setTimeout(() => searchRef.current?.focus(), 50)
  }, [open])

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

  // 按搜索过滤
  const filtered = search
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.description?.toLowerCase().includes(search.toLowerCase())
      )
    : projects

  // 分类
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

  recent.sort((a, b) => {
    const ai = recentProjectIds.indexOf(String(a.id))
    const bi = recentProjectIds.indexOf(String(b.id))
    return ai - bi
  })

  const getInitial = (name: string) => name.charAt(0).toUpperCase()

  return (
    <>
      <button
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        onClick={() => setOpen(!open)}
      >
        <span>{displayName}</span>
        <IconChevronLeft
          size={12}
          className={styles.triggerIcon}
          style={{ transform: open ? 'rotate(-90deg)' : 'rotate(-90deg)' }}
        />
      </button>

      {open && (
        <>
          <div className={styles.overlay} onClick={() => { setOpen(false); setSearch('') }} />
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
                          initial={getInitial(p.name)}
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
                          initial={getInitial(p.name)}
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
                          initial={getInitial(p.name)}
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
        </>
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
