import React, { useState, useEffect } from 'react'
import type { FishingConfig } from '../types'

interface Props {
  config: FishingConfig
  onConfigChange: (c: FishingConfig) => void
  handGrip: number       // 0-1
  gazeX: number
  gazeY: number
  currentPhase: string
  fishCaught: number
}

export function TherapistPanel({ config, onConfigChange, handGrip, gazeX, gazeY, currentPhase, fishCaught }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault()
        setVisible(v => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (!visible) return (
    <div style={styles.hint}>Ctrl+T → panel terapeuta</div>
  )

  const upd = <K extends keyof FishingConfig>(key: K, val: FishingConfig[K]) =>
    onConfigChange({ ...config, [key]: val })

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>Panel Terapeuta</span>
        <button style={styles.closeBtn} onClick={() => setVisible(false)}>✕</button>
      </div>

      <div style={styles.section}>
        <label style={styles.label}>ID Paciente</label>
        <input
          style={styles.input}
          value={config.patientId}
          placeholder="ej. PAC-001"
          onChange={e => upd('patientId', e.target.value)}
        />
      </div>

      <div style={styles.section}>
        <label style={styles.label}>Velocidad peces: {config.fishSpeed}</label>
        <input type="range" min={1} max={5} value={config.fishSpeed}
          style={styles.range}
          onChange={e => upd('fishSpeed', +e.target.value)} />
      </div>

      <div style={styles.section}>
        <label style={styles.label}>Nº peces: {config.fishCount}</label>
        <input type="range" min={4} max={12} value={config.fishCount}
          style={styles.range}
          onChange={e => upd('fishCount', +e.target.value)} />
      </div>

      <div style={styles.section}>
        <label style={styles.label}>Tamaño peces: {config.fishSize}px</label>
        <input type="range" min={16} max={50} value={config.fishSize}
          style={styles.range}
          onChange={e => upd('fishSize', +e.target.value)} />
      </div>

      <div style={styles.section}>
        <label style={styles.label}>Umbral fijación: {config.fixationThresholdMs}ms</label>
        <input type="range" min={500} max={3000} step={100} value={config.fixationThresholdMs}
          style={styles.range}
          onChange={e => upd('fixationThresholdMs', +e.target.value)} />
      </div>

      <div style={styles.divider} />

      <div style={styles.section}>
        <p style={styles.label}>Estado en tiempo real</p>
        <div style={styles.status}>
          <Row k="Fase"        v={currentPhase} />
          <Row k="Peces"       v={`${fishCaught}`} />
          <Row k="Agarre"      v={`${(handGrip * 100).toFixed(0)}%`} />
          <Row k="Gaze"        v={`${gazeX.toFixed(0)}, ${gazeY.toFixed(0)}`} />
        </div>
        <GripBar value={handGrip} />
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
      <span style={{ color: 'rgba(200,230,255,0.6)', fontSize: 12 }}>{k}</span>
      <span style={{ color: '#e0f0ff', fontSize: 12, fontFamily: 'monospace' }}>{v}</span>
    </div>
  )
}

function GripBar({ value }: { value: number }) {
  return (
    <div style={{ marginTop: 8 }}>
      <span style={{ color: 'rgba(200,230,255,0.6)', fontSize: 12 }}>Agarre</span>
      <div style={{ height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, marginTop: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value * 100}%`, background: '#3b82f6', borderRadius: 4, transition: 'width 80ms linear' }} />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  hint:        { position: 'fixed', top: 8, right: 8, fontSize: 11, color: 'rgba(255,255,255,0.2)', fontFamily: 'system-ui', zIndex: 50, pointerEvents: 'none' },
  panel:       { position: 'fixed', top: 0, right: 0, bottom: 0, width: 240, background: 'rgba(8,16,32,0.97)', borderLeft: '1px solid rgba(100,180,255,0.15)', zIndex: 50, overflowY: 'auto', padding: '0 0 24px' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' },
  headerTitle: { fontSize: 14, fontWeight: 700, color: '#7dd3fc', fontFamily: 'system-ui' },
  closeBtn:    { background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 16, cursor: 'pointer' },
  section:     { padding: '10px 16px' },
  label:       { display: 'block', fontSize: 12, color: 'rgba(200,230,255,0.7)', fontFamily: 'system-ui', marginBottom: 6 },
  input:       { width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: '#e0f0ff', fontFamily: 'system-ui', boxSizing: 'border-box' },
  range:       { width: '100%', accentColor: '#3b82f6' },
  divider:     { height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' },
  status:      { background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px' },
}
