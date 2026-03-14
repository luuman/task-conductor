import { lazy, Suspense } from 'react'
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { isTauri } from '../lib/tauri'
import { Layout } from './Layout'
import { PageLoading } from './PageLoading'

const AuthPage      = lazy(() => import('../features/auth'))
const DashboardPage = lazy(() => import('../features/dashboard'))

const PlaceholderPage = lazy(() =>
  Promise.resolve({ default: () => <div className="p-8 text-muted-foreground">Coming soon</div> })
)

const RouterComponent = isTauri() ? HashRouter : BrowserRouter

export function AppRouter() {
  return (
    <RouterComponent>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/tasks/:id"    element={<PlaceholderPage />} />
            <Route path="/task-manager" element={<PlaceholderPage />} />
            <Route path="/sessions"     element={<PlaceholderPage />} />
            <Route path="/chat"         element={<PlaceholderPage />} />
            <Route path="/config"       element={<PlaceholderPage />} />
            <Route path="/knowledge"    element={<PlaceholderPage />} />
            <Route path="/mcp"          element={<PlaceholderPage />} />
            <Route path="/files"        element={<PlaceholderPage />} />
            <Route path="/git"          element={<PlaceholderPage />} />
            <Route path="/canvas"       element={<PlaceholderPage />} />
            <Route path="/settings"     element={<PlaceholderPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </RouterComponent>
  )
}
