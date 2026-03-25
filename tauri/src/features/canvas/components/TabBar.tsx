import { useCanvasStore } from '../../../lib/store/canvas'
import { IconX } from '../../../ui/icon'
import styles from '../canvas.module.css'

const STATUS_COLORS: Record<string, string> = {
  active: '#10b981', waiting: '#f59e0b', done: '#3b82f6', draft: '#6b7280',
}

export function TabBar() {
  const tabs = useCanvasStore((s) => s.tabs)
  const activeTabTaskId = useCanvasStore((s) => s.activeTabTaskId)
  const setActiveTab = useCanvasStore((s) => s.setActiveTab)
  const removeTab = useCanvasStore((s) => s.removeTab)

  return (
    <div className={styles.tabBar}>
      {tabs.map((tab) => (
        <div
          key={tab.taskId}
          className={`${styles.tab} ${tab.taskId === activeTabTaskId ? styles.tabActive : ''}`}
          onClick={() => setActiveTab(tab.taskId)}
        >
          <span className={styles.tabDot} style={{ background: STATUS_COLORS[tab.status] || '#6b7280' }} />
          <span className={styles.tabTitle}>{tab.title}</span>
          <button
            className={styles.tabClose}
            onClick={(e) => { e.stopPropagation(); removeTab(tab.taskId) }}
          >×</button>
        </div>
      ))}
      <div className={styles.tabBarRight}>
        <button className={styles.tabBarBtn}>+ 新需求</button>
      </div>
    </div>
  )
}
