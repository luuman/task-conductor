import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../../ui/skeleton/Skeleton'
import styles from '../admin.module.css'

export default function AdminClaudeConfig() {
  const { t } = useTranslation()

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.headerTitle}>{t('admin.claude_config.title')}</h1>
          <p className={styles.headerHint}>{t('admin.claude_config.hint')}</p>
        </div>

        {/* Hook 状态 */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>{t('admin.claude_config.hooks')}</div>
            <div className={styles.sectionHint}>{t('admin.claude_config.hooks_hint')}</div>
          </div>
          <div className={styles.sectionBody}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={styles.formRow}>
                <Skeleton variant="text" width="30%" height={12} />
                <Skeleton variant="rect" width={40} height={20} borderRadius={10} />
              </div>
            ))}
          </div>
        </div>

        {/* 模型配置 */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>{t('admin.claude_config.model')}</div>
            <div className={styles.sectionHint}>{t('admin.claude_config.model_hint')}</div>
          </div>
          <div className={styles.sectionBody}>
            <div className={styles.formCol}>
              <Skeleton variant="text" width={80} height={10} />
              <Skeleton variant="rect" width="100%" height={34} borderRadius={6} />
            </div>
            <div className={styles.formCol}>
              <Skeleton variant="text" width={100} height={10} />
              <Skeleton variant="rect" width="100%" height={34} borderRadius={6} />
            </div>
            <div className={styles.formRow}>
              <Skeleton variant="text" width="40%" height={12} />
              <Skeleton variant="rect" width={80} height={30} borderRadius={6} />
            </div>
          </div>
        </div>

        {/* Prompt 模板 */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>{t('admin.claude_config.prompts')}</div>
            <div className={styles.sectionHint}>{t('admin.claude_config.prompts_hint')}</div>
          </div>
          <div className={styles.sectionBody}>
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className={styles.formCol}>
                <Skeleton variant="text" width={120} height={10} />
                <Skeleton variant="rect" width="100%" height={80} borderRadius={6} />
              </div>
            ))}
          </div>
        </div>

        {/* 连接池 */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>{t('admin.claude_config.pool')}</div>
            <div className={styles.sectionHint}>{t('admin.claude_config.pool_hint')}</div>
          </div>
          <div className={styles.sectionBody}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={styles.formRow}>
                <Skeleton variant="text" width="35%" height={12} />
                <Skeleton variant="rect" width={80} height={30} borderRadius={6} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
