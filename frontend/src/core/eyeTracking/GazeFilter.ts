import { CONFIG } from '@/config'

// ── 1D Kalman filter (constant-velocity model) ───────────────────────────────
//
// State:       [position (px), velocity (px/s)]
// Transition:  F = [[1, dt], [0, 1]]
// Observation: H = [1, 0]  (we observe position directly)
// Process noise Q affects only velocity (position is deterministic given velocity)
// Measurement noise R = measurement variance in px²

class Kalman1D {
  private state = [0, 0]                   // [pos, vel]
  private P = [[100, 0], [0, 100]]         // error covariance

  constructor(
    private R: number,          // measurement noise variance (px²)
    private sigmaVel: number,   // velocity process noise std (px/s per √s)
  ) {}

  get position(): number { return this.state[0]! }
  get velocity(): number { return this.state[1]! }

  update(measurement: number, dt: number): number {
    if (!Number.isFinite(measurement)) return this.state[0]!

    const dt2 = dt * dt
    const qVel = this.sigmaVel * this.sigmaVel * dt  // Q[1][1]

    // ── Predict ─────────────────────────────────────────────────────────────
    const xPred = this.state[0]! + this.state[1]! * dt
    const vPred = this.state[1]!

    // P_pred = F * P * F^T + Q
    //   F = [[1, dt], [0, 1]]
    //   Q = [[0, 0], [0, qVel]]
    const p00 = this.P[0]![0]! + dt * (this.P[1]![0]! + this.P[0]![1]!) + dt2 * this.P[1]![1]!
    const p01 = this.P[0]![1]! + dt * this.P[1]![1]!
    const p10 = this.P[1]![0]! + dt * this.P[1]![1]!
    const p11 = this.P[1]![1]! + qVel

    // ── Update ──────────────────────────────────────────────────────────────
    // H = [1, 0]  →  S = H * P_pred * H^T + R = p00 + R
    const S  = p00 + this.R
    const k0 = p00 / S   // Kalman gain for position
    const k1 = p10 / S   // Kalman gain for velocity

    const innovation = measurement - xPred

    this.state[0] = xPred + k0 * innovation
    this.state[1] = vPred + k1 * innovation

    // P = (I - K * H) * P_pred
    this.P[0]![0] = (1 - k0) * p00
    this.P[0]![1] = (1 - k0) * p01
    this.P[1]![0] = p10 - k1 * p00
    this.P[1]![1] = p11 - k1 * p01

    return this.state[0]!
  }

  resetTo(pos: number): void {
    this.state = [pos, 0]
    this.P = [[100, 0], [0, 100]]
  }
}

// ── Main gaze filter ─────────────────────────────────────────────────────────

interface FilterState {
  fixationStartX: number
  fixationStartY: number
  fixationStartTime: number
}

/** Pure class — no React dependency */
export class GazeFilter {
  private xKalman: Kalman1D
  private yKalman: Kalman1D
  private lastTimestamp: number | null = null
  private initialized = false
  private fixation: FilterState | null = null

  constructor() {
    this.xKalman = new Kalman1D(
      CONFIG.eyeTracking.kalmanMeasurementNoise,
      CONFIG.eyeTracking.kalmanVelocityNoise,
    )
    this.yKalman = new Kalman1D(
      CONFIG.eyeTracking.kalmanMeasurementNoise,
      CONFIG.eyeTracking.kalmanVelocityNoise,
    )
  }

  reset(): void {
    this.xKalman.resetTo(0)
    this.yKalman.resetTo(0)
    this.lastTimestamp = null
    this.initialized = false
    this.fixation = null
  }

  /**
   * Feed a raw gaze point. Returns the Kalman-filtered result.
   * rawX/Y: screen pixels.  timestamp: performance.now() (ms).
   */
  process(
    rawX: number,
    rawY: number,
    isBlinking: boolean,
    timestamp: number,
  ): { rawX: number; rawY: number; filteredX: number; filteredY: number; velocityPxS: number; isSaccade: boolean; isBlinking: boolean; timestamp: number } {
    if (!this.initialized) {
      this.xKalman.resetTo(rawX)
      this.yKalman.resetTo(rawY)
      this.initialized = true
      this.lastTimestamp = timestamp
      this.fixation = { fixationStartX: rawX, fixationStartY: rawY, fixationStartTime: timestamp }
    }

    const dt = Math.max((timestamp - (this.lastTimestamp ?? timestamp)) / 1000, 0.001) // seconds
    this.lastTimestamp = timestamp

    const filteredX = this.xKalman.update(rawX, dt)
    const filteredY = this.yKalman.update(rawY, dt)

    const vx = this.xKalman.velocity
    const vy = this.yKalman.velocity
    const velocityPxS = Math.sqrt(vx * vx + vy * vy)
    const isSaccade = velocityPxS > CONFIG.eyeTracking.saccadeVelocityThreshold

    // Fixation tracking (reset when gaze drifts too far)
    if (!this.fixation) {
      this.fixation = { fixationStartX: filteredX, fixationStartY: filteredY, fixationStartTime: timestamp }
    } else {
      const dx = filteredX - this.fixation.fixationStartX
      const dy = filteredY - this.fixation.fixationStartY
      if (Math.sqrt(dx * dx + dy * dy) > CONFIG.eyeTracking.fixationRadiusPx || isSaccade) {
        this.fixation = { fixationStartX: filteredX, fixationStartY: filteredY, fixationStartTime: timestamp }
      }
    }

    return { rawX, rawY, filteredX, filteredY, velocityPxS, isSaccade, isBlinking, timestamp }
  }

  getFixationDuration(now: number): number {
    if (!this.fixation) return 0
    return now - this.fixation.fixationStartTime
  }
}
