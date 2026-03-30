import { lazy, Suspense } from 'react'
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { isTauri } from '../lib/tauri'
import { useUiNavigate } from '../hooks/useUiNavigate'
import { Layout } from './Layout'
import { ProtectedRoute } from './ProtectedRoute'
import { ProjectGate } from './ProjectGate'

const AuthPage          = lazy(() => import('../features/auth'))
const DashboardPage     = lazy(() => import('../features/dashboard'))
const SettingsPage      = lazy(() => import('../features/settings'))
const ProjectSelector   = lazy(() => import('../features/project-selector'))
const AdminLayout       = lazy(() => import('../features/admin/AdminLayout'))
const AdminDashboard    = lazy(() => import('../features/admin/pages/AdminDashboard'))
const AdminClaudeConfig = lazy(() => import('../features/admin/pages/AdminClaudeConfig'))
const AdminSettings     = lazy(() => import('../features/admin/pages/AdminSettings'))
const AdminSessions     = lazy(() => import('../features/admin/pages/AdminSessions'))
const AdminMindMap      = lazy(() => import('../features/admin/pages/AdminMindMap'))
const AdminServerMonitor = lazy(() => import('../features/admin/pages/AdminServerMonitor'))
const AdminChat         = lazy(() => import('../features/admin/pages/AdminChat'))
const FilesPage         = lazy(() => import('../features/files'))
const GitPage           = lazy(() => import('../features/git'))
const TaskManagerPage   = lazy(() => import('../features/task-manager'))
const TaskDetailPage    = lazy(() => import('../features/task-detail'))
const CanvasPage        = lazy(() => import('../features/canvas'))
const SessionsPage      = lazy(() => import('../features/sessions'))
const ChatReportPage    = lazy(() => import('../features/chat'))
const DocsDemoPage      = lazy(() => import('../features/docs-demo'))
const ProjectGraphPage  = lazy(() => import('../features/project-graph/ProjectGraphPage'))
const VersionBoardPage  = lazy(() => import('../features/version-board'))

function PlaceholderPageComponent() {
  const { t } = useTranslation()
  return <div className="placeholder-page">{t('admin_extra.coming_soon')}</div>
}
const PlaceholderPage = lazy(() =>
  Promise.resolve({ default: PlaceholderPageComponent })
)

// Dev-only pages (tree-shaken in production)
const DevToolsPage = import.meta.env.DEV
  ? lazy(() => import('../features/__dev__/DevToolsPage'))
  : null

const RouterComponent = isTauri() ? HashRouter : BrowserRouter

function NavigateListener() {
  useUiNavigate()
  return null
}

export function AppRouter() {
  return (
    <RouterComponent>
      <NavigateListener />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/login" element={<AuthPage />} />

          {/* 管理后台（独立布局，不需要选中项目） */}
          <Route
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/admin"              element={<AdminDashboard />} />
            <Route path="/admin/claude-config" element={<AdminClaudeConfig />} />
            <Route path="/admin/settings"     element={<AdminSettings />} />
            <Route path="/admin/sessions"     element={<AdminSessions />} />
            <Route path="/admin/mindmap"      element={<AdminMindMap />} />
            <Route path="/admin/server"      element={<AdminServerMonitor />} />
            <Route path="/admin/chat"        element={<AdminChat />} />
            {DevToolsPage && <Route path="/admin/dev" element={<DevToolsPage />} />}
            <Route path="/admin/docs-demo" element={<DocsDemoPage />} />
            <Route path="/admin/project-graph" element={<ProjectGraphPage />} />
          </Route>

          {/* 项目工作台（需要选中项目） */}
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
            <Route path="/task/:id"       element={<TaskDetailPage />} />
            <Route path="/task-manager"   element={<TaskManagerPage />} />
            <Route path="/sessions"       element={<SessionsPage />} />
            <Route path="/chat"           element={<ChatReportPage />} />
            <Route path="/config"         element={<PlaceholderPage />} />
            <Route path="/knowledge"      element={<PlaceholderPage />} />
            <Route path="/mcp"            element={<PlaceholderPage />} />
            <Route path="/files"          element={<FilesPage />} />
            <Route path="/git"            element={<GitPage />} />
            <Route path="/canvas"         element={<CanvasPage />} />
            <Route path="/versions"        element={<VersionBoardPage />} />
            <Route path="/settings"       element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </RouterComponent>
  )
}
