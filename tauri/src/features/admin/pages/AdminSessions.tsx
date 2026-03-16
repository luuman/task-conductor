import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../../ui/skeleton/Skeleton'
import styles from '../admin.module.css'

export default function AdminSessions() {
  const { t } = useTranslation()

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.headerTitle}>{t('admin.sessions.title')}</h1>
          <p className={styles.headerHint}>{t('admin.sessions.hint')}</p>
        </div>

        {/* 搜索栏 */}
        <div style={{ marginBottom: 16 }}>
          <Skeleton variant="rect" width="100%" height={36} borderRadius={6} />
        </div>

        {/* 会话列表 */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Skeleton variant="text" width={80} height={12} />
              <Skeleton variant="text" width={40} height={10} />
            </div>
          </div>
          <div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={styles.listItem}>
                <Skeleton variant="circle" width={32} />
                <div className={styles.listItemContent}>
                  <Skeleton variant="text" width={`${50 + Math.random() * 30}%`} height={13} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Skeleton variant="text" width={60} height={10} />
                    <Skeleton variant="text" width={40} height={10} />
                  </div>
                </div>
                <div className={styles.listItemRight}>
                  <Skeleton variant="text" width={70} height={10} />
                  <Skeleton variant="rect" width={50} height={18} borderRadius={9} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 分页 */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="rect" width={32} height={32} borderRadius={6} />
          ))}
        </div>
      </div>
    </div>
  )
}
