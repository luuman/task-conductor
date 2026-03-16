import { useTranslation } from 'react-i18next'
import { Skeleton, SkeletonCard } from '../../../ui/skeleton/Skeleton'
import styles from '../admin.module.css'

export default function AdminDashboard() {
  const { t } = useTranslation()

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.headerTitle}>{t('admin.dashboard.title')}</h1>
          <p className={styles.headerHint}>{t('admin.dashboard.hint')}</p>
        </div>

        {/* KPI 卡片 */}
        <div className={styles.kpiGrid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.kpiCard}>
              <Skeleton variant="text" width="60%" height={12} />
              <Skeleton variant="text" width="40%" height={24} />
              <Skeleton variant="text" width="80%" height={10} />
            </div>
          ))}
        </div>

        {/* 图表区 */}
        <div className={styles.twoCol}>
          <SkeletonCard>
            <Skeleton variant="text" width="30%" height={12} />
            <div className={styles.chartPlaceholder}>
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className={styles.chartBar}
                  height={`${20 + Math.random() * 80}%`}
                />
              ))}
            </div>
          </SkeletonCard>
          <SkeletonCard>
            <Skeleton variant="text" width="30%" height={12} />
            <div className={styles.chartPlaceholder}>
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className={styles.chartBar}
                  height={`${20 + Math.random() * 80}%`}
                />
              ))}
            </div>
          </SkeletonCard>
        </div>

        {/* 最近活动 */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <Skeleton variant="text" width={80} height={12} />
          </div>
          <div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={styles.listItem}>
                <Skeleton variant="circle" width={28} />
                <div className={styles.listItemContent}>
                  <Skeleton variant="text" width="60%" height={12} />
                  <Skeleton variant="text" width="40%" height={10} />
                </div>
                <div className={styles.listItemRight}>
                  <Skeleton variant="text" width={60} height={10} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
