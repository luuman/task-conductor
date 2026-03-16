import { useTranslation } from 'react-i18next'
import styles from './status-bar.module.css'

interface StatusBarProps {
  language: string
  isUnsaved: boolean
  cursorLine?: number
  cursorCol?: number
}

export function StatusBar({ language, isUnsaved, cursorLine, cursorCol }: StatusBarProps) {
  const { t } = useTranslation()

  return (
    <div className={styles.bar}>
      <span className={styles.segment}>
        {cursorLine != null && cursorCol != null
          ? `Ln ${cursorLine}, Col ${cursorCol}`
          : ''}
      </span>
      <span className={styles.spacer} />
      <span className={isUnsaved ? styles.unsaved : styles.saved}>
        {isUnsaved ? t('editor.unsaved') : t('editor.saved')}
      </span>
      <span className={styles.segment}>{language}</span>
      <span className={styles.segment}>UTF-8</span>
    </div>
  )
}
