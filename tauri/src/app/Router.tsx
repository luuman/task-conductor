import { lazy, Suspense } from 'react'
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { isTauri } from '../lib/tauri'
import { Layout } from './Layout'
import { PageLoading } from './PageLoading'
import { ProtectedRoute } from './ProtectedRoute'
import { ProjectGate } from './ProjectGate'

const AuthPage          = lazy(() => import('../features/auth'))
const DashboardPage     = lazy(() => import('../features/dashboard'))
const SettingsPage      = lazy(() => import('../features/settings'))
const ProjectSelector   = lazy(() => import('../features/project-selector'))

const PlaceholderPage = lazy(() =>
  Promise.resolve({ default: () => <div className="placeholder-page">Coming soon</div> })
)

const RouterComponent = isTauri() ? HashRouter : BrowserRouter

export function AppRouter() {
  return (
    <RouterComponent>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route
            element={
              <ProtectedRoute>
                <ProjectGate
                  fallback={<ProjectSelector />}
                >
                  <Layout />
                </ProjectGate>
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/task/:id"         element={<PlaceholderPage />} />
            <Route path="/task-manager" element={<PlaceholderPage />} />
            <Route path="/sessions"     element={<PlaceholderPage />} />
            <Route path="/chat"         element={<PlaceholderPage />} />
            <Route path="/admin"        element={<PlaceholderPage />} />
            <Route path="/config"       element={<PlaceholderPage />} />
            <Route path="/knowledge"    element={<PlaceholderPage />} />
            <Route path="/mcp"          element={<PlaceholderPage />} />
            <Route path="/files"        element={<PlaceholderPage />} />
            <Route path="/git"          element={<PlaceholderPage />} />
            <Route path="/canvas"       element={<PlaceholderPage />} />
            <Route path="/settings"     element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </RouterComponent>
  )
}
