import styles from './radio-group.module.css'

export interface RadioOption {
  value: string
  label: string
  description?: string
  icon?: string
  disabled?: boolean
}

export interface RadioGroupProps {
  options: RadioOption[]
  value: string
  onChange: (value: string) => void
  layout?: 'horizontal' | 'vertical' | 'grid'
  size?: 'sm' | 'md'
  className?: string
}

export function RadioGroup({
  options,
  value,
  onChange,
  layout = 'vertical',
  size = 'md',
  className,
}: RadioGroupProps) {
  const isGrid = layout === 'grid'

  const containerClasses = isGrid
    ? [styles.grid, className].filter(Boolean).join(' ')
    : [styles.group, styles[layout], className].filter(Boolean).join(' ')

  const sizeClass = size === 'sm' ? styles.optionSm : styles.optionMd

  return (
    <div className={containerClasses} role="radiogroup">
      {options.map((option) => {
        const isSelected = option.value === value
        const isDisabled = option.disabled === true

        const optionClasses = [
          styles.option,
          sizeClass,
          isSelected && styles.selected,
          isDisabled && styles.disabled,
        ].filter(Boolean).join(' ')

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-disabled={isDisabled}
            className={optionClasses}
            onClick={() => {
              if (!isDisabled) onChange(option.value)
            }}
          >
            <span className={styles.radio}>
              {isSelected && <span className={styles.dot} />}
            </span>
            <span className={styles.content}>
              <span className={styles.label}>
                {option.icon && <span className={styles.icon}>{option.icon}</span>}
                {option.label}
              </span>
              {option.description && (
                <span className={styles.description}>{option.description}</span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
