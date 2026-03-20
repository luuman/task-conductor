import * as PIXI from 'pixi.js'

export class PixiCanvas {
  app: PIXI.Application
  world: PIXI.Container
  private _zoom = 1
  private _panX = 60
  private _panY = 30
  private _isPanning = false
  private _lastPan = { x: 0, y: 0 }
  private _onZoomChange?: (zoom: number) => void
  private _onPanChange?: (x: number, y: number) => void
  private _cleanupFns: (() => void)[] = []

  constructor() {
    this.app = new PIXI.Application()
    this.world = new PIXI.Container()
  }

  async init(container: HTMLElement) {
    await this.app.init({
      resizeTo: container,
      background: 0x0b0b12,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })
    container.appendChild(this.app.canvas as HTMLCanvasElement)
    this.app.stage.addChild(this.world)
    this.app.stage.eventMode = 'static'
    this._setupPanZoom()
    this._updateTransform()
  }

  destroy() {
    this._cleanupFns.forEach((fn) => fn())
    this._cleanupFns = []
    this.app.destroy(true)
  }

  get zoom() { return this._zoom }
  get panX() { return this._panX }
  get panY() { return this._panY }

  setZoom(z: number) { this._zoom = z; this._updateTransform() }
  setPan(x: number, y: number) { this._panX = x; this._panY = y; this._updateTransform() }
  onZoomChange(cb: (z: number) => void) { this._onZoomChange = cb }
  onPanChange(cb: (x: number, y: number) => void) { this._onPanChange = cb }

  fitAll(nodes: { x: number; y: number; width: number; height: number }[]) {
    if (!nodes.length) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    nodes.forEach((n) => {
      minX = Math.min(minX, n.x)
      minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + n.width)
      maxY = Math.max(maxY, n.y + n.height)
    })
    const w = maxX - minX + 100, h = maxY - minY + 100
    const sw = this.app.screen.width, sh = this.app.screen.height
    this._zoom = Math.min(sw / w, sh / h, 1.5)
    this._panX = (sw - w * this._zoom) / 2 - minX * this._zoom
    this._panY = (sh - h * this._zoom) / 2 - minY * this._zoom
    this._updateTransform()
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this._panX) / this._zoom,
      y: (sy - this._panY) / this._zoom,
    }
  }

  private _updateTransform() {
    this.world.scale.set(this._zoom)
    this.world.position.set(this._panX, this._panY)
    this._onZoomChange?.(this._zoom)
    this._onPanChange?.(this._panX, this._panY)
  }

  private _setupPanZoom() {
    const canvas = this.app.canvas as HTMLCanvasElement

    const onPointerDown = (e: PointerEvent) => {
      // 只在直接点击 canvas 时平移（不在节点上）
      if (e.target === canvas) {
        this._isPanning = true
        this._lastPan = { x: e.clientX, y: e.clientY }
      }
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!this._isPanning) return
      this._panX += e.clientX - this._lastPan.x
      this._panY += e.clientY - this._lastPan.y
      this._lastPan = { x: e.clientX, y: e.clientY }
      this._updateTransform()
    }
    const onPointerUp = () => { this._isPanning = false }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.93 : 1.07
      const old = this._zoom
      this._zoom = Math.max(0.1, Math.min(3, this._zoom * factor))
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      this._panX = mx - (mx - this._panX) * (this._zoom / old)
      this._panY = my - (my - this._panY) * (this._zoom / old)
      this._updateTransform()
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    this._cleanupFns.push(() => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
    })
  }
}
