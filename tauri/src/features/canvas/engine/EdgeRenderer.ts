import * as PIXI from 'pixi.js'
import type { CanvasEdgeData } from '../../../lib/api/types'

interface NodeRect {
  x: number
  y: number
  width: number
  height: number
}

export class EdgeRenderer {
  graphics: PIXI.Graphics

  constructor() {
    this.graphics = new PIXI.Graphics()
  }

  draw(edges: CanvasEdgeData[], nodes: Map<string, NodeRect>) {
    this.graphics.clear()
    edges.forEach((edge) => {
      const src = nodes.get(edge.source)
      const tgt = nodes.get(edge.target)
      if (!src || !tgt) return
      const sx = src.x + src.width
      const sy = src.y + src.height / 2
      const ex = tgt.x
      const ey = tgt.y + tgt.height / 2
      const mx = (sx + ex) / 2
      this.graphics.moveTo(sx, sy)
      this.graphics.bezierCurveTo(mx, sy, mx, ey, ex, ey)
      this.graphics.stroke({ width: 1.5, color: edge.color || 0x007acc, alpha: 0.35 })
    })
  }
}
