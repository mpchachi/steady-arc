import React, { useEffect, useRef } from 'react'
import type { SessionData } from '@/core/telemetry/types'
import { SessionRecorder } from '@/core/telemetry/SessionRecorder'

interface Props {
  session: SessionData
  onPlayAgain: () => void
}

export function SessionSummary({ session, onPlayAgain }: Props) {
  const heatmapRef = useRef<HTMLCanvasElement>(null)
  const m = session.metrics

  useEffect(() => {
    const canvas = heatmapRef.current
    if (!canvas || m.gazeHeatmap.length === 0) return

    const W = 320
    const H = 200
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')!

    const scaleX = W / session.screenWidth
    const scaleY = H / session.screenHeight

    ctx.fillStyle = '#0a0a14'
    ctx.fillRect(0, 0, W, H)

    for (const pt of m.gazeHeatmap) {
      const grd = ctx.createRadialGradient(
        pt.x * scaleX, pt.y * scaleY, 0,
        pt.x * scaleX, pt.y * scaleY, 18,
      )
      grd.addColorStop(0, `rgba(255,100,0,${pt.weight * 0.8})`)
      grd.addColorStop(0.5, `rgba(255,50,0,${pt.weight * 0.3})`)
      grd.addColorStop(1, 'rgba(255,0,0,0)')
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.arc(pt.x * scaleX, pt.y * scaleY, 18, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [m.gazeHeatmap, session.screenWidth, session.screenHeight])

  const totalSec = Math.round(m.totalDurationMs / 1000)
  const mins = Math.floor(totalSec / 60)
  const secs = totalSec % 60
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <h1 style={styles.title}>Sesión completada</h1>

        <div style={styles.statsGrid}>
          <Stat label="Tiempo total" value={timeStr} />
          <Stat label="Área explorada" value={`${Math.round(m.percentAreaExplored * 100)}%`} />
          <Stat label="Fijaciones" value={m.totalFixations.toString()} />
          <Stat label="Duración media fijación" value={`${Math.round(m.meanFixationDurationMs)} ms`} />
          <Stat label="Saccades" value={m.totalSaccades.toString()} />
          <Stat label="Amplitud media saccade" value={`${Math.round(m.meanSaccadeAmplitude)} px`} />
        </div>

        <div style={styles.heatmapSection}>
          <p style={styles.sectionLabel}>Mapa de calor de la mirada</p>
          <canvas ref={heatmapRef} style={styles.heatmapCanvas} />
        </div>

        <div style={styles.actions}>
          <button
            style={styles.btnPrimary}
            onClick={onPlayAgain}
          >
            Jugar otra vez
          </button>
          <button
            style={styles.btnSecondary}
            onClick={() => SessionRecorder.downloadSession(session)}
          >
            Descargar sesión JSON
          </button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={statStyles.box}>
      <span style={statStyles.value}>{value}</span>
      <span style={statStyles.label}>{label}</span>
    </div>
  )
}

const statStyles: Record<string, React.CSSProperties> = {
  box: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '12px 8px',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
  },
  value: {
    fontSize: 28,
    fontWeight: 700,
    color: '#4ade80',
    fontFamily: 'system-ui',
  },
  label: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center' as const,
    fontFamily: 'system-ui',
  },
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.92)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
    backdropFilter: 'blur(8px)',
  },
  card: {
    background: '#111827',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: '32px 40px',
    maxWidth: 600,
    width: '90%',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: '#fff',
    fontFamily: 'system-ui',
    textAlign: 'center',
    margin: 0,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
  },
  heatmapSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'system-ui',
    fontSize: 13,
    margin: 0,
  },
  heatmapCanvas: {
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    width: 320,
    height: 200,
    display: 'block',
  },
  actions: {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  btnPrimary: {
    background: '#4ade80',
    color: '#000',
    border: 'none',
    borderRadius: 8,
    padding: '12px 28px',
    fontSize: 15,
    fontWeight: 700,
    fontFamily: 'system-ui',
    cursor: 'pointer',
  },
  btnSecondary: {
    background: 'transparent',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 8,
    padding: '12px 28px',
    fontSize: 15,
    fontFamily: 'system-ui',
    cursor: 'pointer',
  },
}
