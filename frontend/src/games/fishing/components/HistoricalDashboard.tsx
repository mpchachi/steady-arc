/**
 * HistoricalDashboard.tsx
 * Full historical session dashboard — shown after session end.
 * Charts implemented with SVG (no recharts dependency).
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { loadDashboardSessions } from '../utils/sessionTransformer'
import type { DashboardSession } from '@/ml/strokeModels'
import type { FishingSessionData, DoctorSessionJSON } from '../types'
import { API_BASE_URL } from '@/config'
import styles from './HistoricalDashboard.module.css'

interface Props {
  session: FishingSessionData
  onPlayAgain: () => void
  onBackToMenu: () => void
}

// ── Alert colors ──────────────────────────────────────────────────────────────

const ALERT_COLORS = {
  improving: '#34d399',
  stable:    '#60a5fa',
  watch:     '#fbbf24',
  alert:     '#f87171',
} as const

const DOMAIN_COLORS = {
  Grip:       '#38bdf8',
  Neglect:    '#a78bfa',
  Visuomotor: '#34d399',
  Attention:  '#fb923c',
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, unit = '', d = 1): string {
  if (v === null || v === undefined) return '—'
  return `${v.toFixed(d)}${unit}`
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
  } catch { return '?' }
}

function alertLabel(level: string): string {
  const labels: Record<string, string> = {
    improving: '↑ Mejorando', stable: '= Estable',
    watch: '⚡ Vigilar',     alert:  '⚠ Alerta',
  }
  return labels[level] ?? level
}

// ── SVG Line Chart ────────────────────────────────────────────────────────────

interface LineChartProps {
  data: number[]
  labels: string[]
  color: string
  label: string
  height?: number
}

function MiniLineChart({ data, labels, color, label, height = 120 }: LineChartProps) {
  if (data.length < 2) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(180,220,255,0.3)', fontSize: 12 }}>Datos insuficientes</div>

  const W = 400; const H = height
  const pad = { top: 10, right: 10, bottom: 28, left: 30 }
  const iW = W - pad.left - pad.right
  const iH = H - pad.top - pad.bottom

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((v, i) => ({
    x: pad.left + (i / (data.length - 1)) * iW,
    y: pad.top + (1 - (v - min) / range) * iH,
    v,
  }))

  const polyline = points.map(p => `${p.x},${p.y}`).join(' ')
  const area = `M${points[0].x},${pad.top + iH} ` +
    points.map(p => `L${p.x},${p.y}`).join(' ') +
    ` L${points[points.length - 1].x},${pad.top + iH} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height }}>
      {/* Grid lines */}
      {[0, 0.5, 1].map(t => {
        const y = pad.top + t * iH
        return <line key={t} x1={pad.left} y1={y} x2={pad.left + iW} y2={y} stroke="rgba(100,180,255,0.08)" strokeWidth={1} />
      })}
      {/* Y labels */}
      {[0, 50, 100].map((v, i) => {
        const y = pad.top + (1 - v / 100) * iH
        return <text key={i} x={pad.left - 4} y={y + 4} textAnchor="end" fontSize={9} fill="rgba(150,200,255,0.35)">{v}</text>
      })}
      {/* Area fill */}
      <path d={area} fill={color} fillOpacity={0.08} />
      {/* Line */}
      <polyline points={polyline} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {/* Dots + x labels */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill={color} />
          {i % Math.max(1, Math.floor(data.length / 6)) === 0 && (
            <text x={p.x} y={H - 4} textAnchor="middle" fontSize={9} fill="rgba(150,200,255,0.35)">{labels[i]}</text>
          )}
        </g>
      ))}
      {/* Chart label */}
      <text x={pad.left} y={pad.top - 2} fontSize={10} fill={color} opacity={0.7}>{label}</text>
    </svg>
  )
}

// ── SVG Radar Chart ────────────────────────────────────────────────────────────

interface RadarChartProps {
  values: { label: string; value: number }[]   // value 0-100
  color: string
  size?: number
}

