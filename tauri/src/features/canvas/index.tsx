import { useCanvasStore } from '../../lib/store/canvas'
import { TabBar } from './components/TabBar'
import { SplitLayout } from './components/SplitLayout'
import { PrdDocPanel } from './components/PrdDocPanel'
import styles from './canvas.module.css'

export default function CanvasPage() {
  const activeTabTaskId = useCanvasStore((s) => s.activeTabTaskId)
  const splitRatio = useCanvasStore((s) => s.splitRatio)
  const setSplitRatio = useCanvasStore((s) => s.setSplitRatio)
  const nodes = useCanvasStore((s) => s.nodes)
  const zoom = useCanvasStore((s) => s.zoom)

  return (
    <div className={styles.page}>
      <TabBar />
      {activeTabTaskId ? (
        <SplitLayout
          ratio={splitRatio}
          onRatioChange={setSplitRatio}
          left={
            <>
              <div className={styles.paneHeader}>
                <span className={styles.paneLabel}>需求画布</span>
                <span className={styles.paneBadge}>{nodes.length} 模块</span>
              </div>
              <div className={styles.canvasContainer} id="pixi-canvas-container">
                <div className={styles.canvasHud}>
                  <div className={styles.canvasChip}>缩放 <b>{Math.round(zoom * 100)}%</b></div>
                  <div className={styles.canvasChip}>模块 <b>{nodes.length}</b></div>
                </div>
                <div className={styles.empty}>pixi.js 画布加载中...</div>
              </div>
            </>
          }
          right={
            <PrdDocPanel taskId={activeTabTaskId} prdContent={null} />
          }
        />
      ) : (
        <div className={styles.empty}>
          点击 "+ 新需求" 或通过 AI 助手创建需求开始
        </div>
      )}
    </div>
  )
}
