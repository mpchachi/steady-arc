import { CONFIG } from '@/config'

/** Manages a persistent fog-of-war mask on an offscreen canvas */
export class FogOfWar {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private revealedCanvas: HTMLCanvasElement
  private revealedCtx: CanvasRenderingContext2D
  private lastRevealX = -9999
  private lastRevealY = -9999
  private readonly minMoveThreshold = 4 // px — don't re-sample if barely moved

  constructor(width: number, height: number) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height
    this.ctx = this.canvas.getContext('2d')!
    // Track which pixels have been revealed
    this.revealedCanvas = document.createElement('canvas')
    this.revealedCanvas.width = width
    this.revealedCanvas.height = height
    this.revealedCtx = this.revealedCanvas.getContext('2d')!

    this.reset()
  }

  reset(): void {
    const { width, height } = this.canvas
    // Fill with opaque fog
    this.ctx.fillStyle = `rgba(8, 8, 18, ${CONFIG.lantern.fogOpacity})`
    this.ctx.fillRect(0, 0, width, height)
    // Clear revealed tracking
    this.revealedCtx.clearRect(0, 0, width, height)
    this.lastRevealX = -9999
    this.lastRevealY = -9999
  }

  /** Reveal a circular area around (x, y) with feathering */
  reveal(x: number, y: number): void {
    const dx = x - this.lastRevealX
    const dy = y - this.lastRevealY
    if (dx * dx + dy * dy < this.minMoveThreshold * this.minMoveThreshold) return

    this.lastRevealX = x
    this.lastRevealY = y

    const { radius, featherWidth } = CONFIG.lantern
    const inner = radius - featherWidth

    // Cut a hole in the fog using a radial gradient
    const grad = this.ctx.createRadialGradient(x, y, inner > 0 ? inner : 0, x, y, radius)
    grad.addColorStop(0, 'rgba(0,0,0,1)')       // fully transparent (destination-out)
    grad.addColorStop(1, 'rgba(0,0,0,0)')

    this.ctx.globalCompositeOperation = 'destination-out'
    this.ctx.fillStyle = grad
    this.ctx.beginPath()
    this.ctx.arc(x, y, radius, 0, Math.PI * 2)
    this.ctx.fill()
    this.ctx.globalCompositeOperation = 'source-over'

    // Mark as revealed in tracking canvas
    this.revealedCtx.globalCompositeOperation = 'source-over'
    const rGrad = this.revealedCtx.createRadialGradient(x, y, 0, x, y, inner > 0 ? inner : radius)
    rGrad.addColorStop(0, 'rgba(255,255,255,1)')
    rGrad.addColorStop(1, 'rgba(255,255,255,0)')
    this.revealedCtx.fillStyle = rGrad
    this.revealedCtx.beginPath()
    this.revealedCtx.arc(x, y, radius, 0, Math.PI * 2)
    this.revealedCtx.fill()
  }

  /** Sample the revealed percentage (expensive — call max once per second) */
  sampleRevealedPercent(): number {
    const { width, height } = this.revealedCanvas
    // Sample a grid of points instead of reading every pixel
    const step = 8
    let sampled = 0
    let revealed = 0
    const data = this.revealedCtx.getImageData(0, 0, width, height).data
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = (y * width + x) * 4
        if ((data[idx + 3] ?? 0) > 128) revealed++
        sampled++
      }
    }
    return sampled > 0 ? revealed / sampled : 0
  }

  /** Draw the fog canvas onto a destination canvas context */
  drawOnto(ctx: CanvasRenderingContext2D, x = 0, y = 0): void {
    ctx.drawImage(this.canvas, x, y)
  }

  /** Draw the lantern glow ring (visual effect, separate from reveal) */
  drawLanternGlow(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const { radius } = CONFIG.lantern
    const glowGrad = ctx.createRadialGradient(x, y, radius * 0.6, x, y, radius * 1.4)
    glowGrad.addColorStop(0, 'rgba(255, 220, 100, 0.15)')
    glowGrad.addColorStop(1, 'rgba(255, 150, 50, 0)')
    ctx.fillStyle = glowGrad
    ctx.beginPath()
    ctx.arc(x, y, radius * 1.4, 0, Math.PI * 2)
    ctx.fill()
  }

  get canvas2d(): HTMLCanvasElement { return this.canvas }
}
