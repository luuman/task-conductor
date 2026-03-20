import { useTranslation } from 'react-i18next'
import { useDashboardData } from './hooks/useDashboardData'
import { ProjectOverview } from './components/ProjectOverview'
import { PipelineProgress } from './components/PipelineProgress'
import { TaskChart } from './components/TaskChart'
import { TaskDependencyGraph } from './components/TaskDependencyGraph'
import { ActivityTimeline } from './components/ActivityTimeline'
import { RecentSessions } from './components/RecentSessions'
import { KnowledgePreview } from './components/KnowledgePreview'
import { ArtifactPreview } from './components/ArtifactPreview'
import { FileTreePreview } from './components/FileTreePreview'
import styles from './dashboard.module.css'

export default function DashboardPage() {
  const { t } = useTranslation()
  const data = useDashboardData()

  if (!data.activeProjectId) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>{t('dashboard.no_project', '请选择一个项目')}</h2>
          <p className={styles.emptyHint}>{t('dashboard.no_project_hint', '从侧边栏选择或创建一个项目开始')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <div className={styles.main}>
          <ProjectOverview project={data.project} tasks={data.tasks} loading={data.loading} />
          <PipelineProgress tasks={data.tasks} loading={data.loading} />
          <TaskChart tasks={data.tasks} loading={data.loading} />
          <TaskDependencyGraph tasks={data.tasks} />
          <ActivityTimeline tasks={data.tasks} />
        </div>
        <div className={styles.aside}>
          <RecentSessions sessions={data.sessions} project={data.project} />
          <KnowledgePreview items={data.knowledge} />
          <ArtifactPreview tasks={data.tasks} />
          <FileTreePreview tree={data.fileTree} />
        </div>
      </div>
    </div>
  )
}
