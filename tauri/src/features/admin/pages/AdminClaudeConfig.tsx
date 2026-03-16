import { lazy, Suspense } from 'react'
import { Skeleton } from '../../../ui/skeleton/Skeleton'

const ClaudeConfigPage = lazy(() => import('../claude-config/ClaudeConfigPage'))

export default function AdminClaudeConfig() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Skeleton variant="text" width="30%" height={24} />
          <Skeleton variant="rect" width="100%" height={200} borderRadius={10} />
        </div>
      }
    >
      <ClaudeConfigPage />
    </Suspense>
  )
}
