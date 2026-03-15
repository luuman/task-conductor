import styles from './page-loading.module.css'

export function PageLoading() {
  return (
    <div className={styles.container}>
      <div className={styles.spinner} />
    </div>
  )
}
