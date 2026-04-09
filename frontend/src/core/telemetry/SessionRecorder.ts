import type { SessionData, SessionMetrics } from './types'
import type { TelemetryCollector } from './TelemetryCollector'

/** Pure class — no React dependency */
export class SessionRecorder {
  private sessionId: string
  private startTime: number
  private collector: TelemetryCollector

  constructor(collector: TelemetryCollector) {
    this.collector = collector
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    this.startTime = Date.now()
  }

  finalize(percentAreaExplored: number): SessionData {
    const endTime = Date.now()
    const samples = this.collector.getGazeSamples()
    const fixations = this.collector.getFixations()
    const saccades = this.collector.getSaccades()
    const totalDurationMs = endTime - this.startTime

    const meanFixation =
      fixations.length > 0
        ? fixations.reduce((s, f) => s + f.durationMs, 0) / fixations.length
        : 0

    const meanSaccadeAmp =
      saccades.length > 0
        ? saccades.reduce((s, sc) => s + sc.amplitude, 0) / saccades.length
        : 0

    const meanSaccadeVel =
      saccades.length > 0
        ? saccades.reduce((s, sc) => s + sc.velocity, 0) / saccades.length
        : 0

    const scanPath = fixations.map(f => ({ x: f.x, y: f.y, timestamp: f.startTime }))

    const metrics: SessionMetrics = {
      totalDurationMs,
      totalFixations: fixations.length,
      meanFixationDurationMs: meanFixation,
      totalSaccades: saccades.length,
      meanSaccadeAmplitude: meanSaccadeAmp,
      meanSaccadeVelocity: meanSaccadeVel,
      percentAreaExplored,
      scanPath,
      gazeHeatmap: this.collector.buildHeatmap(window.innerWidth, window.innerHeight),
    }

    return {
      sessionId: this.sessionId,
      startTime: this.startTime,
      endTime,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      gazeSamples: Array.from(samples),
      events: Array.from(this.collector.getEvents()),
      fixations: Array.from(fixations),
      saccades: Array.from(saccades),
      metrics,
    }
  }

  /** Download the session as a JSON file */
  static downloadSession(data: SessionData): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${data.sessionId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
}
