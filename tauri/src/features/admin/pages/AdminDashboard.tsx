import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../../ui/skeleton/Skeleton'
import { api } from '../../../lib/api'
import type { Metrics, Project } from '../../../lib/api/types'
import styles from '../admin.module.css'

export default function AdminDashboard() {
  const { t } = useTranslation()
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.getMetrics().catch(() => null),
      api.getProjects().catch(() => []),
    ]).then(([m, p]) => {
      setMetrics(m)
      setProjects(p)
    }).catch(() => setError('Failed to load'))
  }, [])

  const loading = metrics === null && error === null

  const kpi = metrics?.kpi
  const kpiItems = metrics ? [
    { label: t('admin.dashboard.total_tasks'), value: metrics.tasks.total, sub: `${Object.keys(metrics.tasks.by_status).length} ${t('admin.dashboard.statuses')}` },
    { label: t('admin.dashboard.ai_rating'), value: kpi ? `${(kpi.ai_rating * 100).toFixed(0)}%` : '—', sub: t('admin.dashboard.confidence') },
    { label: t('admin.dashboard.avg_response'), value: kpi?.avg_response_time_s != null ? `${kpi.avg_response_time_s.toFixed(1)}s` : '—', sub: t('admin.dashboard.per_call') },
    { label: t('admin.dashboard.uptime'), value: kpi?.uptime_pct != null ? `${kpi.uptime_pct.toFixed(1)}%` : '—', sub: t('admin.dashboard.availability') },
  ] : []

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.headerTitle}>{t('admin.dashboard.title')}</h1>
          <p className={styles.headerHint}>{t('admin.dashboard.hint')}</p>
        </div>

        {error && <p style={{ color: 'var(--tc-error)', fontSize: 13 }}>{error}</p>}

        {/* KPI 卡片 */}
        <div className={styles.kpiGrid}>
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={styles.kpiCard}>
                  <Skeleton variant="text" width="60%" height={12} />
                  <Skeleton variant="text" width="40%" height={24} />
                  <Skeleton variant="text" width="80%" height={10} />
                </div>
              ))
            : kpiItems.map((item, i) => (
                <div key={i} className={styles.kpiCard}>
                  <span className={styles.kpiLabel}>{item.label}</span>
                  <span className={styles.kpiValue}>{item.value}</span>
                  <span className={styles.kpiSub}>{item.sub}</span>
                </div>
              ))
          }
        </div>

        {/* 卡片网格：任务状态 + 项目列表 + 性能概览 */}
        <div className={styles.cardGrid}>
          {/* 任务状态 */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>{t('admin.dashboard.task_status')}</div>
            </div>
            <div className={styles.sectionBody}>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className={styles.formRow}>
                      <Skeleton variant="text" width="30%" height={12} />
                      <Skeleton variant="rect" width={50} height={20} borderRadius={10} />
                    </div>
                  ))
                : metrics && Object.entries(metrics.tasks.by_status).map(([status, count]) => (
                    <div key={status} className={styles.formRow}>
                      <span className={styles.statusLabel}>{status}</span>
                      <span className={styles.statusBadge}>{count}</span>
                    </div>
                  ))
              }
              {!loading && metrics && Object.keys(metrics.tasks.by_status).length === 0 && (
                <span className={styles.emptyHint}>{t('admin.dashboard.no_tasks')}</span>
              )}
            </div>
          </div>

          {/* 项目列表 */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>{t('admin.dashboard.projects')}</div>
              <div className={styles.sectionHint}>{projects ? `${projects.length} ${t('admin.dashboard.total')}` : ''}</div>
            </div>
            <div>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className={styles.listItem}>
                      <Skeleton variant="circle" width={28} />
                      <div className={styles.listItemContent}>
                        <Skeleton variant="text" width="60%" height={12} />
                        <Skeleton variant="text" width="40%" height={10} />
                      </div>
                    </div>
                  ))
                : projects?.map((p) => (
                    <div key={p.id} className={styles.listItem}>
                      <span className={styles.projectAvatar}>
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                      <div className={styles.listItemContent}>
                        <span className={styles.projectName}>{p.name}</span>
                        <span className={styles.projectDesc}>{p.description || '—'}</span>
                      </div>
                    </div>
                  ))
              }
              {!loading && projects && projects.length === 0 && (
                <div className={styles.listItem}>
                  <span className={styles.emptyHint}>{t('admin.dashboard.no_projects')}</span>
                </div>
              )}
            </div>
          </div>

          {/* 性能概览 */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>{t('admin.dashboard.performance')}</div>
            </div>
            <div className={styles.sectionBody}>
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className={styles.formRow}>
                      <Skeleton variant="text" width="35%" height={12} />
                      <Skeleton variant="text" width={80} height={12} />
                    </div>
                  ))
                : <>
                    <div className={styles.formRow}>
                      <span className={styles.perfLabel}>{t('admin.dashboard.interactions')}</span>
                      <span className={styles.perfValue}>{kpi?.interactions ?? 0}</span>
                    </div>
                    <div className={styles.formRow}>
                      <span className={styles.perfLabel}>{t('admin.dashboard.approval_rate')}</span>
                      <span className={styles.perfValue}>
                        {metrics?.tasks.approval_rate != null
                          ? `${(metrics.tasks.approval_rate * 100).toFixed(0)}%`
                          : '—'}
                      </span>
                    </div>
                    <div className={styles.formRow}>
                      <span className={styles.perfLabel}>{t('admin.dashboard.avg_duration')}</span>
                      <span className={styles.perfValue}>
                        {metrics?.tasks.avg_duration_s != null
                          ? `${metrics.tasks.avg_duration_s.toFixed(1)}s`
                          : '—'}
                      </span>
                    </div>
                  </>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
