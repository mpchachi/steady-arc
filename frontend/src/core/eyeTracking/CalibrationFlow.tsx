import React, { useState, useEffect, useRef } from 'react'
import { CONFIG } from '@/config'
import { GazeEstimator } from './GazeEstimator'
import type { CalibrationData, IrisLandmarks, HeadPose } from './types'

interface CalibrationPoint { x: number; y: number }

function buildGrid(): CalibrationPoint[] {
  const { gridCols, gridRows, edgePadding } = CONFIG.calibration
  const pts: CalibrationPoint[] = []
  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      pts.push({
        x: edgePadding + (col / (gridCols - 1)) * (1 - 2 * edgePadding),
        y: edgePadding + (row / (gridRows - 1)) * (1 - 2 * edgePadding),
      })
    }
  }
  return pts
}

// ── Outlier rejection (Tukey IQR fence) ─────────────────────────────────────
function iqrBounds(values: number[]): { lo: number; hi: number } {
  if (values.length < 4) return { lo: -Infinity, hi: Infinity }
  const s = [...values].sort((a, b) => a - b)
  const q1 = s[Math.floor(s.length * 0.25)]!
  const q3 = s[Math.floor(s.length * 0.75)]!
  const iqr = q3 - q1
  const m = CONFIG.calibration.iqrMultiplier
  return { lo: q1 - m * iqr, hi: q3 + m * iqr }
}

interface RawSample {
  irisRatioX: number; irisRatioY: number
  headYaw: number;    headPitch: number
}

function rejectOutliers(samples: RawSample[]): RawSample[] {
  if (samples.length < 4) return samples
  const bx = iqrBounds(samples.map(s => s.irisRatioX))
  const by = iqrBounds(samples.map(s => s.irisRatioY))
  return samples.filter(s =>
    s.irisRatioX >= bx.lo && s.irisRatioX <= bx.hi &&
    s.irisRatioY >= by.lo && s.irisRatioY <= by.hi,
  )
}

function meanSamples(samples: RawSample[]): RawSample {
  const n = samples.length
  return {
    irisRatioX: samples.reduce((s, p) => s + p.irisRatioX, 0) / n,
    irisRatioY: samples.reduce((s, p) => s + p.irisRatioY, 0) / n,
    headYaw:    samples.reduce((s, p) => s + p.headYaw,    0) / n,
    headPitch:  samples.reduce((s, p) => s + p.headPitch,  0) / n,
  }
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  estimator: GazeEstimator
  irisLandmarks: IrisLandmarks | null
  headPose: HeadPose | null
  onComplete: (data: CalibrationData) => void
}

type Phase = 'countdown' | 'collecting' | 'done'

