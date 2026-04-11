/**
 * strokeModels.ts — Client-side ML models for stroke rehabilitation
 * Ported from steadyarc-hackathon JS models to TypeScript.
 * Uses ml-kmeans v7 for clustering, OLS for linear regression.
 */

import { kmeans } from 'ml-kmeans'
import type { DoctorSessionJSON } from '@/games/fishing/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DomainScore {
  score: number   // 0-1, higher = better recovery
  label: string
  confidence: 'high' | 'low'
}

export interface FusionResult {
  riskScore: number
  alertLevel: 'improving' | 'stable' | 'watch' | 'alert'
  domains: {
    grip: DomainScore
    neglect: DomainScore
    visuomotor: DomainScore
    attention: DomainScore
  }
  clinicalSynthesis: string
}

export interface DashboardSession {
  id: string
  date: string   // ISO string
  metrics: {
    grip_MVC:                number | null
    grip_release_time:       number | null
    emg_cocontraction_ratio: number | null
    neglect_index:           number | null
    left_RT:                 number | null
    right_RT:                number | null
    RT_gaze_to_grip:         number | null
    attention_mean:          number | null
    wrist_MT:                number | null
    wrist_SPARC:             number | null
  }
  globalStatus: FusionResult
  gaze_heatmap: Array<{ x: number; y: number; duration_ms: number }>
  radar: { Grip: number; Neglect: number; Visuomotor: number; Attention: number }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalize a feature array to [0,1] across all sessions */
function normalizeFeature(values: number[]): number[] {
  const valid = values.filter(Number.isFinite)
  if (valid.length === 0) return values.map(() => 0.5)
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  if (max === min) return values.map(() => 0.5)
  return values.map(v => Number.isFinite(v) ? (v - min) / (max - min) : 0.5)
}

/**
 * K-Means 2-cluster scoring: determines which cluster is "better" by
 * comparing the cluster centroids on the first (primary) feature.
 * Returns score 0-1 for each session (1 = in the "better" cluster).
 */
function kmeansScore(
  sessions: DoctorSessionJSON[],
  features: Array<keyof DoctorSessionJSON>,
  higherIsBetter: boolean[],   // per feature: true = higher raw value is better
  minSessions = 5,
): number[] {
  const n = sessions.length
  if (n < minSessions) return sessions.map(() => 0.5)

  // Build feature matrix (rows = sessions, cols = features)
  const rawMatrix = sessions.map(s =>
    features.map(f => {
      const v = s[f]
      return typeof v === 'number' && Number.isFinite(v) ? v : NaN
    })
  )

  // Normalize each column
  const normalized = features.map((_, fi) => {
    const col = rawMatrix.map(row => row[fi])
    return normalizeFeature(col)
  })

  // Transpose back to rows
  const matrix = sessions.map((_, si) =>
    features.map((_, fi) => {
      let v = normalized[fi][si]
      // Flip so that "higher is better" direction is consistent
      if (!higherIsBetter[fi]) v = 1 - v
      return v
    })
  )

  try {
    const km = kmeans(matrix, 2, { initialization: 'kmeans++', seed: 42 })
    const centroids = km.centroids

    // Average centroid score across features
    const c0avg = centroids[0].reduce((a, b) => a + b, 0) / centroids[0].length
    const c1avg = centroids[1].reduce((a, b) => a + b, 0) / centroids[1].length
    const betterCluster = c0avg >= c1avg ? 0 : 1

    // Score: 1.0 if in better cluster, 0.0 otherwise (with slight variance)
    return km.clusters.map((c: number, i: number) => {
      const centroid = centroids[c]
      const sessionVec = matrix[i]
      // Distance-weighted score within the cluster
      const dist = Math.sqrt(centroid.reduce((acc, cv, fi) => acc + (cv - sessionVec[fi]) ** 2, 0))
      const maxDist = Math.sqrt(features.length)   // max possible distance in [0,1]^n
      const closeness = 1 - dist / maxDist
      return c === betterCluster
        ? 0.5 + closeness * 0.5
        : 0.5 - closeness * 0.5
    })
  } catch {
    return sessions.map(() => 0.5)
  }
}

/** Ordinary Least Squares slope for a 1D time series */
function olsSlope(values: number[]): number {
  const n = values.length
  if (n < 2) return 0
  const xs = values.map((_, i) => i)
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = values.reduce((a, b) => a + b, 0) / n
  const num = xs.reduce((acc, x, i) => acc + (x - meanX) * (values[i] - meanY), 0)
  const den = xs.reduce((acc, x) => acc + (x - meanX) ** 2, 0)
  return den === 0 ? 0 : num / den
}

// ── Model 1: Grip & spasticity ────────────────────────────────────────────────

function model1Grip(sessions: DoctorSessionJSON[]): number[] {
  return kmeansScore(
    sessions,
    ['grip_MVC', 'grip_release_time', 'emg_cocontraction_ratio'],
    [true, false, false],   // higher MVC = better; lower release_time = better; lower cocontraction = better
    5,
  )
}

// ── Model 2: Spatial neglect ──────────────────────────────────────────────────

function model2Neglect(sessions: DoctorSessionJSON[]): number[] {
  // neglect_index: 0.5 is best (symmetric), deviation in either direction = worse
  // Transform: score = 1 - |neglect_index - 0.5| * 2  (maps 0.5→1.0, 0 or 1→0.0)
  const augmented = sessions.map(s => ({
    ...s,
    _neglect_symmetry: s.neglect_index !== null ? 1 - Math.abs(s.neglect_index - 0.5) * 2 : NaN,
  }))

  return kmeansScore(
    augmented as unknown as DoctorSessionJSON[],
    ['_neglect_symmetry' as keyof DoctorSessionJSON, 'left_RT', 'right_RT'],
    [true, false, false],
    5,
  )
}

// ── Model 3: Visuomotor coordination ──────────────────────────────────────────

function model3Visuomotor(sessions: DoctorSessionJSON[]): number[] {
  return kmeansScore(
    sessions,
    ['RT_gaze_to_grip', 'wrist_MT', 'wrist_SPARC'],
    [false, false, false],   // lower RT = better; lower MT = better; SPARC more negative = smoother = better
    5,
  )
}

// ── Model 4: Attention trend (linear regression) ──────────────────────────────

function model4Attention(sessions: DoctorSessionJSON[]): number[] {
  const attentions = sessions.map(s => s.attention_mean ?? NaN)
  const valid = attentions.filter(Number.isFinite)
  if (valid.length < 2) return sessions.map(() => 0.5)

  const slope = olsSlope(valid)
  // score = 0.5 + slope*2, clamped to [0,1]
  const trendScore = Math.max(0, Math.min(1, 0.5 + slope * 2))

  // All sessions share the same trend score (global model)
  return sessions.map((_, i) => {
    const a = attentions[i]
    if (!Number.isFinite(a)) return trendScore
    // Per-session: blend raw attention value with trend
    return trendScore * 0.5 + a * 0.5
  })
}

// ── Fusion ────────────────────────────────────────────────────────────────────

const DOMAIN_WEIGHTS = { grip: 0.25, neglect: 0.30, visuomotor: 0.30, attention: 0.15 }

function classifyAlert(score: number): 'improving' | 'stable' | 'watch' | 'alert' {
  if (score > 0.75) return 'improving'
  if (score >= 0.50) return 'stable'
  if (score >= 0.25) return 'watch'
  return 'alert'
}

function domainLabel(score: number, domain: string): string {
  const level = classifyAlert(score)
  const labels: Record<string, Record<string, string>> = {
    grip: {
      improving: 'Fuerza en progresión', stable: 'Fuerza estable',
      watch: 'Fuerza en vigilancia', alert: 'Fuerza comprometida',
    },
    neglect: {
      improving: 'Exploración simétrica', stable: 'Exploración estable',
      watch: 'Asimetría leve', alert: 'Posible negligencia',
    },
    visuomotor: {
      improving: 'Coordinación mejorando', stable: 'Coordinación estable',
      watch: 'Coordinación en vigilancia', alert: 'Coordinación comprometida',
    },
    attention: {
      improving: 'Atención en progresión', stable: 'Atención estable',
      watch: 'Atención fluctuante', alert: 'Déficit atencional',
    },
  }
  return labels[domain]?.[level] ?? level
}

function clinicalSynthesis(alertLevel: string, domains: FusionResult['domains']): string {
  const issues: string[] = []
  Object.values(domains).forEach(d => {
    if (d.score < 0.4) issues.push(d.label.toLowerCase())
  })

  if (alertLevel === 'improving') return 'El paciente muestra una recuperación consistente en todas las áreas evaluadas.'
  if (alertLevel === 'stable')   return 'Estado funcional estable. Continuar con el protocolo actual.'
  if (issues.length > 0)         return `Se recomienda revisar: ${issues.join(', ')}.`
  return 'Monitorizar evolución. Considerar ajuste de protocolo terapéutico.'
}

// ── Main export: run all models on a set of valid sessions ────────────────────

export function runStrokeModels(sessions: DoctorSessionJSON[]): DashboardSession[] {
  if (sessions.length === 0) return []

  const gripScores       = model1Grip(sessions)
  const neglectScores    = model2Neglect(sessions)
  const visuomotorScores = model3Visuomotor(sessions)
  const attentionScores  = model4Attention(sessions)

  return sessions.map((s, i) => {
    const grip       = gripScores[i]
    const neglect    = neglectScores[i]
    const visuomotor = visuomotorScores[i]
    const attention  = attentionScores[i]

    const riskScore =
      grip       * DOMAIN_WEIGHTS.grip +
      neglect    * DOMAIN_WEIGHTS.neglect +
      visuomotor * DOMAIN_WEIGHTS.visuomotor +
      attention  * DOMAIN_WEIGHTS.attention

    const alertLevel = classifyAlert(riskScore)

    const domains: FusionResult['domains'] = {
      grip:       { score: grip,       label: domainLabel(grip,       'grip'),       confidence: sessions.length >= 5 ? 'high' : 'low' },
      neglect:    { score: neglect,    label: domainLabel(neglect,    'neglect'),    confidence: sessions.length >= 5 ? 'high' : 'low' },
      visuomotor: { score: visuomotor, label: domainLabel(visuomotor, 'visuomotor'), confidence: sessions.length >= 5 ? 'high' : 'low' },
      attention:  { score: attention,  label: domainLabel(attention,  'attention'),  confidence: sessions.length >= 2 ? 'high' : 'low' },
    }

    const globalStatus: FusionResult = {
      riskScore,
      alertLevel,
      domains,
      clinicalSynthesis: clinicalSynthesis(alertLevel, domains),
    }

    // Synthetic heatmap: distribute gaze based on neglect_index
    const ni = s.neglect_index ?? 0.5
    const heatmap = generateSyntheticHeatmap(ni)

    // Radar (0-100)
    const radar = {
      Grip:        Math.round(grip * 100),
      Neglect:     Math.round(neglect * 100),
      Visuomotor:  Math.round(visuomotor * 100),
      Attention:   Math.round(attention * 100),
    }

    return {
      id:    s.session_id,
      date:  s.timestamp,
      metrics: {
        grip_MVC:                s.grip_MVC,
        grip_release_time:       s.grip_release_time,
        emg_cocontraction_ratio: s.emg_cocontraction_ratio,
        neglect_index:           s.neglect_index,
        left_RT:                 s.left_RT,
        right_RT:                s.right_RT,
        RT_gaze_to_grip:         s.RT_gaze_to_grip,
        attention_mean:          s.attention_mean,
        wrist_MT:                s.wrist_MT,
        wrist_SPARC:             s.wrist_SPARC,
      },
      globalStatus,
      gaze_heatmap: heatmap,
      radar,
    }
  })
}

/** Generate a synthetic gaze heatmap based on neglect_index (0=all-left, 0.5=symmetric, 1=all-right) */
function generateSyntheticHeatmap(neglect_index: number): Array<{ x: number; y: number; duration_ms: number }> {
  const points: Array<{ x: number; y: number; duration_ms: number }> = []
  const rng = mulberry32(42)

  const totalPoints = 40
  // ni=0.5 → balanced; ni<0.5 → more left gaze; ni>0.5 → more right gaze
  const rightFraction = neglect_index   // fraction of gaze going right half

  for (let i = 0; i < totalPoints; i++) {
    const goRight = rng() < rightFraction
    const x = goRight ? 0.5 + rng() * 0.5 : rng() * 0.5
    const y = 0.15 + rng() * 0.7
    points.push({ x, y, duration_ms: 100 + Math.floor(rng() * 600) })
  }
  return points
}

/** Simple deterministic PRNG (Mulberry32) */
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
