// ── Fishing game types — stroke rehabilitation ────────────────────────────────

export type GamePhase = 'grip' | 'fishing' | 'summary'

export interface FishingConfig {
  fishCount: number
  fishSpeed: number
  fishSize: number
  gripDurationMs: number
  fixationThresholdMs: number
  patientId: string
}

export const DEFAULT_FISHING_CONFIG: FishingConfig = {
  fishCount: 5,
  fishSpeed: 2,
  fishSize: 55,
  gripDurationMs: 30_000,
  fixationThresholdMs: 600,
  patientId: 'P001',
}

// ── Hand sensor data ─────────────────────────────────────────────────────────

export interface HandInput {
  gripStrength: number
  flexRaw: number
  accel: { x: number; y: number; z: number }
  gyro:  { x: number; y: number; z: number }
  orientation: { pitch: number; roll: number; yaw: number }
  emg?: number
  emgRaw?: number
  timestamp: number
  source: 'keyboard' | 'serial'
  isConnected: boolean
}

export interface HandSample {
  timestamp: number
  flexRaw: number
  gripStrength: number
  accelX: number; accelY: number; accelZ: number
  gyroX: number;  gyroY: number;  gyroZ: number
  pitch: number;  roll: number;   yaw: number
  emgRaw?: number
  source: 'keyboard' | 'serial'
}

// ── Gaze sample ───────────────────────────────────────────────────────────────

export interface FishingGazeSample {
  timestamp: number
  gazeX: number; gazeY: number
  filteredX: number; filteredY: number
  isBlinking: boolean
  isSaccade: boolean
}

// ── Game events ───────────────────────────────────────────────────────────────

export type GameEventType =
  | 'phase_start' | 'phase_end'
  | 'fish_targeted' | 'fish_grabbed' | 'fish_caught' | 'fish_released'
  | 'grip_peak' | 'grip_release'

export interface GameEvent {
  timestamp: number
  phase: GamePhase
  type: GameEventType
  data: Record<string, unknown>
}

// ── Fish state ────────────────────────────────────────────────────────────────

export interface FishState {
  id: string
  x: number; y: number
  vx: number; vy: number
  color: string
  radius: number
  angleDeg: number
  status: 'idle' | 'targeted' | 'hooked' | 'caught'
  gazeTimeMs: number
  dwellTimeMs: number   // gaze + bar simultaneously on mine → 2000ms = explode
  eyeOnsetTime:   number | null
  eyeArrivalTime: number | null
  handOnsetTime:  number | null
  handEndTime:    number | null
  eyeEndTime:     number | null
  spawnSide: 'left' | 'center' | 'right'
}

// ── Per-catch metrics ─────────────────────────────────────────────────────────

export interface FishCatch {
  fishId: string
  catchIndex: number
  targetX: number; targetY: number
  side: 'left' | 'center' | 'right'
  eyeOnsetTime:   number | null
  eyeArrivalTime: number | null
  handOnsetTime:  number | null
  handEndTime:    number | null
  eyeEndTime:     number | null
  RT_gaze_to_grip: number | null
  MOA: number | null
  FT:  number | null
  MTA: number | null
}

// ── Clinical metrics — 10 métricas limpias para ictus ────────────────────────

export interface ClinicalMetrics {
  // Fuerza y espasticidad (fase grip)
  grip_MVC:              number | null   // 0-1, fuerza máxima de agarre
  grip_release_time:     number | null   // ms, tiempo soltar → espasticidad
  emg_cocontraction_ratio: number | null // co-contracción agonista/antagonista

  // Exploración espacial (fase fishing, eye tracker)
  neglect_index: number | null  // 0-1 fracción gaze hemicampo izq (0.5=simétrico)
  left_RT:       number | null  // ms, RT medio targets hemicampo izquierdo
  right_RT:      number | null  // ms, RT medio targets hemicampo derecho

  // Coordinación ojo-mano (fase fishing)
  RT_gaze_to_grip: number | null  // ms, fijación → inicio agarre
  attention_mean:  number | null  // 0-1, fracción tiempo fishing mirando peces

  // Calidad de movimiento de muñeca (fase fishing, IMU)
  wrist_MT:    number | null  // ms, movement time
  wrist_SPARC: number | null  // smoothness (más negativo = más suave)
}

// ── Doctor's flat JSON export ─────────────────────────────────────────────────

export interface DoctorSessionJSON {
  session_id: string
  patient_id: string
  timestamp:  string
  // Fuerza y espasticidad
  grip_MVC:                number | null
  grip_release_time:       number | null
  emg_cocontraction_ratio: number | null
  // Exploración espacial
  neglect_index: number | null
  left_RT:       number | null
  right_RT:      number | null
  // Coordinación ojo-mano
  RT_gaze_to_grip: number | null
  attention_mean:  number | null
  // Calidad de movimiento
  wrist_MT:    number | null
  wrist_SPARC: number | null
}

// ── Phase data ────────────────────────────────────────────────────────────────

export interface PhaseData {
  name: GamePhase
  taskId: string
  startMs: number
  endMs: number
  handSamples: HandSample[]
  gazeSamples: FishingGazeSample[]
  events: GameEvent[]
  metrics: Partial<ClinicalMetrics>
}

// ── Full session ──────────────────────────────────────────────────────────────

export interface FishingSessionData {
  version: '2.1'
  sessionId: string
  patientId: string
  startTime: number
  endTime: number
  game: 'fishing'
  phases: PhaseData[]
  fishCatches: FishCatch[]
  global_metrics: ClinicalMetrics
  config: FishingConfig
  raw_data: {
    hand_samples_count: number
    gaze_samples_count: number
    hand_sampling_rate_hz: number
    gaze_sampling_rate_hz: number
  }
}
