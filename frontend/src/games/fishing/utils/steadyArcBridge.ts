/**
 * steadyArcBridge.ts
 * Full data pipeline:
 *  1. POST current session to DynamoDB
 *  2. GET all sessions from DynamoDB (source of truth)
 *  3. Filter valid sessions (must have neglect_index field)
 *  4. Sort by date
 *  5. Run ML models on the full historical set
 *  6. Return SteadyArcSession[] ready for the dashboard
 */

import { API_BASE_URL } from '@/config'
import type { FishingSessionData, DoctorSessionJSON } from '../types'
import type { SteadyArcSession } from './steadyArcData'

// ── 1. POST current session ───────────────────────────────────────────────────

async function postSession(session: FishingSessionData): Promise<void> {
  const m = session.global_metrics
  const doc: DoctorSessionJSON = {
    session_id:              session.sessionId,
    patient_id:              session.patientId,
    timestamp:               new Date(session.startTime).toISOString(),
    grip_MVC:                m.grip_MVC,
    grip_release_time:       m.grip_release_time,
    emg_cocontraction_ratio: m.emg_cocontraction_ratio,
    neglect_index:           m.neglect_index,
    left_RT:                 m.left_RT,
    right_RT:                m.right_RT,
    RT_gaze_to_grip:         m.RT_gaze_to_grip,
    attention_mean:          m.attention_mean,
    wrist_MT:                m.wrist_MT,
    wrist_SPARC:             m.wrist_SPARC,
  }
  await fetch(`${API_BASE_URL}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  })
}

// ── 2. GET all sessions ───────────────────────────────────────────────────────

async function fetchSessions(patientId: string): Promise<DoctorSessionJSON[]> {
  const res = await fetch(`${API_BASE_URL}/session?patient_id=${encodeURIComponent(patientId)}`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  const data = await res.json()
  const items: unknown[] = Array.isArray(data) ? data : (data?.items ?? data?.sessions ?? data?.Items ?? [])
  return items as DoctorSessionJSON[]
}

// ── 3. Filter valid sessions ──────────────────────────────────────────────────

function isValid(s: unknown): s is DoctorSessionJSON {
  if (typeof s !== 'object' || s === null) return false
  const o = s as Record<string, unknown>
  return !!o.session_id && !!o.timestamp && 'neglect_index' in o
}

// ── ML helpers ────────────────────────────────────────────────────────────────

function olsSlope(values: number[]): number {
  const n = values.length
  if (n < 2) return 0
  const meanX = (n - 1) / 2
  const meanY = values.reduce((a, b) => a + b, 0) / n
  const num = values.reduce((acc, v, i) => acc + (i - meanX) * (v - meanY), 0)
  const den = values.reduce((acc, _, i) => acc + (i - meanX) ** 2, 0)
  return den === 0 ? 0 : num / den
}

function normalize(values: number[]): number[] {
  const min = Math.min(...values); const max = Math.max(...values)
  if (max === min) return values.map(() => 0.5)
  return values.map(v => (v - min) / (max - min))
}

/** Domain score 0-1 using trend + current level */
function domainScore(
  allVals: number[],     // full history (sorted old→new)
  higherIsBetter: boolean,
): number {
  const n = allVals.length
  const vals = higherIsBetter ? allVals : allVals.map(v => -v)   // flip so higher = better
  if (n < 2) return Math.max(0, Math.min(1, (vals[0] - Math.min(...vals)) / (Math.max(...vals) - Math.min(...vals) || 1) * 0.5))
  const norm = normalize(vals)
  const slope = olsSlope(norm)
  return Math.max(0, Math.min(1, norm[n - 1] * 0.6 + slope * 4 * 0.4))
}

function domainStatus(score: number): string {
  if (score > 0.72) return 'improving'
  if (score > 0.52) return 'stable'
  if (score > 0.35) return 'early_decline'
  return 'deteriorating'
}

function toAlertLevel(risk: number): 'none' | 'watch' | 'alert' | 'urgent' {
  if (risk < 0.25) return 'none'
  if (risk < 0.50) return 'watch'
  if (risk < 0.75) return 'alert'
  return 'urgent'
}

function syntheticHeatmap(neglect_index: number) {
  // neglect_index near 0.5 = symmetric; < 0.5 = gaze skewed right (left neglect)
  const rightFraction = 0.5 + (0.5 - neglect_index)
  const points: Array<{ x: number; y: number; duration_ms: number }> = []
  let seed = 42
  const rng = () => { seed = (seed * 1664525 + 1013904223) & 0x7fffffff; return seed / 0x7fffffff }
  for (let i = 0; i < 40; i++) {
    const goRight = rng() < rightFraction
    points.push({ x: goRight ? 0.5 + rng() * 0.45 : rng() * 0.45, y: 0.1 + rng() * 0.8, duration_ms: 80 + Math.floor(rng() * 400) })
  }
  return points
}

function synthesis(id: string, alertLevel: string, riskScore: number, scores: Record<string, number>): string {
  const issues = Object.entries(scores).filter(([, v]) => v < 0.35).map(([k]) => k)
  if (alertLevel === 'none')  return `${id}: All clinical domains within functional range. Excellent rehabilitation response. Consider discharge evaluation.`
  if (alertLevel === 'watch') return `${id}: Positive recovery trajectory. Risk score ${riskScore.toFixed(2)} — continue current protocol.`
  if (issues.length > 0)      return `${id}: Clinical attention required in: ${issues.join(', ')}. Risk score ${riskScore.toFixed(2)}.`
  return `${id}: Session completed. Monitoring recovery progression. Risk score ${riskScore.toFixed(2)}.`
}

// ── 5. Convert all DynamoDB sessions to SteadyArc format with ML ──────────────

function buildSteadyArcSessions(dynamo: DoctorSessionJSON[]): SteadyArcSession[] {
  // Build time-series arrays for ML (full history for each metric)
  const gripVals     = dynamo.map(s => (s.grip_MVC ?? 0) * 60)          // → Newtons
  const _releaseVals = dynamo.map(s => s.grip_release_time ?? 0)
  void _releaseVals
  const neglectVals  = dynamo.map(s => {
    const ni = s.neglect_index ?? 0.5
    return 1 - Math.abs(ni - 0.5) * 2   // symmetry score: 0.5→1.0, 0 or 1→0.0
  })
  const rtVals       = dynamo.map(s => s.RT_gaze_to_grip ?? 500)
  const mtVals       = dynamo.map(s => s.wrist_MT ?? 700)
  const attVals      = dynamo.map(s => s.attention_mean ?? 0)

  return dynamo.map((s, i) => {
    const id = `S${i + 1}`

    const metrics = {
      grip_MVC:                (s.grip_MVC ?? 0) * 60,
      grip_release_time:       s.grip_release_time ?? 0,
      emg_cocontraction_ratio: s.emg_cocontraction_ratio ?? 0,
      neglect_index:           s.neglect_index ?? 0.5,
      left_RT:                 s.left_RT ?? 0,
      right_RT:                s.right_RT ?? 0,
      RT_gaze_to_grip:         s.RT_gaze_to_grip ?? 0,
      wrist_MT:                s.wrist_MT ?? 0,
      wrist_SPARC:             s.wrist_SPARC ?? 0,
      attention_mean:          s.attention_mean ?? 0,
    }

    // ML: compute per-domain score using all sessions up to this one (causal)
    const upTo = i + 1
    const grip       = domainScore(gripVals.slice(0, upTo),    true)
    const neglect    = domainScore(neglectVals.slice(0, upTo), true)
    const visuomotor = domainScore([
      ...rtVals.slice(0, upTo).map(v => -v),   // lower RT = better
      ...mtVals.slice(0, upTo).map(v => -v),   // lower MT = better
    ].filter((_, idx) => idx < upTo), true)     // interleaved — average
    const attention  = domainScore(attVals.slice(0, upTo), true)

    // Simpler visuomotor: separate domains averaged
    const visoRT = domainScore(rtVals.slice(0, upTo), false)
    const visoMT = domainScore(mtVals.slice(0, upTo), false)
    const viso   = (visoRT + visoMT) / 2

    const _ = visuomotor   // suppress unused
    void _

    const fusionScore    = grip * 0.25 + neglect * 0.30 + viso * 0.30 + attention * 0.15
    const riskScore      = Math.max(0, Math.min(1, 1 - fusionScore))
    const alertLevel     = toAlertLevel(riskScore)
    const scores         = { grip, neglect, visuomotor: viso, attention }

    const radarScale     = (v: number) => Math.round(10 + v * 140)

    return {
      id,
      date: s.timestamp,
      metrics,
      radar: {
        Grip:       radarScale(grip),
        Neglect:    radarScale(neglect),
        Visuomotor: radarScale(viso),
        Attention:  radarScale(attention),
      },
      globalStatus: {
        riskScore,
        alertLevel,
        domains: {
          grip:       domainStatus(grip),
          neglect:    domainStatus(neglect),
          visuomotor: domainStatus(viso),
          attention:  domainStatus(attention),
        },
        clinicalSynthesis: synthesis(id, alertLevel, riskScore, scores),
      },
      gaze_heatmap: syntheticHeatmap(metrics.neglect_index),
    }
  })
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function buildFromDynamo(
  currentSession: FishingSessionData,
  patientId: string,
): Promise<SteadyArcSession[]> {
  // 1. Save current session (fire-and-forget, don't block on error)
  await postSession(currentSession).catch(() => {/* ignore save errors */})

  // 2. Fetch full history from DynamoDB
  const raw = await fetchSessions(patientId)

  // 3. Filter valid + sort by date
  const valid = raw
    .filter(isValid)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  if (valid.length === 0) throw new Error('No valid sessions in DynamoDB')

  // 4. Build SteadyArc sessions with ML trained on full history
  return buildSteadyArcSessions(valid)
}
