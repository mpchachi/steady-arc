import type { IrisLandmarks, CalibrationData, HeadPose } from './types'
import { CONFIG } from '@/config'

// ── MediaPipe landmark indices ──────────────────────────────────────────────
const LEFT_EYE_INNER  = 133
const LEFT_EYE_OUTER  = 33
const LEFT_EYE_TOP    = 159
const LEFT_EYE_BOTTOM = 145
const LEFT_IRIS_CENTER = 468

const RIGHT_EYE_INNER  = 362
const RIGHT_EYE_OUTER  = 263
const RIGHT_EYE_TOP    = 386
const RIGHT_EYE_BOTTOM = 374
const RIGHT_IRIS_CENTER = 473

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
    const lInner  = landmarks[LEFT_EYE_INNER]!
    const lOuter  = landmarks[LEFT_EYE_OUTER]!
    const lTop    = landmarks[LEFT_EYE_TOP]!
    const lBottom = landmarks[LEFT_EYE_BOTTOM]!
    const lIris   = landmarks[LEFT_IRIS_CENTER]!

    const lWidth    = Math.abs(lInner.x - lOuter.x)
    const lHeight   = Math.abs(lTop.y - lBottom.y)
    const lRatioX   = lWidth  > 1e-6 ? (lIris.x - lOuter.x) / lWidth  : 0.5
    const lRatioY   = lHeight > 1e-6 ? (lIris.y - lTop.y)   / lHeight : 0.5
    const lOpenness = lWidth  > 1e-6 ? lHeight / lWidth : 0

    const rInner  = landmarks[RIGHT_EYE_INNER]!
    const rOuter  = landmarks[RIGHT_EYE_OUTER]!
    const rTop    = landmarks[RIGHT_EYE_TOP]!
    const rBottom = landmarks[RIGHT_EYE_BOTTOM]!
    const rIris   = landmarks[RIGHT_IRIS_CENTER]!

    const rWidth    = Math.abs(rInner.x - rOuter.x)
    const rHeight   = Math.abs(rTop.y - rBottom.y)
    const rRatioX   = rWidth  > 1e-6 ? (rIris.x - rOuter.x) / rWidth  : 0.5
    const rRatioY   = rHeight > 1e-6 ? (rIris.y - rTop.y)   / rHeight : 0.5
    const rOpenness = rWidth  > 1e-6 ? rHeight / rWidth : 0

    const avgOpenness = (lOpenness + rOpenness) / 2
    const isBlinking  = avgOpenness < CONFIG.eyeTracking.blinkThreshold

    return {
      leftIrisCenter:  { x: lIris.x, y: lIris.y },
      rightIrisCenter: { x: rIris.x, y: rIris.y },
      leftIrisRatio:   { x: lRatioX,  y: lRatioY },
      rightIrisRatio:  { x: rRatioX,  y: rRatioY },
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
