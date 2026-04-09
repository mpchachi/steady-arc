export interface GazeSample {
  timestamp: number        // performance.now()
  rawGazeX: number
  rawGazeY: number
  filteredGazeX: number
  filteredGazeY: number
  leftIrisRatioX: number
  leftIrisRatioY: number
  rightIrisRatioX: number
  rightIrisRatioY: number
  headPitchRad: number
  headYawRad: number
  headRollRad: number
  pupilDilation: number    // proxy: average eye openness
  isBlinking: boolean
  isSaccade: boolean
  fixationDurationMs: number
}

export type GameEventType =
  | 'area_revealed'
  | 'treasure_found'
  | 'calibration_done'
  | 'game_start'
  | 'game_end'
  | 'session_start'

export interface TelemetryEvent {
  timestamp: number
  type: GameEventType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>
}

export interface FixationRecord {
  startTime: number
  endTime: number
  x: number
  y: number
  durationMs: number
}

export interface SaccadeRecord {
  startTime: number
  amplitude: number    // pixels
  velocity: number     // px/ms
  fromX: number
  fromY: number
  toX: number
  toY: number
}

export interface SessionMetrics {
  totalDurationMs: number
  totalFixations: number
  meanFixationDurationMs: number
  totalSaccades: number
  meanSaccadeAmplitude: number
  meanSaccadeVelocity: number
  percentAreaExplored: number
  scanPath: Array<{ x: number; y: number; timestamp: number }>
  gazeHeatmap: Array<{ x: number; y: number; weight: number }>
}

export interface SessionData {
  sessionId: string
  startTime: number          // Date.now()
  endTime: number
  screenWidth: number
  screenHeight: number
  gazeSamples: GazeSample[]
  events: TelemetryEvent[]
  fixations: FixationRecord[]
  saccades: SaccadeRecord[]
  metrics: SessionMetrics
}
