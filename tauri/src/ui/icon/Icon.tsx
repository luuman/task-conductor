import type { SVGAttributes } from 'react'

export interface IconProps extends SVGAttributes<SVGElement> {
  size?: number
  color?: string
}

export function Icon({
  size = 16,
  color = 'currentColor',
  children,
  ...props
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  )
}
