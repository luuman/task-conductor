// ProjectSessions — 项目级会话页面
// 复用 SessionChat 组件，通过 filterByCwd 只展示当前项目相关的会话

import { useEffect, useState } from 'react'
import { SessionChat } from '../../components/SessionChat'
import { useAppStore } from '../../lib/store/app'
import { api } from '../../lib/api'

export default function ProjectSessions() {
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const [projectCwd, setProjectCwd] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!activeProjectId) { setProjectCwd(undefined); return }
    const pid = Number(activeProjectId)
    api.getProjects().then((projects) => {
      const proj = projects.find((p) => p.id === pid)
      if (proj?.repo_url) {
        setProjectCwd(proj.repo_url)
      }
    }).catch(() => {})
  }, [activeProjectId])

  return <SessionChat layout="full" filterByCwd={projectCwd} />
}
