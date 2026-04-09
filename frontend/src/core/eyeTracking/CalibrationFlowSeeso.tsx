import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useSeeso } from './SeesoProvider'

// Delay after point appears before collecting (lets gaze settle)
const SETTLE_MS = 1000

interface Props {
  onComplete: (calibrationData: string) => void
}

interface ActivePoint { x: number; y: number }

export function CalibrationFlowSeeso({ onComplete }: Props) {
  const { startCalibration, startCollectSamples, isReady } = useSeeso()
  const [phase, setPhase]         = useState<'countdown' | 'calibrating' | 'done'>('countdown')
  const [countdown, setCountdown] = useState(3)
  const [point, setPoint]         = useState<ActivePoint | null>(null)
  const [progress, setProgress]   = useState(0)
  const onCompleteRef             = useRef(onComplete)
  onCompleteRef.current           = onComplete

  // ── Countdown ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown === 0) { setPhase('calibrating'); return }
    const id = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(id)
  }, [phase, countdown])

  // ── Start Seeso calibration once countdown finishes ────────────────────
  const onNextPoint = useCallback((x: number, y: number) => {
    setPoint({ x, y })
    setProgress(0)
    // After settle time, tell Seeso to start collecting samples
    setTimeout(() => startCollectSamples(), SETTLE_MS)
  }, [startCollectSamples])

  const onProgress = useCallback((p: number) => {
    setProgress(p)
  }, [])

  const onFinished = useCallback((data: string) => {
    setPhase('done')
    setTimeout(() => onCompleteRef.current(data), 600)
  }, [])

  useEffect(() => {
    if (phase !== 'calibrating' || !isReady) return
    startCalibration(onNextPoint, onProgress, onFinished)
  }, [phase, isReady, startCalibration, onNextPoint, onProgress, onFinished])

  return (
    <div style={styles.overlay}>
      {phase === 'countdown' && (
        <div style={styles.center}>
          <h2 style={styles.title}>Calibración</h2>
          <p style={styles.subtitle}>
            Mira cada punto hasta que se llene.<br />
            Calibración gestionada por Eyedid SDK.
          </p>
          <div style={styles.countdown}>{countdown === 0 ? '¡Ya!' : countdown}</div>
        </div>
      )}

      {phase === 'calibrating' && point && (
        <>
          {/* Progress bar */}
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${progress * 100}%` }} />
          </div>

          {/* Calibration dot */}
          <div style={{
            position: 'absolute',
            left: point.x,
            top: point.y,
            transform: 'translate(-50%, -50%)',
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 12px rgba(74,222,128,0.4)',
          }}>
            <div style={{
              width: 36 * progress,
              height: 36 * progress,
              borderRadius: '50%',
              background: '#4ade80',
              transition: 'width 60ms linear, height 60ms linear',
            }} />
            <div style={{
              position: 'absolute',
              width: 5, height: 5,
              borderRadius: '50%',
              background: '#fff',
            }} />
          </div>
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

const styles: Record<string, React.CSSProperties> = {
  overlay:     { position: 'fixed', inset: 0, background: '#080810', zIndex: 1000 },
  center:      { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, color: '#fff' },
  title:       { fontSize: 30, fontFamily: 'system-ui', fontWeight: 700, margin: 0 },
  subtitle:    { fontSize: 16, fontFamily: 'system-ui', color: 'rgba(255,255,255,0.65)', textAlign: 'center', maxWidth: 440, lineHeight: 1.6, margin: 0 },
  countdown:   { fontSize: 88, fontFamily: 'system-ui', fontWeight: 900, color: '#4ade80' },
  progressBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: 'rgba(255,255,255,0.07)' },
  progressFill:{ height: '100%', background: '#4ade80', transition: 'width 80ms linear' },
  doneIcon:    { fontSize: 72, color: '#4ade80' },
}