export function CalibrationFlow({ estimator, irisLandmarks, headPose, onComplete }: Props) {
  const points = useRef(buildGrid()).current
  const [pointIndex, setPointIndex] = useState(0)
  const [phase,      setPhase]      = useState<Phase>('countdown')
  const [countdown,  setCountdown]  = useState(3)
  const [progress,   setProgress]   = useState(0)

  const irisRef    = useRef(irisLandmarks)
  const headRef    = useRef(headPose)
  irisRef.current  = irisLandmarks
  headRef.current  = headPose

  const collectedRef  = useRef<Array<{
    targetX: number; targetY: number
    irisRatioX: number; irisRatioY: number
    headYaw: number; headPitch: number
  }>>([])
  const estimatorRef  = useRef(estimator)
  const onCompleteRef = useRef(onComplete)
  estimatorRef.current  = estimator
  onCompleteRef.current = onComplete

  // ── Countdown ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown === 0) { setPhase('collecting'); return }
    const id = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(id)
  }, [phase, countdown])

  // ── RAF collection loop (one per point) ─────────────────────────────────
  useEffect(() => {
    if (phase !== 'collecting') return

    const startTime = performance.now()
    const localSamples: RawSample[] = []
    const point = points[pointIndex]!
    let rafId: number

    function tick() {
      const elapsed = performance.now() - startTime
      const prog = Math.min(elapsed / CONFIG.calibration.pointDurationMs, 1)
      setProgress(prog)

      // Collect after warmup — only when iris data is available
      if (elapsed > CONFIG.calibration.warmupMs) {
        const iris = irisRef.current
        const head = headRef.current
        if (iris) {
          localSamples.push({
            irisRatioX: (iris.leftIrisRatio.x + iris.rightIrisRatio.x) / 2,
            irisRatioY: (iris.leftIrisRatio.y + iris.rightIrisRatio.y) / 2,
            headYaw:    head?.yaw   ?? 0,
            headPitch:  head?.pitch ?? 0,
          })
        }
      }

      if (prog >= 1) {
        // Filter outliers and compute mean for this point
        const clean = rejectOutliers(localSamples)
        if (clean.length > 0) {
          const m = meanSamples(clean)
          collectedRef.current.push({
            targetX: point.x * window.innerWidth,
            targetY: point.y * window.innerHeight,
            ...m,
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
          setPointIndex(nextIndex)
        }
        return
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pointIndex])

  const currentPoint = points[pointIndex]!

  return (
    <div style={styles.overlay}>
      {phase === 'countdown' && (
        <div style={styles.center}>
          <h2 style={styles.title}>Calibración</h2>
          <p style={styles.subtitle}>
            Mira cada punto fijamente hasta que se llene.<br />
            Puedes mover ligeramente la cabeza — el modelo lo compensará.
          </p>
          <div style={styles.pointCount}>{CONFIG.calibration.points} puntos · 4×4</div>
          <div style={styles.countdown}>{countdown === 0 ? '¡Ya!' : countdown}</div>
        </div>
      )}

      {phase === 'collecting' && (
        <>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${progress * 100}%` }} />
          </div>
          <div style={styles.pointLabel}>
            Punto {pointIndex + 1} / {points.length}
          </div>
          <CalibrationTarget x={currentPoint.x} y={currentPoint.y} progress={progress} index={pointIndex} />
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

function CalibrationTarget({
  x, y, progress, index,
}: { x: number; y: number; progress: number; index: number }) {
  const px = x * window.innerWidth
  const py = y * window.innerHeight
  const outerR = 20

  return (
    <div style={{
      position: 'absolute',
      left: px, top: py,
      transform: 'translate(-50%, -50%)',
      width: outerR * 2, height: outerR * 2,
      borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 0 10px rgba(74,222,128,0.35)',
    }}>
      {/* Fill ring */}
      <div style={{
        width: outerR * 2 * progress,
        height: outerR * 2 * progress,
        borderRadius: '50%',
        background: '#4ade80',
        transition: 'width 60ms linear, height 60ms linear',
      }} />
      {/* Center dot */}
      <div style={{
        position: 'absolute', width: 4, height: 4,
        borderRadius: '50%', background: '#fff',
      }} />
      {/* Point index */}
      <div style={{
        position: 'absolute', top: -20,
        fontSize: 10, color: 'rgba(255,255,255,0.4)',
        fontFamily: 'monospace',
      }}>{index + 1}</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay:     { position: 'fixed', inset: 0, background: '#080810', zIndex: 1000 },
  center:      { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, color: '#fff' },
  title:       { fontSize: 30, fontFamily: 'system-ui', fontWeight: 700, margin: 0 },
  subtitle:    { fontSize: 16, fontFamily: 'system-ui', color: 'rgba(255,255,255,0.65)', textAlign: 'center', maxWidth: 440, lineHeight: 1.6, margin: 0 },
  pointCount:  { fontSize: 13, fontFamily: 'monospace', color: 'rgba(74,222,128,0.7)', letterSpacing: 1 },
  countdown:   { fontSize: 88, fontFamily: 'system-ui', fontWeight: 900, color: '#4ade80' },
  progressBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: 'rgba(255,255,255,0.07)' },
  progressFill:{ height: '100%', background: '#4ade80', transition: 'width 80ms linear' },
  pointLabel:  { position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.4)', fontFamily: 'system-ui', fontSize: 12 },
  doneIcon:    { fontSize: 72, color: '#4ade80' },
}
