import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import type { GazePoint } from './types'

// ── Seeso type shims (package has no public .d.ts) ───────────────────────────
interface SeesoGazeInfo {
  x: number
  y: number
  fixationX: number
  fixationY: number
  trackingState: number   // 0 = SUCCESS
  eyeMovementState: number // 0 = FIXATION, 1 = SACCADE, 2 = UNKNOWN
  screenState: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EasySeeSoClass = any

// ── Context ──────────────────────────────────────────────────────────────────

interface SeesoContextValue {
  gazeInfo: SeesoGazeInfo | null
  isReady: boolean
  isCalibrating: boolean
  fps: number
  cameraError: string | null
  startCalibration: (
    onNextPoint: (x: number, y: number) => void,
    onProgress: (p: number) => void,
    onFinished: (data: string) => void,
  ) => void
  startCollectSamples: () => void
  applyCalibrationData: (data: string) => Promise<void>
}

const SeesoContext = createContext<SeesoContextValue | null>(null)

export function useSeeso(): SeesoContextValue {
  const ctx = useContext(SeesoContext)
  if (!ctx) throw new Error('useSeeso must be used inside SeesoProvider')
  return ctx
}

// ── Provider ─────────────────────────────────────────────────────────────────

interface Props {
  licenseKey: string
  children: React.ReactNode
}

export function SeesoProvider({ licenseKey, children }: Props) {
  const trackerRef = useRef<EasySeeSoClass | null>(null)
  const [gazeInfo, setGazeInfo]       = useState<SeesoGazeInfo | null>(null)
  const [isReady, setIsReady]         = useState(false)
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [fps, setFps]                 = useState(0)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const fpsRef = useRef({ frames: 0, last: performance.now() })

  const onGaze = useCallback((info: SeesoGazeInfo) => {
    setGazeInfo(info)
    // FPS counter
    const f = fpsRef.current
    f.frames++
    const now = performance.now()
    if (now - f.last >= 1000) {
      setFps(f.frames)
      f.frames = 0
      f.last = now
    }
  }, [])

  const onDebug = useCallback((_fps: number, _lMin: number, _lMax: number, _lAvg: number) => {
    // Seeso's own FPS (we track our own above)
  }, [])

  useEffect(() => {
    if (!licenseKey || licenseKey === 'YOUR_LICENSE_KEY') {
      setCameraError('Falta la license key de Eyedid. Ve a manage.seeso.io y pégala en config.ts')
      return
    }

    let destroyed = false

    async function init() {
      try {
        const { default: EasySeeSo } = await import('seeso/easy-seeso') as { default: EasySeeSoClass }
        if (destroyed) return

        const tracker = new EasySeeSo()
        trackerRef.current = tracker

        await tracker.init(
          licenseKey,
          async () => {
            if (destroyed) return
            // Desktop-only settings
            if (!tracker.checkMobile?.()) {
              tracker.setMonitorSize?.(15.6)
              tracker.setFaceDistance?.(50)
              tracker.setCameraPosition?.(window.outerWidth / 2, true)
            }
            await tracker.startTracking(onGaze, onDebug)

            // Restore saved calibration if available
            const saved = localStorage.getItem('seeso_calibration_v1')
            if (saved) {
              try { await tracker.setCalibrationData(saved) } catch { /* ignore stale data */ }
            }

            if (!destroyed) setIsReady(true)
          },
          (err: unknown) => {
            if (destroyed) return
            const msg = String(err)
            if (msg.includes('AUTH_EXCEEDED_FREE_TIER')) {
              setCameraError('Límite del tier gratuito de Eyedid alcanzado. Revisa manage.seeso.io')
            } else if (msg.includes('INVALID_LICENSE') || msg.includes('AUTH')) {
              setCameraError('License key de Eyedid inválida. Comprueba manage.seeso.io')
            } else {
              setCameraError(`Error Eyedid: ${msg}`)
            }
          },
        )
      } catch (err: unknown) {
        if (destroyed) return
        const msg = (err as Error)?.message ?? String(err)
        setCameraError(`Error al cargar Eyedid SDK: ${msg}`)
      }
    }

    init()

    return () => {
      destroyed = true
      trackerRef.current?.stopTracking?.()
    }
  }, [licenseKey, onGaze, onDebug])

  const startCalibration = useCallback((
    onNextPoint: (x: number, y: number) => void,
    onProgress: (p: number) => void,
    onFinished: (data: string) => void,
  ) => {
    if (!trackerRef.current) return
    setIsCalibrating(true)
    trackerRef.current.startCalibration(
      onNextPoint,
      onProgress,
      (data: string) => {
        localStorage.setItem('seeso_calibration_v1', data)
        setIsCalibrating(false)
        onFinished(data)
      },
      5,  // 5 points = max supported by Eyedid SDK (1 or 5 only)
    )
  }, [])

  const startCollectSamples = useCallback(() => {
    trackerRef.current?.startCollectSamples?.()
  }, [])

  const applyCalibrationData = useCallback(async (data: string) => {
    if (!trackerRef.current) return
    await trackerRef.current.setCalibrationData(data)
  }, [])

  return (
    <SeesoContext.Provider value={{
      gazeInfo, isReady, isCalibrating, fps, cameraError,
      startCalibration, startCollectSamples, applyCalibrationData,
    }}>
      {children}
    </SeesoContext.Provider>
  )
}

// ── GazePoint adapter ────────────────────────────────────────────────────────
// Converts Seeso's GazeInfo into our internal GazePoint format.

const TRACKING_SUCCESS = 0
const EYE_SACCADE = 1

export function seesoToGazePoint(info: SeesoGazeInfo, timestamp: number): GazePoint | null {
  if (info.trackingState !== TRACKING_SUCCESS) return null
  const x = info.fixationX  // use fixation (already stabilised by Seeso)
  const y = info.fixationY
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null

  return {
    rawX: info.x,
    rawY: info.y,
    filteredX: x,
    filteredY: y,
    velocityPxS: 0,  // Seeso doesn't expose velocity
    confidence: 1,
    isSaccade: info.eyeMovementState === EYE_SACCADE,
    isBlinking: false,  // Seeso handles this internally; state = FACE_MISSING when blinking
    timestamp,
  }
}
