import { useState, useEffect, useRef } from 'react'
import { useFaceMesh } from '@/core/eyeTracking/FaceMeshProvider'
import { GazeFilter } from '@/core/eyeTracking/GazeFilter'
import type { GazePoint } from '@/core/eyeTracking/types'

/**
 * Primary hook — exposes calibrated, filtered gaze coordinates.
 * Returns null when uncalibrated or no face detected.
 * Coordinates are always clamped to screen bounds and validated (no NaN/Infinity).
 */
export function useGaze(): GazePoint | null {
  const { estimator, irisLandmarks } = useFaceMesh()
  const filterRef = useRef(new GazeFilter())
  const [gaze, setGaze] = useState<GazePoint | null>(null)

  useEffect(() => {
    if (!irisLandmarks) {
      setGaze(null)
      return
    }

    const screenPos = estimator.irisToScreen(irisLandmarks)
    if (!screenPos) {
      setGaze(null)
      return
    }

    // Reject garbage values from a bad polynomial
    if (!Number.isFinite(screenPos.x) || !Number.isFinite(screenPos.y)) {
      setGaze(null)
      return
    }

    // Clamp to screen so fog.reveal always works
    const W = window.innerWidth
    const H = window.innerHeight
    const clampedX = Math.max(0, Math.min(W, screenPos.x))
    const clampedY = Math.max(0, Math.min(H, screenPos.y))

    const now = performance.now()
    const filtered = filterRef.current.process(
      clampedX,
      clampedY,
      irisLandmarks.isBlinking,
      now,
    )

    const avgOpenness = (irisLandmarks.leftEyeOpenness + irisLandmarks.rightEyeOpenness) / 2

    setGaze({ ...filtered, confidence: avgOpenness })
  }, [estimator, irisLandmarks])

  return gaze
}
