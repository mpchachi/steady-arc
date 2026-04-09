import { CONFIG } from '@/config'
import type { GazePoint } from './types'

interface FilterState {
  x: number
  y: number
  lastTimestamp: number
  lastVelocity: number
  fixationStartX: number
  fixationStartY: number
  fixationStartTime: number
}

/** Pure class — no React dependency */
export class GazeFilter {
  private alpha: number
  private state: FilterState | null = null

  constructor(alpha: number = CONFIG.eyeTracking.emaAlpha) {
    this.alpha = alpha
  }

  setAlpha(alpha: number): void {
    this.alpha = Math.max(0, Math.min(1, alpha))
  }

  reset(): void {
    this.state = null
  }

  /**
   * Feed a raw gaze estimate. Returns the filtered GazePoint.
   * rawX, rawY are in screen pixels.
   */
  process(rawX: number, rawY: number, isBlinking: boolean, timestamp: number): Omit<GazePoint, 'confidence'> {
    if (this.state === null) {
      this.state = {
        x: rawX,
        y: rawY,
        lastTimestamp: timestamp,
        lastVelocity: 0,
        fixationStartX: rawX,
        fixationStartY: rawY,
        fixationStartTime: timestamp,
      }
    }

    const dt = Math.max(timestamp - this.state.lastTimestamp, 1)

    // EMA
    const filteredX = this.alpha * rawX + (1 - this.alpha) * this.state.x
    const filteredY = this.alpha * rawY + (1 - this.alpha) * this.state.y

    // Velocity in px/ms
    const dx = filteredX - this.state.x
    const dy = filteredY - this.state.y
    const velocity = Math.sqrt(dx * dx + dy * dy) / dt

    const isSaccade = velocity > CONFIG.eyeTracking.saccadeVelocityThreshold

    // Update fixation tracker
    const distFromFixationStart = Math.sqrt(
      (filteredX - this.state.fixationStartX) ** 2 +
      (filteredY - this.state.fixationStartY) ** 2,
    )
    const fixationRadiusPx = CONFIG.eyeTracking.fixationRadius * window.innerWidth
    if (distFromFixationStart > fixationRadiusPx) {
      this.state.fixationStartX = filteredX
      this.state.fixationStartY = filteredY
      this.state.fixationStartTime = timestamp
    }

    this.state.x = filteredX
    this.state.y = filteredY
    this.state.lastTimestamp = timestamp
    this.state.lastVelocity = velocity

    return {
      rawX,
      rawY,
      filteredX,
      filteredY,
      isSaccade,
      isBlinking,
      timestamp,
    }
  }

  /** Returns the current fixation duration in ms, or 0 if no stable fixation */
  getFixationDuration(now: number): number {
    if (!this.state) return 0
    return now - this.state.fixationStartTime
  }
}
