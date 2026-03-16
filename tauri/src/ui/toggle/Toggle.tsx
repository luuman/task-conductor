import type { ButtonHTMLAttributes } from 'react'
import styles from './toggle.module.css'

export interface ToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean
  onChange?: (checked: boolean) => void
}

export function Toggle({ checked, onChange, className, disabled, ...props }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-checked={String(checked)}
      className={`${styles.track} ${className ?? ''}`}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      {...props}
    >
      <span className={styles.knob} />
    </button>
  )
}