function RadarChart({ values, color, size = 200 }: RadarChartProps) {
  const n = values.length
  const cx = size / 2; const cy = size / 2
  const r = size * 0.38

  const angle = (i: number) => (i / n) * 2 * Math.PI - Math.PI / 2

  // Grid rings
  const rings = [0.25, 0.5, 0.75, 1].map(t => {
    const pts = values.map((_, i) => {
      const a = angle(i)
      return `${cx + Math.cos(a) * r * t},${cy + Math.sin(a) * r * t}`
    }).join(' ')
    return <polygon key={t} points={pts} fill="none" stroke="rgba(100,180,255,0.12)" strokeWidth={1} />
  })

  // Spoke lines
  const spokes = values.map((_, i) => {
    const a = angle(i)
    return <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(a) * r} y2={cy + Math.sin(a) * r} stroke="rgba(100,180,255,0.12)" strokeWidth={1} />
  })

  // Data polygon
  const dataPoints = values.map((v, i) => {
    const a = angle(i)
    const t = v.value / 100
    return `${cx + Math.cos(a) * r * t},${cy + Math.sin(a) * r * t}`
  })
  const poly = dataPoints.join(' ')

  // Labels
  const labels = values.map((v, i) => {
    const a = angle(i)
    const lx = cx + Math.cos(a) * (r + 18)
    const ly = cy + Math.sin(a) * (r + 18)
    return (
      <text key={i} x={lx} y={ly + 4} textAnchor="middle" fontSize={10} fill="rgba(180,220,255,0.55)">
        {v.label}
      </text>
    )
  })

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', height: size }}>
      {rings}
      {spokes}
      <polygon points={poly} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={2} />
      {values.map((v, i) => {
        const a = angle(i); const t = v.value / 100
        return <circle key={i} cx={cx + Math.cos(a) * r * t} cy={cy + Math.sin(a) * r * t} r={3.5} fill={color} />
      })}
      {labels}
    </svg>
  )
}

// ── Gaze Heatmap ──────────────────────────────────────────────────────────────

