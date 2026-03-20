import { useEffect, useRef, useCallback } from 'react'
import { useCanvasStore } from '../../../lib/store/canvas'
import { PixiCanvas } from '../engine/PixiCanvas'
import { ModuleNode } from '../engine/ModuleNode'
import { EdgeRenderer } from '../engine/EdgeRenderer'
import styles from '../canvas.module.css'

export function CanvasPanel() {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<PixiCanvas | null>(null)
  const nodesMapRef = useRef<Map<string, ModuleNode>>(new Map())
  const edgeRendererRef = useRef<EdgeRenderer | null>(null)

  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)
  const zoom = useCanvasStore((s) => s.zoom)

  // 初始化 pixi
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    // 清空之前的 canvas
    const existingCanvas = el.querySelector('canvas')
    if (existingCanvas) existingCanvas.remove()

    const engine = new PixiCanvas()
    engineRef.current = engine
    const edgeRenderer = new EdgeRenderer()
    edgeRendererRef.current = edgeRenderer

    engine.init(el).then(() => {
      engine.world.addChildAt(edgeRenderer.graphics, 0)
      engine.onZoomChange((z) => useCanvasStore.getState().setZoom(z))
    })

    return () => {
      nodesMapRef.current.clear()
      engine.destroy()
      engineRef.current = null
    }
  }, [])

  const redrawEdges = useCallback(() => {
    const er = edgeRendererRef.current
    if (!er) return
    const nodeMap = new Map<string, { x: number; y: number; width: number; height: number }>()
    nodesMapRef.current.forEach((node, id) => {
      const d = node.data
      nodeMap.set(id, { x: d.x, y: d.y, width: d.width || 200, height: d.height || 100 })
    })
    er.draw(useCanvasStore.getState().edges, nodeMap)
  }, [])

  // 同步节点到 pixi
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return

    const currentIds = new Set(nodes.map((n) => n.id))
    const map = nodesMapRef.current

    // 删除不存在的
    for (const [id, node] of map) {
      if (!currentIds.has(id)) {
        engine.world.removeChild(node.container)
        map.delete(id)
      }
    }

    // 添加/更新
    for (const data of nodes) {
      let node = map.get(data.id)
      if (!node) {
        node = new ModuleNode(data)
        node.onDragEnd((id, x, y) => {
          useCanvasStore.getState().updateNode(id, { x, y })
          redrawEdges()
        })
        node.onSelect((id) => useCanvasStore.getState().setSelection([id]))
        map.set(data.id, node)
        engine.world.addChild(node.container)
      } else {
        node.update(data)
      }
    }

    redrawEdges()
  }, [nodes, edges, redrawEdges])

  const handleFitAll = useCallback(() => {
    engineRef.current?.fitAll(
      nodes.map((n) => ({ x: n.x, y: n.y, width: n.width || 200, height: n.height || 100 }))
    )
  }, [nodes])

  return (
    <>
      <div className={styles.paneHeader}>
        <span className={styles.paneLabel}>需求画布</span>
        <span className={styles.paneBadge}>{nodes.length} 模块</span>
      </div>
      <div ref={containerRef} className={styles.canvasContainer}>
        <div className={styles.canvasTools}>
          <button className={styles.canvasToolBtn} onClick={handleFitAll}>适应屏幕</button>
        </div>
        <div className={styles.canvasHud}>
          <div className={styles.canvasChip}>缩放 <b>{Math.round(zoom * 100)}%</b></div>
          <div className={styles.canvasChip}>模块 <b>{nodes.length}</b></div>
        </div>
      </div>
    </>
  )
}
