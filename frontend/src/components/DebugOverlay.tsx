import React from 'react'
import type { GazePoint } from '@/core/eyeTracking/types'
import type { IrisLandmarks } from '@/core/eyeTracking/types'

interface Props {
  gaze: GazePoint | null
  iris: IrisLandmarks | null
  fps: number
  visible: boolean
}

export function DebugOverlay({ gaze, iris, fps, visible }: Props) {
  if (!visible) return null

  return (
    <>
      {/* Crosshair raw */}
      {gaze && (
        <svg
          style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 900 }}
          width="100%"
          height="100%"
        >
          {/* Raw gaze — red */}
          <circle cx={gaze.rawX} cy={gaze.rawY} r={6} fill="none" stroke="red" strokeWidth={2} />
          <line x1={gaze.rawX - 12} y1={gaze.rawY} x2={gaze.rawX + 12} y2={gaze.rawY} stroke="red" strokeWidth={1} />
          <line x1={gaze.rawX} y1={gaze.rawY - 12} x2={gaze.rawX} y2={gaze.rawY + 12} stroke="red" strokeWidth={1} />

          {/* Filtered gaze — cyan */}
          <circle cx={gaze.filteredX} cy={gaze.filteredY} r={8} fill="none" stroke="cyan" strokeWidth={2} />
          <line x1={gaze.filteredX - 16} y1={gaze.filteredY} x2={gaze.filteredX + 16} y2={gaze.filteredY} stroke="cyan" strokeWidth={1} />
          <line x1={gaze.filteredX} y1={gaze.filteredY - 16} x2={gaze.filteredX} y2={gaze.filteredY + 16} stroke="cyan" strokeWidth={1} />
        </svg>
      )}

      {/* Stats panel */}
      <div style={styles.panel}>
        <div style={styles.row}><span style={styles.label}>FPS</span><span style={getFpsColor(fps)}>{fps}</span></div>
        <div style={styles.row}><span style={styles.label}>Blinking</span><span>{gaze?.isBlinking ? '👁 YES' : 'no'}</span></div>
        <div style={styles.row}><span style={styles.label}>Saccade</span><span>{gaze?.isSaccade ? '→ YES' : 'no'}</span></div>
        <div style={styles.row}><span style={styles.label}>Raw X/Y</span><span>{gaze ? `${Math.round(gaze.rawX)}, ${Math.round(gaze.rawY)}` : '—'}</span></div>
        <div style={styles.row}><span style={styles.label}>Filtered</span><span>{gaze ? `${Math.round(gaze.filteredX)}, ${Math.round(gaze.filteredY)}` : '—'}</span></div>
        {iris && (
          <>
            <div style={styles.divider} />
            <div style={styles.row}><span style={styles.label}>L iris ratio</span><span>{iris.leftIrisRatio.x.toFixed(3)}, {iris.leftIrisRatio.y.toFixed(3)}</span></div>
            <div style={styles.row}><span style={styles.label}>R iris ratio</span><span>{iris.rightIrisRatio.x.toFixed(3)}, {iris.rightIrisRatio.y.toFixed(3)}</span></div>
            <div style={styles.row}><span style={styles.label}>L openness</span><span>{iris.leftEyeOpenness.toFixed(3)}</span></div>
            <div style={styles.row}><span style={styles.label}>R openness</span><span>{iris.rightEyeOpenness.toFixed(3)}</span></div>
          </>
        )}
        <div style={styles.divider} />
        <div style={{ ...styles.row, color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
          Press D to toggle
        </div>
      </div>
    </>
  )
}

function getFpsColor(fps: number): React.CSSProperties {
  const color = fps >= 28 ? '#4ade80' : fps >= 20 ? '#fbbf24' : '#f87171'
  return { color }
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'fixed',
    top: 16,
    left: 16,
    background: 'rgba(0,0,0,0.82)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    padding: '10px 14px',
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#e2e8f0',
    zIndex: 950,
    minWidth: 200,
    pointerEvents: 'none',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 4,
  },
  label: {
    color: 'rgba(255,255,255,0.45)',
  },
  divider: {
    height: 1,
    background: 'rgba(255,255,255,0.1)',
    margin: '6px 0',
  },
}
