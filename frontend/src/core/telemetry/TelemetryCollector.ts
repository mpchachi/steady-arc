import type { GazeSample, TelemetryEvent, GameEventType, FixationRecord, SaccadeRecord } from './types'
import { CONFIG } from '@/config'

/** Pure class — no React dependency */
export class TelemetryCollector {
  private gazeSamples: GazeSample[] = []
  private events: TelemetryEvent[] = []
  private fixations: FixationRecord[] = []
  private saccades: SaccadeRecord[] = []
  private lastSampleTime = 0

  // Fixation tracking
  private fixationStart: number | null = null
  private fixationX = 0
  private fixationY = 0

  // Saccade tracking
  private lastGazeX = 0
  private lastGazeY = 0
  private saccadeStart: number | null = null
  private saccadeFromX = 0
  private saccadeFromY = 0

  reset(): void {
    this.gazeSamples = []
    this.events = []
    this.fixations = []
    this.saccades = []
    this.lastSampleTime = 0
    this.fixationStart = null
    this.saccadeStart = null
  }

  recordGazeSample(sample: GazeSample): void {
    const interval = CONFIG.telemetry.sampleIntervalMs
    if (interval > 0 && sample.timestamp - this.lastSampleTime < interval) return

    this.gazeSamples.push(sample)
    this.lastSampleTime = sample.timestamp

    this.updateFixationTracking(sample)
    this.updateSaccadeTracking(sample)
  }

  private updateFixationTracking(sample: GazeSample): void {
    if (sample.isBlinking || sample.isSaccade) {
      // Close any open fixation
      if (this.fixationStart !== null) {
        const dur = sample.timestamp - this.fixationStart
        if (dur >= CONFIG.eyeTracking.minFixationMs) {
          this.fixations.push({
            startTime: this.fixationStart,
            endTime: sample.timestamp,
            x: this.fixationX,
            y: this.fixationY,
            durationMs: dur,
          })
        }
        this.fixationStart = null
      }
      return
    }

    if (this.fixationStart === null) {
      this.fixationStart = sample.timestamp
      this.fixationX = sample.filteredGazeX
      this.fixationY = sample.filteredGazeY
    } else {
      // Update mean position
      this.fixationX = (this.fixationX + sample.filteredGazeX) / 2
      this.fixationY = (this.fixationY + sample.filteredGazeY) / 2
    }
  }

  private updateSaccadeTracking(sample: GazeSample): void {
    if (sample.isSaccade) {
      if (this.saccadeStart === null) {
        this.saccadeStart = sample.timestamp
        this.saccadeFromX = this.lastGazeX
        this.saccadeFromY = this.lastGazeY
      }
    } else {
      if (this.saccadeStart !== null) {
        const dx = sample.filteredGazeX - this.saccadeFromX
        const dy = sample.filteredGazeY - this.saccadeFromY
        const amplitude = Math.sqrt(dx * dx + dy * dy)
        const duration = Math.max(sample.timestamp - this.saccadeStart, 1)
        this.saccades.push({
          startTime: this.saccadeStart,
          amplitude,
          velocity: amplitude / duration,
          fromX: this.saccadeFromX,
          fromY: this.saccadeFromY,
          toX: sample.filteredGazeX,
          toY: sample.filteredGazeY,
        })
        this.saccadeStart = null
      }
    }
    this.lastGazeX = sample.filteredGazeX
    this.lastGazeY = sample.filteredGazeY
  }

  recordEvent(type: GameEventType, data: Record<string, unknown> = {}): void {
    this.events.push({ timestamp: performance.now(), type, data })
  }

  getGazeSamples(): readonly GazeSample[] { return this.gazeSamples }
  getEvents(): readonly TelemetryEvent[] { return this.events }
  getFixations(): readonly FixationRecord[] { return this.fixations }
  getSaccades(): readonly SaccadeRecord[] { return this.saccades }

  /** Compute a simple heatmap grid (buckets of ~50px) */
  buildHeatmap(screenW: number, screenH: number, bucketSize = 50) {
    const cols = Math.ceil(screenW / bucketSize)
    const rows = Math.ceil(screenH / bucketSize)
    const grid = new Float32Array(cols * rows)

    for (const s of this.gazeSamples) {
      if (s.isBlinking) continue
      const col = Math.floor(s.filteredGazeX / bucketSize)
      const row = Math.floor(s.filteredGazeY / bucketSize)
      if (col >= 0 && col < cols && row >= 0 && row < rows) {
        grid[row * cols + col]++
      }
    }

    const result: Array<{ x: number; y: number; weight: number }> = []
    const max = Math.max(...Array.from(grid), 1)
    for (let i = 0; i < grid.length; i++) {
      if (grid[i]! > 0) {
        result.push({
          x: (i % cols) * bucketSize + bucketSize / 2,
          y: Math.floor(i / cols) * bucketSize + bucketSize / 2,
          weight: grid[i]! / max,
        })
      }
    }
    return result
  }
}
