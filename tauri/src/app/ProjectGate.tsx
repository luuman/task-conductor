import type { ReactNode } from 'react'
import { useAppStore } from '../lib/store/app'

interface ProjectGateProps {
  children: ReactNode
  fallback: ReactNode
}

export function ProjectGate({ children, fallback }: ProjectGateProps) {
  const activeProjectId = useAppStore((s) => s.activeProjectId)

  if (!activeProjectId) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
