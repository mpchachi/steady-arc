import type { IrisLandmarks, CalibrationData, HeadPose } from './types'
import { CONFIG } from '@/config'

// ── MediaPipe landmark indices ──────────────────────────────────────────────
const LEFT_EYE_INNER  = 133
const LEFT_EYE_OUTER  = 33
const LEFT_EYE_TOP    = 159
const LEFT_EYE_BOTTOM = 145

const RIGHT_EYE_INNER  = 362
const RIGHT_EYE_OUTER  = 263
const RIGHT_EYE_TOP    = 386
const RIGHT_EYE_BOTTOM = 374

// Iris contour points (refineLandmarks must be true)
// 468 = left center, 469 = top, 470 = right, 471 = bottom, 472 = left edge
// 473 = right center, 474 = top, 475 = right, 476 = bottom, 477 = left edge
const LEFT_IRIS_CONTOUR  = [469, 470, 471, 472] // 4 cardinal points (skip center 468)
const RIGHT_IRIS_CONTOUR = [474, 475, 476, 477]

// Head pose reference points
const NOSE_TIP  = 1
const CHIN      = 152
const LEFT_EAR  = 234
const RIGHT_EAR = 454

type Landmark = { x: number; y: number; z: number }

/** Pure class — no React dependency */
export class GazeEstimator {
  private calibration: CalibrationData | null = null

  setCalibration(cal: CalibrationData | null): void {
    this.calibration = cal
  }

  getCalibration(): CalibrationData | null {
    return this.calibration
  }

  extractIrisLandmarks(landmarks: Landmark[]): IrisLandmarks {
    // ── Left eye ────────────────────────────────────────────────────────────
    const lInner  = landmarks[LEFT_EYE_INNER]!
    const lOuter  = landmarks[LEFT_EYE_OUTER]!
    const lTop    = landmarks[LEFT_EYE_TOP]!
    const lBottom = landmarks[LEFT_EYE_BOTTOM]!

    // Fit a circle to the 4 cardinal iris contour points → robust center
    const lIris = fitIrisCenter(LEFT_IRIS_CONTOUR.map(i => landmarks[i]!))

    const lWidth    = Math.abs(lInner.x - lOuter.x)
    const lHeight   = Math.abs(lTop.y   - lBottom.y)
    const lRatioX   = lWidth  > 1e-6 ? (lIris.x - lOuter.x) / lWidth  : 0.5
    const lRatioY   = lHeight > 1e-6 ? (lIris.y - lTop.y)   / lHeight : 0.5
    const lOpenness = lWidth  > 1e-6 ? lHeight / lWidth : 0

    // ── Right eye ───────────────────────────────────────────────────────────
    const rInner  = landmarks[RIGHT_EYE_INNER]!
    const rOuter  = landmarks[RIGHT_EYE_OUTER]!
    const rTop    = landmarks[RIGHT_EYE_TOP]!
    const rBottom = landmarks[RIGHT_EYE_BOTTOM]!

    const rIris = fitIrisCenter(RIGHT_IRIS_CONTOUR.map(i => landmarks[i]!))

    const rWidth    = Math.abs(rInner.x - rOuter.x)
    const rHeight   = Math.abs(rTop.y   - rBottom.y)
    const rRatioX   = rWidth  > 1e-6 ? (rIris.x - rOuter.x) / rWidth  : 0.5
    const rRatioY   = rHeight > 1e-6 ? (rIris.y - rTop.y)   / rHeight : 0.5
    const rOpenness = rWidth  > 1e-6 ? rHeight / rWidth : 0

    const avgOpenness = (lOpenness + rOpenness) / 2
    const isBlinking  = avgOpenness < CONFIG.eyeTracking.blinkThreshold

    return {
      leftIrisCenter:   lIris,
      rightIrisCenter:  rIris,
      leftIrisRatio:    { x: lRatioX, y: lRatioY },
      rightIrisRatio:   { x: rRatioX, y: rRatioY },
      leftEyeOpenness:  lOpenness,
      rightEyeOpenness: rOpenness,
      isBlinking,
    }
  }

  estimateHeadPose(landmarks: Landmark[]): HeadPose {
    const nose  = landmarks[NOSE_TIP]!
    const chin  = landmarks[CHIN]!
    const lEar  = landmarks[LEFT_EAR]!
    const rEar  = landmarks[RIGHT_EAR]!

    const pitch = Math.atan2(chin.y - nose.y, Math.abs(chin.z - nose.z) + 1e-6)
    const yaw   = Math.atan2(rEar.x - lEar.x, Math.abs(rEar.z - lEar.z) + 1e-6)
    const roll  = Math.atan2(rEar.y - lEar.y,  rEar.x - lEar.x)

    return { pitch, yaw, roll }
  }

  private averageIrisRatio(iris: IrisLandmarks) {
    // Use the more open eye as primary to reduce noise
    const lOpen = iris.leftEyeOpenness
    const rOpen = iris.rightEyeOpenness
    const total = lOpen + rOpen + 1e-9
    const wL = lOpen / total
    const wR = rOpen / total
    return {
      x: wL * iris.leftIrisRatio.x + wR * iris.rightIrisRatio.x,
      y: wL * iris.leftIrisRatio.y + wR * iris.rightIrisRatio.y,
    }
  }

  /**
   * Map iris ratio + head pose → screen coordinates via calibration polynomial.
   * Returns null if uncalibrated.
   */
  irisToScreen(iris: IrisLandmarks, headPose?: HeadPose): { x: number; y: number } | null {
    if (!this.calibration) return null

    const ratio = this.averageIrisRatio(iris)
    const yaw   = headPose?.yaw   ?? 0
    const pitch = headPose?.pitch ?? 0

    const x = evalPolyHP(this.calibration.coeffsX, ratio.x, ratio.y, yaw, pitch)
    const y = evalPolyHP(this.calibration.coeffsY, ratio.x, ratio.y, yaw, pitch)

    return { x, y }
  }

