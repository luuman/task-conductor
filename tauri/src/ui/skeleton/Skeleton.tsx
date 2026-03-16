import styles from './skeleton.module.css'

export interface SkeletonProps {
  width?: string | number
  height?: string | number
  borderRadius?: string | number
  className?: string
  variant?: 'text' | 'rect' | 'circle'
}

export function Skeleton({
  width,
  height,
  borderRadius,
  className,
  variant = 'rect',
}: SkeletonProps) {
  const style: React.CSSProperties = {}

  if (variant === 'circle') {
    const size = width ?? height ?? 32
    style.width = size
    style.height = size
    style.borderRadius = '50%'
  } else {
    if (width) style.width = width
    if (height) style.height = height
    if (borderRadius) style.borderRadius = borderRadius
    if (variant === 'text') {
      style.height = height ?? '1em'
      style.borderRadius = borderRadius ?? 4
    }
  }

  return (
    <div
      className={`${styles.skeleton} ${className ?? ''}`}
      style={style}
    />
  )
}

export function SkeletonCard({ children, className }: {
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={`${styles.card} ${className ?? ''}`}>
      {children}
    </div>
  )
}
