/**
 * steadyArcData.ts
 * Data contract and localStorage bridge for the SteadyArc dashboard.
 * Format must match exactly the JSON contract in the integration guide.
 */

// ── Data contract types ───────────────────────────────────────────────────────

export interface SteadyArcSession {
  id: string
  date: string
  metrics: {
    grip_MVC: number
    grip_release_time: number
    emg_cocontraction_ratio: number
    neglect_index: number
    left_RT: number
    right_RT: number
    RT_gaze_to_grip: number
    wrist_MT: number
    wrist_SPARC: number
    attention_mean: number
  }
  radar: { Grip: number; Neglect: number; Visuomotor: number; Attention: number }
  globalStatus: {
    riskScore: number
    alertLevel: 'none' | 'watch' | 'alert' | 'urgent'
    domains: { grip: string; neglect: string; visuomotor: string; attention: string }
    clinicalSynthesis: string
    learningEffectWarning?: boolean
  }
  gaze_heatmap: Array<{ x: number; y: number; duration_ms: number }>
}

// ── localStorage key ──────────────────────────────────────────────────────────

const lsKey = (patientId: string) => `steadyarc_sessions_${patientId}`

// ── Read / write ──────────────────────────────────────────────────────────────

export function getSessions(patientId: string): SteadyArcSession[] {
  const raw = localStorage.getItem(lsKey(patientId))
  if (!raw) return []
  try { return JSON.parse(raw) as SteadyArcSession[] } catch { return [] }
}

export function saveSession(patientId: string, session: SteadyArcSession): void {
  const existing = getSessions(patientId)
  existing.push(session)
  localStorage.setItem(lsKey(patientId), JSON.stringify(existing))
}

// ── Mock sessions (fallback when no real data) ────────────────────────────────

function generateHeatmap(totalPoints: number, rightPercent: number) {
  const points: Array<{ x: number; y: number; duration_ms: number }> = []
  const rightCount = Math.round(totalPoints * rightPercent)
  const leftCount = totalPoints - rightCount
  for (let i = 0; i < rightCount; i++)
    points.push({ x: 0.55 + Math.random() * 0.4, y: 0.1 + Math.random() * 0.8, duration_ms: Math.floor(80 + Math.random() * 320) })
  for (let i = 0; i < leftCount; i++)
    points.push({ x: 0.05 + Math.random() * 0.44, y: 0.1 + Math.random() * 0.8, duration_ms: Math.floor(80 + Math.random() * 320) })
  return points.sort(() => Math.random() - 0.5)
}

