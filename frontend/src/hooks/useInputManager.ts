import { useRef, useEffect } from 'react'
import { InputManager, EyeTrackingSource } from '@/core/input/InputManager'
import type { GazePoint } from '@/core/eyeTracking/types'

export function useInputManager(gaze: GazePoint | null): InputManager {
  const managerRef = useRef<InputManager | null>(null)
  const eyeSourceRef = useRef<EyeTrackingSource | null>(null)

  if (!managerRef.current) {
    const mgr = new InputManager()
    const eyeSrc = new EyeTrackingSource()
    mgr.register(eyeSrc)
    managerRef.current = mgr
    eyeSourceRef.current = eyeSrc
  }

  useEffect(() => {
    eyeSourceRef.current?.update(gaze)
  }, [gaze])

  useEffect(() => {
    return () => managerRef.current?.destroy()
  }, [])

  return managerRef.current
}
