import type { IrisLandmarks, CalibrationData, HeadPose } from './types'
import { CONFIG } from '@/config'

// MediaPipe landmark indices
const LEFT_EYE_INNER = 133
const LEFT_EYE_OUTER = 33
const LEFT_EYE_TOP = 159
const LEFT_EYE_BOTTOM = 145
const LEFT_IRIS_CENTER = 468

const RIGHT_EYE_INNER = 362
const RIGHT_EYE_OUTER = 263
const RIGHT_EYE_TOP = 386
const RIGHT_EYE_BOTTOM = 374
const RIGHT_IRIS_CENTER = 473

// Nose tip and chin for rough head pose
const NOSE_TIP = 1
const CHIN = 152
const LEFT_EAR = 234
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
    // ---- Left eye ----
    const lInner = landmarks[LEFT_EYE_INNER]
    const lOuter = landmarks[LEFT_EYE_OUTER]
    const lTop = landmarks[LEFT_EYE_TOP]
    const lBottom = landmarks[LEFT_EYE_BOTTOM]
    const lIris = landmarks[LEFT_IRIS_CENTER]

    const lWidth = Math.abs(lInner.x - lOuter.x)
    const lHeight = Math.abs(lTop.y - lBottom.y)
    const lRatioX = lWidth > 1e-6 ? (lIris.x - lOuter.x) / lWidth : 0.5
    const lRatioY = lHeight > 1e-6 ? (lIris.y - lTop.y) / lHeight : 0.5
    const lOpenness = lWidth > 1e-6 ? lHeight / lWidth : 0

    // ---- Right eye ----
    const rInner = landmarks[RIGHT_EYE_INNER]
    const rOuter = landmarks[RIGHT_EYE_OUTER]
    const rTop = landmarks[RIGHT_EYE_TOP]
    const rBottom = landmarks[RIGHT_EYE_BOTTOM]
    const rIris = landmarks[RIGHT_IRIS_CENTER]

    const rWidth = Math.abs(rInner.x - rOuter.x)
    const rHeight = Math.abs(rTop.y - rBottom.y)
    const rRatioX = rWidth > 1e-6 ? (rIris.x - rOuter.x) / rWidth : 0.5
    const rRatioY = rHeight > 1e-6 ? (rIris.y - rTop.y) / rHeight : 0.5
    const rOpenness = rWidth > 1e-6 ? rHeight / rWidth : 0

    const avgOpenness = (lOpenness + rOpenness) / 2
    const isBlinking = avgOpenness < CONFIG.eyeTracking.blinkThreshold

    return {
      leftIrisCenter: { x: lIris.x, y: lIris.y },
      rightIrisCenter: { x: rIris.x, y: rIris.y },
      leftIrisRatio: { x: lRatioX, y: lRatioY },
      rightIrisRatio: { x: rRatioX, y: rRatioY },
      leftEyeOpenness: lOpenness,
      rightEyeOpenness: rOpenness,
      isBlinking,
    }
  }

  estimateHeadPose(landmarks: Landmark[]): HeadPose {
    const nose = landmarks[NOSE_TIP]
    const chin = landmarks[CHIN]
    const lEar = landmarks[LEFT_EAR]
    const rEar = landmarks[RIGHT_EAR]

    const pitch = Math.atan2(chin.y - nose.y, chin.z - nose.z)
    const yaw = Math.atan2(rEar.x - lEar.x, rEar.z - lEar.z)
    const roll = Math.atan2(rEar.y - lEar.y, rEar.x - lEar.x)

    return { pitch, yaw, roll }
  }

  /** Average the iris ratio of both eyes */
  private averageIrisRatio(iris: IrisLandmarks): { x: number; y: number } {
    return {
      x: (iris.leftIrisRatio.x + iris.rightIrisRatio.x) / 2,
      y: (iris.leftIrisRatio.y + iris.rightIrisRatio.y) / 2,
    }
  }

  /**
   * Map iris ratio to screen coordinates using the calibration polynomial.
   * Returns null if not calibrated.
   */
  irisToScreen(iris: IrisLandmarks): { x: number; y: number } | null {
    if (!this.calibration) return null

    const ratio = this.averageIrisRatio(iris)
    const x = evalPoly2D(this.calibration.coeffsX, ratio.x, ratio.y)
    const y = evalPoly2D(this.calibration.coeffsY, ratio.x, ratio.y)

    return { x, y }
  }

  /** Build calibration from collected samples using polynomial regression */
  static buildCalibration(
    samples: Array<{ targetX: number; targetY: number; irisRatioX: number; irisRatioY: number }>,
    screenWidth: number,
    screenHeight: number,
  ): CalibrationData {
    const coeffsX = fitPoly2D(samples.map(s => [s.irisRatioX, s.irisRatioY, s.targetX]))
    const coeffsY = fitPoly2D(samples.map(s => [s.irisRatioX, s.irisRatioY, s.targetY]))

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

// ---- Polynomial regression helpers (degree-2, bivariate) ----
// Features: [1, x, y, x^2, x*y, y^2]

function buildFeatures(x: number, y: number): number[] {
  return [1, x, y, x * x, x * y, y * y]
}

function evalPoly2D(coeffs: number[], x: number, y: number): number {
  const feats = buildFeatures(x, y)
  return feats.reduce((sum, f, i) => sum + f * (coeffs[i] ?? 0), 0)
}

/**
 * Ordinary least squares for bivariate degree-2 polynomial.
 * data: array of [x, y, target]
 */
function fitPoly2D(data: Array<[number, number, number]>): number[] {
  const n = data.length
  const numFeats = 6

  // Build design matrix A (n x 6) and target vector b (n)
  const A: number[][] = data.map(([x, y]) => buildFeatures(x, y))
  const b: number[] = data.map(([, , t]) => t)

  // Normal equations: (A^T A) coeffs = A^T b
  const AtA = matMul(transpose(A), A, numFeats, n, numFeats)
  const Atb = matVecMul(transpose(A), b, numFeats, n)

  return gaussianElimination(AtA, Atb)
}

function transpose(m: number[][]): number[][] {
  const rows = m.length
  const cols = m[0]?.length ?? 0
  return Array.from({ length: cols }, (_, j) =>
    Array.from({ length: rows }, (_, i) => m[i]![j]!),
  )
}

function matMul(A: number[][], B: number[][], rows: number, inner: number, cols: number): number[][] {
  return Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) =>
      Array.from({ length: inner }, (_, k) => (A[i]![k] ?? 0) * (B[k]![j] ?? 0)).reduce((s, v) => s + v, 0),
    ),
  )
}

function matVecMul(A: number[][], b: number[], rows: number, cols: number): number[] {
  return Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (A[i]![j] ?? 0) * (b[j] ?? 0)).reduce((s, v) => s + v, 0),
  )
}

function gaussianElimination(A: number[][], b: number[]): number[] {
  const n = b.length
  // Augmented matrix
  const M = A.map((row, i) => [...row, b[i]!])

  for (let col = 0; col < n; col++) {
    // Partial pivoting
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
      for (let k = col; k <= n; k++) {
        M[row]![k]! -= factor * M[col]![k]!
      }
    }
  }

  return Array.from({ length: n }, (_, i) => M[i]![n]! / M[i]![i]!)
}
