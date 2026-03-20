import { useCanvasStore } from '../../lib/store/canvas'
import { TabBar } from './components/TabBar'
import { SplitLayout } from './components/SplitLayout'
import { CanvasPanel } from './components/CanvasPanel'
import { PrdDocPanel } from './components/PrdDocPanel'
import styles from './canvas.module.css'

export default function CanvasPage() {
  const activeTabTaskId = useCanvasStore((s) => s.activeTabTaskId)
  const splitRatio = useCanvasStore((s) => s.splitRatio)
  const setSplitRatio = useCanvasStore((s) => s.setSplitRatio)

  return (
    <div className={styles.page}>
      <TabBar />
      {activeTabTaskId ? (
        <SplitLayout
          ratio={splitRatio}
          onRatioChange={setSplitRatio}
          left={<CanvasPanel />}
          right={<PrdDocPanel taskId={activeTabTaskId} prdContent={null} />}
        />
      ) : (
        <div className={styles.empty}>
          点击 "+ 新需求" 或通过 AI 助手创建需求开始
        </div>
      )}
    </div>
  )
}
