import type { SVGAttributes } from 'react'

interface LogoProps extends SVGAttributes<SVGElement> {
  size?: number
}

export function IconLogo({ size = 24, ...props }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      {...props}
    >
      <path
        d="M12 2L4 7v10l8 5 8-5V7l-8-5z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <path
        d="M12 8v8M8 10l4 2 4-2"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
