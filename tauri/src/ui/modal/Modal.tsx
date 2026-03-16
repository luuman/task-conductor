import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './modal.module.css'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
}: ModalProps) {
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const cardClasses = [
    styles.card,
    styles[size],
    className,
  ].filter(Boolean).join(' ')

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={cardClasses} onClick={(e) => e.stopPropagation()}>
        {(title || description) && (
          <div className={styles.header}>
            {title && <h2 className={styles.title}>{title}</h2>}
            {description && <p className={styles.description}>{description}</p>}
            <button className={styles.close} onClick={onClose} aria-label="Close">
              &times;
            </button>
          </div>
        )}
        {!title && !description && (
          <button
            className={styles.close}
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        )}
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
