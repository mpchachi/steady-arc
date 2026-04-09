import { useState, useEffect } from 'react'
import { useSeeso, seesoToGazePoint } from '@/core/eyeTracking/SeesoProvider'
import type { GazePoint } from '@/core/eyeTracking/types'

/**
 * Primary hook — exposes Eyedid-tracked gaze coordinates.
 * Returns null when Seeso hasn't acquired the face or isn't calibrated yet.
 */
export function useGaze(): GazePoint | null {
  const { gazeInfo } = useSeeso()
  const [gaze, setGaze] = useState<GazePoint | null>(null)

  useEffect(() => {
    if (!gazeInfo) { setGaze(null); return }
    const point = seesoToGazePoint(gazeInfo, performance.now())
    setGaze(point)
  }, [gazeInfo])

  return gaze
}
