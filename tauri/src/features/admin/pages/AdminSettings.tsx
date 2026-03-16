import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../../ui/skeleton/Skeleton'
import styles from '../admin.module.css'

export default function AdminSettings() {
  const { t } = useTranslation()

  const sections = [
    { title: t('settings.appearance.title'), hint: t('settings.appearance.hint'), rows: 2 },
    { title: t('settings.notification.title'), hint: t('settings.notification.hint'), rows: 3 },
    { title: t('settings.pipeline.title'), hint: t('settings.pipeline.hint'), rows: 3 },
    { title: t('settings.observe.title'), hint: t('settings.observe.hint'), rows: 3 },
    { title: t('settings.security.title'), hint: t('settings.security.hint'), rows: 2 },
    { title: t('settings.data.title'), hint: t('settings.data.hint'), rows: 3 },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 720 }}>
        <div className={styles.header}>
          <h1 className={styles.headerTitle}>{t('settings.title')}</h1>
          <p className={styles.headerHint}>{t('settings.hint')}</p>
        </div>

        {sections.map((sec, si) => (
          <div key={si} className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>{sec.title}</div>
              <div className={styles.sectionHint}>{sec.hint}</div>
            </div>
            <div className={styles.sectionBody}>
              {Array.from({ length: sec.rows }).map((_, i) => (
                <div key={i} className={styles.formRow}>
                  <Skeleton variant="text" width="35%" height={12} />
                  <Skeleton variant="rect" width={100} height={28} borderRadius={6} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