function GazeHeatmap({ points }: { points: Array<{ x: number; y: number; duration_ms: number }> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width; const H = canvas.height

    ctx.fillStyle = '#020810'; ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(100,180,255,0.12)'; ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke()
    ctx.setLineDash([])

    for (const p of points) {
      const px = p.x * W; const py = p.y * H
      const radius = 18 + (p.duration_ms / 800) * 24
      const alpha  = Math.min(0.55, p.duration_ms / 1500)
      const grd = ctx.createRadialGradient(px, py, 0, px, py, radius)
      grd.addColorStop(0, `rgba(255,80,0,${alpha})`)
      grd.addColorStop(0.5, `rgba(255,60,0,${alpha * 0.4})`)
      grd.addColorStop(1, 'rgba(255,40,0,0)')
      ctx.fillStyle = grd
      ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI * 2); ctx.fill()
    }
  }, [points])

  return (
    <div className={styles.heatmapWrap}>
      <canvas ref={canvasRef} width={480} height={270} className={styles.heatmapCanvas} />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function HistoricalDashboard({ session, onPlayAgain, onBackToMenu }: Props) {
  const [allSessions, setAllSessions] = useState<DashboardSession[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const [saveStatus, setSaveStatus]   = useState<'saving' | 'saved' | 'error'>('saving')
  const patientId = session.patientId

  useEffect(() => {
    const m = session.global_metrics
    const doc: DoctorSessionJSON = {
      session_id:              session.sessionId,
      patient_id:              patientId,
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

    fetch(`${API_BASE_URL}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); setSaveStatus('saved') })
      .catch(() => setSaveStatus('error'))
      .finally(() => {
        loadDashboardSessions(patientId)
          .then(result => {
            if (result.error) setError(result.error)
            setAllSessions(result.sessions)
            setSelectedIdx(result.sessions.length - 1)
          })
          .catch(e => setError(String(e)))
          .finally(() => setLoading(false))
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDownload = useCallback(() => {
    const m = session.global_metrics
    const doc = {
      session_id: session.sessionId, patient_id: patientId,
      timestamp: new Date(session.startTime).toISOString(),
      grip_MVC: m.grip_MVC, grip_release_time: m.grip_release_time,
      emg_cocontraction_ratio: m.emg_cocontraction_ratio,
      neglect_index: m.neglect_index, left_RT: m.left_RT, right_RT: m.right_RT,
      RT_gaze_to_grip: m.RT_gaze_to_grip, attention_mean: m.attention_mean,
      wrist_MT: m.wrist_MT, wrist_SPARC: m.wrist_SPARC,
    }
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })),
      download: `metrics_${session.sessionId.slice(0, 8)}.json`,
    }); a.click()
  }, [session, patientId])

  const idx = selectedIdx < 0 ? allSessions.length - 1 : selectedIdx
  const current: DashboardSession | undefined = allSessions[idx]

  const alertColor = ALERT_COLORS[current?.globalStatus.alertLevel ?? 'stable']

  // Data for evolution line chart
  const evoLabels  = allSessions.map(s => fmtDate(s.date))
  const evoScore   = allSessions.map(s => Math.round(s.globalStatus.riskScore * 100))

  // Radar values for current session
  const radarData = current ? [
    { label: 'Agarre',      value: current.radar.Grip },
    { label: 'Exploración', value: current.radar.Neglect },
    { label: 'Visomotor',   value: current.radar.Visuomotor },
    { label: 'Atención',    value: current.radar.Attention },
  ] : []

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className={styles.container}>
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <span>Cargando historial…</span>
      </div>
    </div>
  )

  // ── No data ────────────────────────────────────────────────────────────────
  if (allSessions.length === 0) return (
    <div className={styles.container}>
      <Header patientId={patientId} saveStatus={saveStatus} onDownload={handleDownload} onPlayAgain={onPlayAgain} onBackToMenu={onBackToMenu} />
      <div className={styles.noData}>
        <div className={styles.noDataTitle}>Sin datos históricos</div>
        <p style={{ color: 'rgba(150,200,255,0.5)', fontSize: 14, maxWidth: 400, textAlign: 'center' }}>
          {error ? `Error: ${error}` : 'Sesión guardada. Los modelos ML necesitan más sesiones para el análisis.'}
        </p>
        <button className={styles.btnPrimary} onClick={onPlayAgain} style={{ marginTop: 16 }}>Nueva sesión</button>
      </div>
    </div>
  )

  const alertClass = ({ improving: styles.alertImproving, stable: styles.alertStable, watch: styles.alertWatch, alert: styles.alertAlert } as Record<string, string>)[current?.globalStatus.alertLevel ?? 'stable']
  const alertBadgeClass = ({ improving: styles.alertBadgeImproving, stable: styles.alertBadgeStable, watch: styles.alertBadgeWatch, alert: styles.alertBadgeAlert } as Record<string, string>)[current?.globalStatus.alertLevel ?? 'stable']

  return (
    <div className={styles.container}>
      <Header patientId={patientId} saveStatus={saveStatus} onDownload={handleDownload} onPlayAgain={onPlayAgain} onBackToMenu={onBackToMenu} />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className={styles.hero}>
        <div className={`${styles.alertCard} ${alertClass}`}>
          <div className={`${styles.alertBadge} ${alertBadgeClass}`}>{alertLabel(current?.globalStatus.alertLevel ?? 'stable')}</div>
          <div className={styles.alertScore} style={{ color: alertColor }}>
            {Math.round((current?.globalStatus.riskScore ?? 0) * 100)}
            <span style={{ fontSize: 20, fontWeight: 400, opacity: 0.6 }}>/100</span>
          </div>
          <div className={styles.alertTitle}>Índice de Recuperación</div>
          <div className={styles.alertSynthesis}>{current?.globalStatus.clinicalSynthesis}</div>
          <div className={styles.alertMeta}>Sesión {idx + 1} de {allSessions.length} · {fmtDate(current?.date ?? '')}</div>
        </div>

        <div className={styles.heatmapCard}>
          <p className={styles.cardTitle}>Mapa de distribución visual</p>
          <GazeHeatmap points={current?.gaze_heatmap ?? []} />
          <div className={styles.neglectLabels}>
            <span>← Hemicampo izquierdo</span>
            <span>Hemicampo derecho →</span>
          </div>
        </div>
      </div>

      {/* ── Domain cards ──────────────────────────────────────────────────── */}
      {current && (
        <div className={styles.metricsSection}>
          <p className={styles.sectionTitle}>Dominios clínicos</p>
          <div className={styles.domainsGrid}>
            <DomainCard name="Fuerza y Espasticidad"    domain={current.globalStatus.domains.grip}       color={DOMAIN_COLORS.Grip} />
            <DomainCard name="Exploración Espacial"     domain={current.globalStatus.domains.neglect}    color={DOMAIN_COLORS.Neglect} />
            <DomainCard name="Coordinación Visomotora"  domain={current.globalStatus.domains.visuomotor} color={DOMAIN_COLORS.Visuomotor} />
            <DomainCard name="Atención Sostenida"       domain={current.globalStatus.domains.attention}  color={DOMAIN_COLORS.Attention} />
          </div>
        </div>
      )}

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      <div className={styles.chartsRow}>
        <div className={styles.chartCard}>
          <p className={styles.cardTitle}>Perfil de sesión actual</p>
          {radarData.length > 0 && <RadarChart values={radarData} color={alertColor} size={220} />}
        </div>
        <div className={styles.chartCard}>
          <p className={styles.cardTitle}>Evolución histórica — Score global</p>
          <MiniLineChart data={evoScore} labels={evoLabels} color={alertColor} label="Score" height={200} />
        </div>
      </div>

      {/* ── Metrics table ────────────────────────────────────────���────────── */}
      {current && (
        <div className={styles.metricsTableSection}>
          <p className={styles.sectionTitle}>Métricas clínicas — Sesión {idx + 1}</p>
          <div className={styles.metricsTable}>
            <MetricRow label="MVC (fuerza máxima)"     value={fmt(current.metrics.grip_MVC !== null ? (current.metrics.grip_MVC ?? 0) * 60 : null, ' N', 1)} />
            <MetricRow label="Tiempo de liberación"    value={fmt(current.metrics.grip_release_time, ' ms', 0)} />
            <MetricRow label="Co-contracción (EMG)"    value={fmt(current.metrics.emg_cocontraction_ratio, '', 3)} />
            <MetricRow label="Índice de negligencia"   value={fmt(current.metrics.neglect_index, '', 3)} />
            <MetricRow label="RT hemicampo izquierdo"  value={fmt(current.metrics.left_RT, ' ms', 0)} />
            <MetricRow label="RT hemicampo derecho"    value={fmt(current.metrics.right_RT, ' ms', 0)} />
            <MetricRow label="RT fijación → agarre"    value={fmt(current.metrics.RT_gaze_to_grip, ' ms', 0)} />
            <MetricRow label="Atención en targets"     value={fmt(current.metrics.attention_mean !== null ? (current.metrics.attention_mean ?? 0) * 100 : null, '%', 0)} />
            <MetricRow label="Tiempo de movimiento"    value={fmt(current.metrics.wrist_MT, ' ms', 0)} />
            <MetricRow label="Suavidad (SPARC)"        value={fmt(current.metrics.wrist_SPARC, '', 3)} />
          </div>
        </div>
      )}

      {/* ── Timeline ──────────────────────────────────────────────────────── */}
      <div className={styles.timelineSection}>
        <p className={styles.sectionTitle}>Historial de sesiones</p>
        <div className={styles.timeline}>
          {allSessions.map((s, i) => {
            const color = ALERT_COLORS[s.globalStatus.alertLevel]
            return (
              <div key={s.id} className={`${styles.timelineItem} ${i === idx ? styles.timelineItemActive : ''}`} onClick={() => setSelectedIdx(i)}>
                <div className={styles.timelineDate}>{fmtDate(s.date)}</div>
                <div className={styles.timelineDot} style={{ background: color }} />
                <div className={styles.timelineScore} style={{ color }}>{Math.round(s.globalStatus.riskScore * 100)}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Header({ patientId, saveStatus, onDownload, onPlayAgain, onBackToMenu }: {
  patientId: string; saveStatus: 'saving' | 'saved' | 'error'
  onDownload: () => void; onPlayAgain: () => void; onBackToMenu: () => void
}) {
  const saveColor = saveStatus === 'saving' ? '#7dd3fc' : saveStatus === 'saved' ? '#4ade80' : '#f87171'
  const saveLabel = saveStatus === 'saving' ? '⏳ Guardando…' : saveStatus === 'saved' ? '✓ Guardado' : '⚠ Error'
  return (
    <div className={styles.header}>
      <div className={styles.headerLeft}>
        <span className={styles.logo}>NeuroRehab</span>
        <span className={styles.patientBadge}>{patientId}</span>
        <span style={{ fontSize: 12, color: saveColor }}>{saveLabel}</span>
      </div>
      <div className={styles.headerActions}>
        <button className={styles.btnSecondary} onClick={onDownload}>📊 Exportar</button>
        <button className={styles.btnSecondary} onClick={onBackToMenu}>Menú</button>
        <button className={styles.btnPrimary} onClick={onPlayAgain}>Nueva sesión</button>
      </div>
    </div>
  )
}

function DomainCard({ name, domain, color }: {
  name: string
  domain: { score: number; label: string; confidence: 'high' | 'low' }
  color: string
}) {
  const pct = Math.round(domain.score * 100)
  return (
    <div className={styles.domainCard}>
      <div className={styles.domainHeader}>
        <span className={styles.domainName}>{name}</span>
        <span className={`${styles.confidenceBadge} ${domain.confidence === 'high' ? styles.confidenceHigh : styles.confidenceLow}`}>
          {domain.confidence === 'high' ? 'ML' : 'Est.'}
        </span>
      </div>
      <div className={styles.domainScore} style={{ color }}>{pct}</div>
      <div className={styles.domainLabel}>{domain.label}</div>
      <div className={styles.scoreBar}>
        <div className={styles.scoreBarFill} style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metricRow}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
    </div>
  )
}