export const MOCK_SESSIONS: SteadyArcSession[] = [
  {
    id: 'S1', date: '2026-04-10T10:00:00Z',
    metrics: { grip_MVC: 28.5, grip_release_time: 520.0, emg_cocontraction_ratio: 0.68, neglect_index: 0.38, left_RT: 820.0, right_RT: 380.0, RT_gaze_to_grip: 380.0, wrist_MT: 720.0, wrist_SPARC: -3.20, attention_mean: 0.42 },
    globalStatus: { riskScore: 0.82, alertLevel: 'urgent', domains: { grip: 'deteriorating', neglect: 'deteriorating', visuomotor: 'deteriorating', attention: 'watch' }, clinicalSynthesis: 'Session 1: First post-discharge session. Significant left hemispatial neglect detected (neglect_index: 0.38). Grip strength severely reduced. High spasticity markers. Immediate rehabilitation protocol recommended.' },
    gaze_heatmap: generateHeatmap(20, 0.85), radar: { Grip: 35, Neglect: 28, Visuomotor: 32, Attention: 42 },
  },
  {
    id: 'S2', date: '2026-04-17T10:00:00Z',
    metrics: { grip_MVC: 31.2, grip_release_time: 495.0, emg_cocontraction_ratio: 0.63, neglect_index: 0.45, left_RT: 780.0, right_RT: 365.0, RT_gaze_to_grip: 355.0, wrist_MT: 690.0, wrist_SPARC: -2.95, attention_mean: 0.46 },
    globalStatus: { riskScore: 0.75, alertLevel: 'urgent', domains: { grip: 'deteriorating', neglect: 'watch', visuomotor: 'deteriorating', attention: 'watch' }, clinicalSynthesis: 'Session 2: Slight improvement in neglect (0.45) and grip strength. Spasticity remains high. Visuomotor coordination still impaired. Continue intensive protocol.' },
    gaze_heatmap: generateHeatmap(20, 0.70), radar: { Grip: 42, Neglect: 35, Visuomotor: 38, Attention: 46 },
  },
  {
    id: 'S3', date: '2026-04-24T10:00:00Z',
    metrics: { grip_MVC: 35.8, grip_release_time: 460.0, emg_cocontraction_ratio: 0.57, neglect_index: 0.54, left_RT: 720.0, right_RT: 345.0, RT_gaze_to_grip: 320.0, wrist_MT: 645.0, wrist_SPARC: -2.65, attention_mean: 0.52 },
    globalStatus: { riskScore: 0.65, alertLevel: 'alert', domains: { grip: 'watch', neglect: 'watch', visuomotor: 'watch', attention: 'stable' }, clinicalSynthesis: 'Session 3: Neglect index crossing 0.50 threshold — clinically significant improvement. Grip improving consistently. Smoothness (SPARC) recovering. Positive trajectory confirmed.' },
    gaze_heatmap: generateHeatmap(20, 0.55), radar: { Grip: 52, Neglect: 48, Visuomotor: 50, Attention: 52 },
  },
  {
    id: 'S4', date: '2026-05-01T10:00:00Z',
    metrics: { grip_MVC: 39.4, grip_release_time: 425.0, emg_cocontraction_ratio: 0.52, neglect_index: 0.63, left_RT: 660.0, right_RT: 328.0, RT_gaze_to_grip: 285.0, wrist_MT: 598.0, wrist_SPARC: -2.35, attention_mean: 0.58 },
    globalStatus: { riskScore: 0.52, alertLevel: 'watch', domains: { grip: 'stable', neglect: 'stable', visuomotor: 'watch', attention: 'stable' }, clinicalSynthesis: 'Session 4: Neglect index 0.63 — substantial recovery. Grip MVC approaching functional range. Reaction time asymmetry reducing. Protocol intensity can be maintained.' },
    gaze_heatmap: generateHeatmap(20, 0.52), radar: { Grip: 61, Neglect: 58, Visuomotor: 60, Attention: 58 },
  },
  {
    id: 'S5', date: '2026-05-08T10:00:00Z',
    metrics: { grip_MVC: 43.1, grip_release_time: 392.0, emg_cocontraction_ratio: 0.47, neglect_index: 0.71, left_RT: 595.0, right_RT: 312.0, RT_gaze_to_grip: 252.0, wrist_MT: 548.0, wrist_SPARC: -2.08, attention_mean: 0.64 },
    globalStatus: { riskScore: 0.38, alertLevel: 'watch', domains: { grip: 'stable', neglect: 'improving', visuomotor: 'stable', attention: 'stable' }, clinicalSynthesis: 'Session 5: All domains showing consistent improvement. Neglect index 0.71 — near functional range. Visuomotor coordination recovering well. Consider reducing session frequency.' },
    gaze_heatmap: generateHeatmap(20, 0.50), radar: { Grip: 70, Neglect: 68, Visuomotor: 69, Attention: 64 },
  },
  {
    id: 'S6', date: '2026-05-15T10:00:00Z',
    metrics: { grip_MVC: 46.8, grip_release_time: 362.0, emg_cocontraction_ratio: 0.43, neglect_index: 0.78, left_RT: 538.0, right_RT: 298.0, RT_gaze_to_grip: 218.0, wrist_MT: 502.0, wrist_SPARC: -1.82, attention_mean: 0.71 },
    globalStatus: { riskScore: 0.28, alertLevel: 'watch', domains: { grip: 'improving', neglect: 'improving', visuomotor: 'improving', attention: 'improving' }, clinicalSynthesis: 'Session 6: Significant recovery across all domains. Neglect index 0.78, grip MVC 46.8N, attention 0.71. Patient approaching functional independence thresholds. Excellent rehabilitation response.' },
    gaze_heatmap: generateHeatmap(20, 0.50), radar: { Grip: 78, Neglect: 76, Visuomotor: 74, Attention: 71 },
  },
]

/** Returns real sessions from localStorage, or MOCK_SESSIONS if none */
export function getSessionData(patientId: string): SteadyArcSession[] {
  const real = getSessions(patientId)
  return real.length > 0 ? real : MOCK_SESSIONS
}

export const EMPTY_STATE = {
  sessions: [],
  message: 'No sessions yet. Start playing to begin tracking your recovery.',
  hasData: false,
}
