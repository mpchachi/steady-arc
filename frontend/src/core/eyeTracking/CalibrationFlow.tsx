import React, { useState, useEffect, useRef } from 'react'
import { CONFIG } from '@/config'
import { GazeEstimator } from './GazeEstimator'
import type { CalibrationData, IrisLandmarks } from './types'

interface CalibrationPoint {
  x: number // 0..1 normalized
  y: number
}

function buildGrid(): CalibrationPoint[] {
  const { gridCols, gridRows, edgePadding } = CONFIG.calibration
  const points: CalibrationPoint[] = []
  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const x = edgePadding + (col / (gridCols - 1)) * (1 - 2 * edgePadding)
      const y = edgePadding + (row / (gridRows - 1)) * (1 - 2 * edgePadding)
      points.push({ x, y })
    }
  }
  return points
}

interface Props {
  estimator: GazeEstimator
  irisLandmarks: IrisLandmarks | null
  onComplete: (data: CalibrationData) => void
}

type Phase = 'countdown' | 'collecting' | 'done'

export function CalibrationFlow({ estimator, irisLandmarks, onComplete }: Props) {
  const points = useRef(buildGrid()).current
  const [pointIndex, setPointIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('countdown')
  const [countdown, setCountdown] = useState(3)
  const [progress, setProgress] = useState(0)

  // Stable ref so the RAF loop always reads the latest landmarks
  const irisRef = useRef(irisLandmarks)
  irisRef.current = irisLandmarks

  // Accumulates one entry per calibration point
  const collectedRef = useRef<
    Array<{ targetX: number; targetY: number; irisRatioX: number; irisRatioY: number }>
  >([])

  const estimatorRef = useRef(estimator)
  estimatorRef.current = estimator
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  // ── Countdown ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown === 0) {
      setPhase('collecting')
      return
    }
    const id = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(id)
  }, [phase, countdown])

  // ── Per-point RAF collection loop ─────────────────────────────────────────
  // Runs once per (phase='collecting', pointIndex). Never re-runs mid-point.
  useEffect(() => {
    if (phase !== 'collecting') return

    const startTime = performance.now()
    const localSamples: Array<{ irisRatioX: number; irisRatioY: number }> = []
    const point = points[pointIndex]!
    let rafId: number

    function tick() {
      const elapsed = performance.now() - startTime
      const prog = Math.min(elapsed / CONFIG.calibration.pointDurationMs, 1)

      // Update progress bar via DOM directly → no re-render, no cancellation
      setProgress(prog)

      // Collect after warmup
      const iris = irisRef.current
      if (elapsed > CONFIG.calibration.warmupMs && iris) {
        const rx = (iris.leftIrisRatio.x + iris.rightIrisRatio.x) / 2
        const ry = (iris.leftIrisRatio.y + iris.rightIrisRatio.y) / 2
        localSamples.push({ irisRatioX: rx, irisRatioY: ry })
      }

      if (prog >= 1) {
        // Point done — store mean sample
        if (localSamples.length > 0) {
          const meanX = localSamples.reduce((s, p) => s + p.irisRatioX, 0) / localSamples.length
          const meanY = localSamples.reduce((s, p) => s + p.irisRatioY, 0) / localSamples.length
          collectedRef.current.push({
            targetX: point.x * window.innerWidth,
            targetY: point.y * window.innerHeight,
            irisRatioX: meanX,
            irisRatioY: meanY,
          })
        }

        const nextIndex = pointIndex + 1
        if (nextIndex >= points.length) {
          const cal = GazeEstimator.buildCalibration(
            collectedRef.current,
            window.innerWidth,
            window.innerHeight,
          )
          estimatorRef.current.setCalibration(cal)
          localStorage.setItem(CONFIG.calibration.localStorageKey, JSON.stringify(cal))
          setPhase('done')
          onCompleteRef.current(cal)
        } else {
          setProgress(0)
          setPointIndex(nextIndex) // triggers effect cleanup + re-run for next point
        }
        return // stop RAF
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)

    // pointIndex is the only trigger — changing it restarts this loop for the next point
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pointIndex])

  const currentPoint = points[pointIndex]!

  return (
    <div style={styles.overlay}>
      {phase === 'countdown' && (
        <div style={styles.center}>
          <h2 style={styles.title}>Calibración</h2>
          <p style={styles.subtitle}>
            Mira cada punto fijamente hasta que se llene. No muevas la cabeza.
          </p>
          <div style={styles.countdown}>{countdown === 0 ? '¡Ya!' : countdown}</div>
        </div>
      )}

      {phase === 'collecting' && (
        <>
          {/* Progress bar — driven by setProgress, which uses React state not DOM mutation */}
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${progress * 100}%` }} />
          </div>
          <div style={styles.pointLabel}>
            Punto {pointIndex + 1} / {points.length}
          </div>
          <CalibrationTarget x={currentPoint.x} y={currentPoint.y} progress={progress} />
        </>
      )}

      {phase === 'done' && (
        <div style={styles.center}>
          <div style={styles.doneIcon}>✓</div>
          <p style={styles.subtitle}>Calibración completada</p>
        </div>
      )}
    </div>
  )
}

function CalibrationTarget({ x, y, progress }: { x: number; y: number; progress: number }) {
  const px = x * window.innerWidth
  const py = y * window.innerHeight
  const outerR = 22
  const innerMax = 16

  return (
    <div
      style={{
        position: 'absolute',
        left: px,
        top: py,
        transform: 'translate(-50%, -50%)',
        width: outerR * 2,
        height: outerR * 2,
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 0 12px rgba(74,222,128,0.4)',
      }}
    >
      {/* Growing fill */}
      <div
        style={{
          width: innerMax * progress * 2,
          height: innerMax * progress * 2,
          borderRadius: '50%',
          background: '#4ade80',
          transition: 'width 50ms linear, height 50ms linear',
        }}
      />
      {/* Center dot always visible */}
      <div
        style={{
          position: 'absolute',
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: '#fff',
        }}
      />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: '#080810',
    zIndex: 1000,
  },
  center: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    color: '#fff',
  },
  title: {
    fontSize: 32,
    fontFamily: 'system-ui',
    fontWeight: 700,
    color: '#fff',
  },
  subtitle: {
    fontSize: 18,
    fontFamily: 'system-ui',
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    maxWidth: 420,
  },
  countdown: {
    fontSize: 96,
    fontFamily: 'system-ui',
    fontWeight: 900,
    color: '#4ade80',
  },
  progressBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
    background: 'rgba(255,255,255,0.08)',
  },
  progressFill: {
    height: '100%',
    background: '#4ade80',
    transition: 'width 80ms linear',
  },
  pointLabel: {
    position: 'absolute',
    top: 14,
    left: '50%',
    transform: 'translateX(-50%)',
    color: 'rgba(255,255,255,0.45)',
    fontFamily: 'system-ui',
    fontSize: 13,
  },
  doneIcon: {
    fontSize: 80,
    color: '#4ade80',
  },
}