  /** Fit calibration from collected samples (includes head pose) */
  static buildCalibration(
    samples: Array<{
      targetX: number; targetY: number
      irisRatioX: number; irisRatioY: number
      headYaw: number; headPitch: number
    }>,
    screenWidth: number,
    screenHeight: number,
  ): CalibrationData {
    const rows = samples.map(s => [s.irisRatioX, s.irisRatioY, s.headYaw, s.headPitch, s.targetX])
    const coeffsX = fitPolyHP(rows.map(r => [r[0]!, r[1]!, r[2]!, r[3]!, r[4]!]))

    const rowsY = samples.map(s => [s.irisRatioX, s.irisRatioY, s.headYaw, s.headPitch, s.targetY])
    const coeffsY = fitPolyHP(rowsY.map(r => [r[0]!, r[1]!, r[2]!, r[3]!, r[4]!]))

    return {
      samples,
      coeffsX,
      coeffsY,
      calibratedAt: Date.now(),
      screenWidth,
      screenHeight,
    }
  }
}

// ── Iris circle fitting ──────────────────────────────────────────────────────
//
// Given N points on the iris contour, find the circle center by solving:
//   x² + y² = 2cx·x + 2cy·y + C   (linear in cx, cy, C)
//
// This is the algebraic circle fit (Kåsa method). With 4 cardinal points it's
// overdetermined → least squares gives a more stable center than any single point.

function fitIrisCenter(pts: Array<{ x: number; y: number }>): { x: number; y: number } {
  const n = pts.length
  if (n === 0) return { x: 0, y: 0 }
  if (n < 3) {
    // Fall back to centroid
    return {
      x: pts.reduce((s, p) => s + p.x, 0) / n,
      y: pts.reduce((s, p) => s + p.y, 0) / n,
    }
  }

  // Design matrix A = [x, y, 1],  b = x²+y²
  const A = pts.map(p => [p.x, p.y, 1])
  const b = pts.map(p => p.x * p.x + p.y * p.y)

  const At   = transpose(A)
  const AtA  = matMul(At, A, 3, n, 3)
  const Atb  = matVecMul(At, b, 3, n)
  const coeffs = gaussianElimination(AtA, Atb)

  // coeffs = [2cx, 2cy, C]
  const cx = (coeffs[0] ?? 0) / 2
  const cy = (coeffs[1] ?? 0) / 2

  // Sanity check — if fit diverged use centroid instead
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
    return {
      x: pts.reduce((s, p) => s + p.x, 0) / n,
      y: pts.reduce((s, p) => s + p.y, 0) / n,
    }
  }

  return { x: cx, y: cy }
}

// ── Head-pose polynomial helpers ────────────────────────────────────────────
//
// Features (10):
//   [1, rx, ry, rx², rx·ry, ry², yaw, pitch, yaw·rx, pitch·ry]
//
// This lets the model compensate for perspective distortion caused by head rotation.

function buildFeaturesHP(rx: number, ry: number, yaw: number, pitch: number): number[] {
  return [1, rx, ry, rx * rx, rx * ry, ry * ry, yaw, pitch, yaw * rx, pitch * ry]
}

function evalPolyHP(coeffs: number[], rx: number, ry: number, yaw: number, pitch: number): number {
  const feats = buildFeaturesHP(rx, ry, yaw, pitch)
  return feats.reduce((sum, f, i) => sum + f * (coeffs[i] ?? 0), 0)
}

/** OLS fit: data = [[rx, ry, yaw, pitch, target], ...] */
function fitPolyHP(data: Array<[number, number, number, number, number]>): number[] {
  const n = data.length
  const numF = 10

  const A = data.map(([rx, ry, yaw, pitch]) => buildFeaturesHP(rx, ry, yaw, pitch))
  const b = data.map(([, , , , t]) => t)

  const At = transpose(A)
  const AtA = matMul(At, A, numF, n, numF)
  const Atb = matVecMul(At, b, numF, n)

  return gaussianElimination(AtA, Atb)
}

// ── Linear algebra ───────────────────────────────────────────────────────────

function transpose(m: number[][]): number[][] {
  const rows = m.length, cols = m[0]?.length ?? 0
  return Array.from({ length: cols }, (_, j) =>
    Array.from({ length: rows }, (_, i) => m[i]![j]!))
}

function matMul(A: number[][], B: number[][], rows: number, inner: number, cols: number): number[][] {
  return Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) =>
      Array.from({ length: inner }, (_, k) => (A[i]![k] ?? 0) * (B[k]![j] ?? 0))
        .reduce((s, v) => s + v, 0)))
}

function matVecMul(A: number[][], b: number[], rows: number, cols: number): number[] {
  return Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (A[i]![j] ?? 0) * (b[j] ?? 0))
      .reduce((s, v) => s + v, 0))
}

function gaussianElimination(A: number[][], b: number[]): number[] {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]!])

  for (let col = 0; col < n; col++) {
    let maxRow = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row]![col]!) > Math.abs(M[maxRow]![col]!)) maxRow = row
    }
    ;[M[col], M[maxRow]] = [M[maxRow]!, M[col]!]

    const pivot = M[col]![col]!
    if (Math.abs(pivot) < 1e-12) continue

    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = M[row]![col]! / pivot
      for (let k = col; k <= n; k++) M[row]![k]! -= factor * M[col]![k]!
    }
  }

  return Array.from({ length: n }, (_, i) => M[i]![n]! / M[i]![i]!)
}
