import { Outlet } from 'react-router-dom'

export function Layout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <aside className="w-56 shrink-0 border-r border-border bg-background">
        <div className="p-4 text-sm text-muted-foreground">Sidebar</div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
