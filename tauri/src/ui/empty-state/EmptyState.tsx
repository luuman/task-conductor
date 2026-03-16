import styles from './empty-state.module.css'

export interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  secondaryAction?: { label: string; onClick: () => void }
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={`${styles.root}${className ? ` ${className}` : ''}`}>
      {icon && (
        <div className={styles.iconWrap}>
          <span>{icon}</span>
        </div>
      )}
      <div className={styles.title}>{title}</div>
      {description && <div className={styles.description}>{description}</div>}
      {(action || secondaryAction) && (
        <div className={styles.actions}>
          {action && (
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
