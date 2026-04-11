/**
 * sessionTransformer.ts
 * Fetch sessions from DynamoDB via API Gateway, filter valid ones,
 * run ML models, and return DashboardSession[] ready for rendering.
 *
 * Valid session = has neglect_index field (old sessions with different
 * metric format are silently ignored).
 */

import { API_BASE_URL } from '@/config'
import type { DoctorSessionJSON } from '@/games/fishing/types'
import { runStrokeModels, type DashboardSession } from '@/ml/strokeModels'

// ── Fetch ─────────────────────────────────────────────────────────────────────

/** GET /session?patient_id=<pid> → raw items from DynamoDB */
async function fetchSessionsFromDB(patientId: string): Promise<DoctorSessionJSON[]> {
  const res = await fetch(`${API_BASE_URL}/session?patient_id=${encodeURIComponent(patientId)}`)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  const data = await res.json()

  // API may return array directly or nested under a key
  const items: unknown[] = Array.isArray(data)
    ? data
    : (data?.items ?? data?.sessions ?? data?.Items ?? [])

  return items as DoctorSessionJSON[]
}

// ── Filter ────────────────────────────────────────────────────────────────────

/**
 * A session is considered "valid" for ML if it has at least the
 * neglect_index field (indicates it was recorded with the current schema).
 * Also accepts sessions that have at least 3 non-null metric fields.
 */
function isValidSession(s: unknown): s is DoctorSessionJSON {
  if (typeof s !== 'object' || s === null) return false
  const obj = s as Record<string, unknown>
  // Must have patient_id, session_id, timestamp
  if (!obj.session_id || !obj.patient_id || !obj.timestamp) return false
  // Must have the neglect_index field (not necessarily non-null)
  if (!('neglect_index' in obj)) return false
  return true
}

// ── Sort ──────────────────────────────────────────────────────────────────────

function sortByDate(sessions: DoctorSessionJSON[]): DoctorSessionJSON[] {
  return [...sessions].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export interface TransformResult {
  sessions: DashboardSession[]
  rawCount: number
  filteredCount: number
  error?: string
}

export async function loadDashboardSessions(patientId: string): Promise<TransformResult> {
  let raw: DoctorSessionJSON[] = []

  try {
    raw = await fetchSessionsFromDB(patientId)
  } catch (e) {
    return { sessions: [], rawCount: 0, filteredCount: 0, error: String(e) }
  }

  const valid = raw.filter(isValidSession)
  const sorted = sortByDate(valid)

  const sessions = runStrokeModels(sorted)

  return {
    sessions,
    rawCount: raw.length,
    filteredCount: sorted.length,
  }
}
