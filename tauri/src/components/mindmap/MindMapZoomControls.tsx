// tauri/src/components/mindmap/MindMapZoomControls.tsx

import { useReactFlow, useOnViewportChange } from '@xyflow/react'
import { useState } from 'react'
import styles from './mindmap.module.css'

export function MindMapZoomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const [zoom, setZoom] = useState(100)

  // 响应式监听 viewport 变化
  useOnViewportChange({
    onChange: (viewport) => setZoom(Math.round(viewport.zoom * 100)),
  })

  return (
    <div className={styles.zoomControls}>
      <button className={styles.zoomBtn} onClick={() => zoomOut()} title="缩小">
        −
      </button>
      <button className={styles.zoomBtn} onClick={() => fitView({ padding: 0.2 })} title="适应">
        ○
      </button>
      <span className={styles.zoomLevel}>{zoom}%</span>
      <button className={styles.zoomBtn} onClick={() => zoomIn()} title="放大">
        +
      </button>
    </div>
  )
}
