import React, { useEffect, useState } from 'react'
import type { FishingSessionData, DoctorSessionJSON } from '../types'
import { API_BASE_URL } from '@/config'

interface Props {
  session: FishingSessionData
  onPlayAgain: () => void
  onBackToMenu: () => void
}

export function FishingSessionSummary({ session, onPlayAgain, onBackToMenu }: Props) {
  const m = session.global_metrics
  const dur  = Math.round((session.endTime - session.startTime) / 1000)
  const mins = Math.floor(dur / 60); const secs = dur % 60

  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saving')

  const buildDoctorJSON = (): DoctorSessionJSON => ({
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
  })

  useEffect(() => {
    fetch(`${API_BASE_URL}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildDoctorJSON()),
    })
      .then(r => { if (!r.ok) throw new Error(''); setSaveStatus('saved') })
      .catch(() => setSaveStatus('error'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDownload = () =>
    dl(JSON.stringify(buildDoctorJSON(), null, 2), `metrics_${session.sessionId.slice(0,8)}.json`)
  const handleDownloadRaw = () =>
    dl(JSON.stringify(session, null, 2), `raw_${session.sessionId.slice(0,8)}.json`)
  function dl(content: string, filename: string) {
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([content], { type: 'application/json' })),
      download: filename,
    }); a.click()
  }

  const fmt = (v: number | null, unit = '', d = 2) => v === null ? '—' : `${v.toFixed(d)}${unit}`

  // Neglect
  const ni = m.neglect_index
  const neglectText  = ni === null ? '—'
    : ni < 0.35 ? `${(ni*100).toFixed(0)}% ⚠ Posible negligencia derecha`
    : ni > 0.65 ? `${(ni*100).toFixed(0)}% ⚠ Posible negligencia izquierda`
    : `${(ni*100).toFixed(0)}% ✓ Campo visual simétrico`
  const neglectColor = ni === null ? '#7dd3fc' : (ni < 0.35 || ni > 0.65) ? '#fbbf24' : '#4ade80'

  // Asymmetry bar position (0-100%)
  const niPct = ni !== null ? ni * 100 : 50

  return (
    <div style={s.wrap}>
      <div style={s.card}>

        <h2 style={s.title}>Sesión completada</h2>
        <p style={s.subtitle}>{session.fishCatches.length} capturas · {mins}m {secs}s · {session.patientId}</p>
        <div style={s.saveRow}>
          {saveStatus === 'saving' && <span style={{ color: '#7dd3fc' }}>⏳ Guardando...</span>}
          {saveStatus === 'saved'  && <span style={{ color: '#4ade80' }}>✓ Guardado en AWS</span>}
          {saveStatus === 'error'  && <span style={{ color: '#f87171' }}>⚠ Error — descarga el JSON</span>}
        </div>

        {/* ── Neglect index — métrica estrella ── */}
        <div style={s.neglectBox}>
          <p style={s.neglectTitle}>Índice de Negligencia Hemispatial</p>
          <p style={{ ...s.neglectValue, color: neglectColor }}>{neglectText}</p>
          <div style={s.barTrack}>
            <div style={{ ...s.barCenter }} />
            {ni !== null && <div style={{ ...s.barMarker, left: `${niPct}%` }} />}
            <span style={{ ...s.barLabel, left: 4 }}>Izquierda</span>
            <span style={{ ...s.barLabel, left: '50%', transform: 'translateX(-50%)' }}>Centro</span>
            <span style={{ ...s.barLabel, right: 4 }}>Derecha</span>
          </div>
        </div>

        {/* ── 4 sub-scores ── */}
        <div style={s.grid}>

          <SubScore title="Fuerza y espasticidad" color="#38bdf8">
            <Row label="MVC (fuerza máxima)"   value={fmt(m.grip_MVC,          '', 3)} />
            <Row label="Tiempo de liberación"  value={fmt(m.grip_release_time, ' ms', 0)} />
            <Row label="Co-contracción (EMG)"  value={fmt(m.emg_cocontraction_ratio, '', 3)} />
          </SubScore>

          <SubScore title="Exploración espacial" color="#a78bfa">
            <Row label="Índice negligencia"    value={fmt(ni,          '', 2)} />
            <Row label="RT izquierda"          value={fmt(m.left_RT,  ' ms', 0)} />
            <Row label="RT derecha"            value={fmt(m.right_RT, ' ms', 0)} />
          </SubScore>

          <SubScore title="Coordinación ojo-mano" color="#34d399">
            <Row label="RT fijación → agarre"  value={fmt(m.RT_gaze_to_grip, ' ms', 0)} />
            <Row label="Atención en targets"   value={fmt(m.attention_mean !== null ? m.attention_mean * 100 : null, '%', 0)} />
          </SubScore>

          <SubScore title="Calidad de movimiento" color="#fb923c">
            <Row label="Tiempo movimiento"     value={fmt(m.wrist_MT,    ' ms', 0)} />
            <Row label="Suavidad (SPARC)"      value={fmt(m.wrist_SPARC, '', 3)} />
          </SubScore>

        </div>

        <div style={s.buttons}>
          <button style={s.btnSec} onClick={handleDownload}>📊 Métricas</button>
          <button style={s.btnSec} onClick={handleDownloadRaw}>🗂 Raw</button>
          <button style={s.btnSec} onClick={onBackToMenu}>Menú</button>
          <button style={s.btnPri} onClick={onPlayAgain}>Nueva sesión</button>
        </div>

      </div>
    </div>
  )
}

function SubScore({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase' as const, letterSpacing: 1, margin: '0 0 6px', fontFamily: 'system-ui' }}>{title}</p>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <span style={{ fontSize: 13, color: 'rgba(200,230,255,0.65)', fontFamily: 'system-ui' }}>{label}</span>
      <span style={{ fontSize: 13, color: '#e0f0ff', fontFamily: 'monospace', fontWeight: 600 }}>{value}</span>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap:         { position: 'fixed', inset: 0, background: 'rgba(5,12,25,0.97)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, overflowY: 'auto', padding: 24 },
  card:         { background: '#0a1628', border: '1px solid rgba(100,180,255,0.2)', borderRadius: 20, padding: '28px 32px', maxWidth: 680, width: '100%' },
  title:        { fontSize: 26, fontWeight: 900, color: '#e0f0ff', fontFamily: 'system-ui', margin: '0 0 4px', textAlign: 'center' },
  subtitle:     { fontSize: 14, color: '#7dd3fc', fontFamily: 'system-ui', textAlign: 'center', margin: '0 0 4px' },
  saveRow:      { fontSize: 12, fontFamily: 'system-ui', textAlign: 'center', margin: '0 0 18px', minHeight: 18 },
  // Neglect
  neglectBox:   { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(100,180,255,0.12)', borderRadius: 12, padding: '14px 16px', marginBottom: 20 },
  neglectTitle: { fontSize: 11, fontWeight: 700, color: 'rgba(120,180,255,0.6)', textTransform: 'uppercase' as const, letterSpacing: 1, fontFamily: 'system-ui', margin: '0 0 4px' },
  neglectValue: { fontSize: 17, fontWeight: 700, fontFamily: 'system-ui', margin: '0 0 12px' },
  barTrack:     { position: 'relative', height: 20, background: 'rgba(255,255,255,0.06)', borderRadius: 4 },
  barCenter:    { position: 'absolute', top: 0, left: '50%', width: 2, height: '60%', background: 'rgba(255,255,255,0.25)', transform: 'translateX(-50%)', marginTop: '20%' },
  barMarker:    { position: 'absolute', top: '15%', width: 10, height: '70%', background: '#fbbf24', borderRadius: 3, transform: 'translateX(-50%)' },
  barLabel:     { position: 'absolute', bottom: 2, fontSize: 10, color: 'rgba(200,230,255,0.35)', fontFamily: 'system-ui' },
  // Grid
  grid:         { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 28px' },
  buttons:      { display: 'flex', gap: 10, marginTop: 20, justifyContent: 'center', flexWrap: 'wrap' as const },
  btnPri:       { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 22px', fontSize: 14, fontWeight: 700, fontFamily: 'system-ui', cursor: 'pointer' },
  btnSec:       { background: 'rgba(255,255,255,0.07)', color: '#e0f0ff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontFamily: 'system-ui', cursor: 'pointer' },
}
