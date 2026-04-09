import { useState, useEffect, useRef } from 'react'
import { useFaceMesh } from '@/core/eyeTracking/FaceMeshProvider'
import { GazeFilter } from '@/core/eyeTracking/GazeFilter'
import type { GazePoint } from '@/core/eyeTracking/types'

/**
 * Primary hook — calibrated + Kalman-filtered gaze coordinates.
 * Coordinates are clamped to screen bounds. Returns null when uncalibrated.
 */
export function useGaze(): GazePoint | null {
  const { estimator, irisLandmarks, headPose } = useFaceMesh()
  const filterRef = useRef(new GazeFilter())
  const [gaze, setGaze] = useState<GazePoint | null>(null)

  useEffect(() => {
    if (!irisLandmarks) {
      setGaze(null)
      return
    }

    // Pass head pose so the model can compensate for rotation
    const screenPos = estimator.irisToScreen(irisLandmarks, headPose ?? undefined)
    if (!screenPos) {
      setGaze(null)
      return
    }

    if (!Number.isFinite(screenPos.x) || !Number.isFinite(screenPos.y)) {
      setGaze(null)
      return
    }

    const W = window.innerWidth
    const H = window.innerHeight
    const clampedX = Math.max(0, Math.min(W, screenPos.x))
    const clampedY = Math.max(0, Math.min(H, screenPos.y))

    const now = performance.now()
    const filtered = filterRef.current.process(clampedX, clampedY, irisLandmarks.isBlinking, now)
    const avgOpenness = (irisLandmarks.leftEyeOpenness + irisLandmarks.rightEyeOpenness) / 2

    setGaze({ ...filtered, confidence: avgOpenness })
  }, [estimator, irisLandmarks, headPose])

  return gaze
}
