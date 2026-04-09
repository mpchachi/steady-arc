import { useRef, useCallback, useEffect } from 'react'
import { TelemetryCollector } from '@/core/telemetry/TelemetryCollector'
import { SessionRecorder } from '@/core/telemetry/SessionRecorder'
import type { GazePoint } from '@/core/eyeTracking/types'
import type { IrisLandmarks, HeadPose } from '@/core/eyeTracking/types'
import type { GazeFilter } from '@/core/eyeTracking/GazeFilter'
import type { GameEventType, SessionData } from '@/core/telemetry/types'

export interface UseTelemetryReturn {
  collector: TelemetryCollector
  recordEvent: (type: GameEventType, data?: Record<string, unknown>) => void
  finalizeSession: (percentArea: number) => SessionData
  resetSession: () => void
}

/** All returned references are stable across renders */
export function useTelemetry(): UseTelemetryReturn {
  const collectorRef = useRef(new TelemetryCollector())
  const recorderRef = useRef(new SessionRecorder(collectorRef.current))

  const recordEvent = useCallback((type: GameEventType, data: Record<string, unknown> = {}) => {
    collectorRef.current.recordEvent(type, data)
  }, [])

  const finalizeSession = useCallback((percentArea: number): SessionData => {
    return recorderRef.current.finalize(percentArea)
  }, [])

  const resetSession = useCallback(() => {
    collectorRef.current.reset()
    recorderRef.current = new SessionRecorder(collectorRef.current)
  }, [])

  return { collector: collectorRef.current, recordEvent, finalizeSession, resetSession }
}

/**
 * Auto-records gaze samples every frame via RAF.
 * Uses refs internally so deps never cause loop restarts.
 */
export function useGazeTelemetry(
  gaze: GazePoint | null,
  iris: IrisLandmarks | null,
  headPose: HeadPose | null,
  filter: GazeFilter,
  collector: TelemetryCollector,
): void {
  const gazeRef = useRef(gaze)
  const irisRef = useRef(iris)
  const headRef = useRef(headPose)
  gazeRef.current = gaze
  irisRef.current = iris
  headRef.current = headPose

  // filter and collector are stable class instances — safe to capture once
  useEffect(() => {
    let raf: number
    function loop() {
      const g = gazeRef.current
      const ir = irisRef.current
      const hp = headRef.current
      if (g && ir) {
        collector.recordGazeSample({
          timestamp: g.timestamp,
          rawGazeX: g.rawX,
          rawGazeY: g.rawY,
          filteredGazeX: g.filteredX,
          filteredGazeY: g.filteredY,
          leftIrisRatioX: ir.leftIrisRatio.x,
          leftIrisRatioY: ir.leftIrisRatio.y,
          rightIrisRatioX: ir.rightIrisRatio.x,
          rightIrisRatioY: ir.rightIrisRatio.y,
          headPitchRad: hp?.pitch ?? 0,
          headYawRad: hp?.yaw ?? 0,
          headRollRad: hp?.roll ?? 0,
          pupilDilation: (ir.leftEyeOpenness + ir.rightEyeOpenness) / 2,
          isBlinking: g.isBlinking,
          isSaccade: g.isSaccade,
          fixationDurationMs: filter.getFixationDuration(g.timestamp),
        })
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [collector, filter]) // stable refs — effect runs once
}
