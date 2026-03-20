import * as PIXI from 'pixi.js'
import type { CanvasNodeData } from '../../../lib/api/types'

const STATUS_COLORS: Record<string, number> = {
  confirmed: 0x10b981, discussing: 0xf59e0b, draft: 0x6b7280,
}
const STATUS_LABELS: Record<string, string> = {
  confirmed: '已确认', discussing: '讨论中', draft: '待讨论',
}

export class ModuleNode {
  container: PIXI.Container
  private _data: CanvasNodeData
  private _selected = false
  private _onDragEnd?: (id: string, x: number, y: number) => void
  private _onSelect?: (id: string) => void

  constructor(data: CanvasNodeData) {
    this._data = data
    this.container = new PIXI.Container()
    this.container.position.set(data.x, data.y)
    this.container.eventMode = 'static'
    this.container.cursor = 'grab'
    this._render()
    this._setupDrag()
  }

  get id() { return this._data.id }
  get data() { return this._data }

  update(patch: Partial<CanvasNodeData>) {
    Object.assign(this._data, patch)
    if (patch.x != null || patch.y != null) {
      this.container.position.set(this._data.x, this._data.y)
    }
    this._render()
  }

  setSelected(v: boolean) {
    if (this._selected === v) return
    this._selected = v
    this._render()
  }

  onDragEnd(cb: (id: string, x: number, y: number) => void) { this._onDragEnd = cb }
  onSelect(cb: (id: string) => void) { this._onSelect = cb }

  private _render() {
    this.container.removeChildren()
    const d = this._data
    const w = d.width || 200
    const h = d.height || this._calcHeight()
    const color = d.color || STATUS_COLORS[d.status || 'draft'] || 0x6b7280

    // Shadow
    const shadow = new PIXI.Graphics()
    shadow.roundRect(3, 3, w, h, 10)
    shadow.fill({ color: 0x000000, alpha: 0.2 })
    this.container.addChild(shadow)

    // Background
    const bg = new PIXI.Graphics()
    bg.roundRect(0, 0, w, h, 10)
    bg.fill({ color: 0x161622, alpha: 0.95 })
    bg.roundRect(0, 0, w, h, 10)
    bg.stroke({ width: this._selected ? 2 : 1, color: this._selected ? 0x007acc : color, alpha: this._selected ? 0.8 : 0.3 })
    bg.roundRect(0, 4, 4, h - 8, 2)
    bg.fill({ color })
    this.container.addChild(bg)

    // Header bg
    const headBg = new PIXI.Graphics()
    headBg.roundRect(1, 1, w - 2, 26, 9)
    headBg.fill({ color: 0x1a1a2a, alpha: 0.6 })
    this.container.addChild(headBg)

    // Title
    const titleStr = `${d.icon || ''} ${d.title}`.trim()
    const maxTitleLen = Math.floor((w - 70) / 7)
    const title = new PIXI.Text({
      text: titleStr.length > maxTitleLen ? titleStr.slice(0, maxTitleLen) + '…' : titleStr,
      style: { fontSize: 12, fill: 0xeeeeee, fontFamily: 'system-ui', fontWeight: '600' },
    })
    title.position.set(12, 5)
    this.container.addChild(title)

    // Status badge
    if (d.status) {
      const stColor = STATUS_COLORS[d.status] || 0x6b7280
      const label = STATUS_LABELS[d.status] || d.status
      const stBg = new PIXI.Graphics()
      stBg.roundRect(w - 50, 5, 44, 16, 8)
      stBg.fill({ color: stColor, alpha: 0.15 })
      this.container.addChild(stBg)
      const stText = new PIXI.Text({ text: label, style: { fontSize: 9, fill: stColor, fontFamily: 'system-ui' } })
      stText.position.set(w - 47, 7)
      this.container.addChild(stText)
    }

    // Features
    if (d.features) {
      d.features.forEach((f, i) => {
        const fy = 32 + i * 17
        if (fy + 14 > h) return
        const sym = new PIXI.Text({
          text: f.done ? '✓' : '○',
          style: { fontSize: 11, fill: f.done ? 0x10b981 : 0x555555, fontFamily: 'system-ui' },
        })
        sym.position.set(14, fy)
        this.container.addChild(sym)
        const ft = new PIXI.Text({
          text: f.text,
          style: { fontSize: 11, fill: 0xaaaaaa, fontFamily: 'system-ui' },
        })
        ft.position.set(28, fy)
        this.container.addChild(ft)
      })
    }
  }

  private _calcHeight(): number {
    const featureCount = this._data.features?.length || 0
    return Math.max(50, 36 + featureCount * 17)
  }

  private _setupDrag() {
    let dragging = false
    const doff = { x: 0, y: 0 }

    this.container.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      dragging = true
      this.container.cursor = 'grabbing'
      const parent = this.container.parent
      if (!parent) return
      const wp = parent.toLocal(e.global)
      doff.x = wp.x - this._data.x
      doff.y = wp.y - this._data.y
      this._onSelect?.(this._data.id)
      e.stopPropagation()
    })
    this.container.on('globalpointermove', (e: PIXI.FederatedPointerEvent) => {
      if (!dragging) return
      const parent = this.container.parent
      if (!parent) return
      const wp = parent.toLocal(e.global)
      this._data.x = wp.x - doff.x
      this._data.y = wp.y - doff.y
      this.container.position.set(this._data.x, this._data.y)
    })
    this.container.on('pointerup', () => {
      if (dragging) {
        dragging = false
        this.container.cursor = 'grab'
        this._onDragEnd?.(this._data.id, this._data.x, this._data.y)
      }
    })
    this.container.on('pointerupoutside', () => {
      dragging = false
      this.container.cursor = 'grab'
    })
  }
}
