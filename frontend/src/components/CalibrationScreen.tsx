import React from 'react'
import { CalibrationFlowSeeso } from '@/core/eyeTracking/CalibrationFlowSeeso'
import { useSeeso } from '@/core/eyeTracking/SeesoProvider'

interface Props {
  onComplete: (calibrationData: string) => void
}

export function CalibrationScreen({ onComplete }: Props) {
  const { isReady, cameraError } = useSeeso()

  if (cameraError) {
    return (
      <div style={styles.loading}>
        <div style={styles.errorIcon}>⚠️</div>
        <p style={styles.errorTitle}>Error de Eyedid SDK</p>
        <p style={styles.errorMsg}>{cameraError}</p>
        <button style={styles.reloadBtn} onClick={() => window.location.reload()}>
          Recargar página
        </button>
      </div>
    )
  }

  if (!isReady) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner} />
        <p style={styles.text}>Cargando Eyedid SDK…</p>
      </div>
    )
  }

  return <CalibrationFlowSeeso onComplete={onComplete} />
}

const styles: Record<string, React.CSSProperties> = {
  loading:    { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, background: '#0a0a0a', padding: 40 },
  spinner:    { width: 48, height: 48, border: '4px solid rgba(255,255,255,0.1)', borderTop: '4px solid #4ade80', borderRadius: '50%', animation: 'spin 1s linear infinite' },
  text:       { color: 'rgba(255,255,255,0.6)', fontFamily: 'system-ui', fontSize: 16 },
  errorIcon:  { fontSize: 56 },
  errorTitle: { fontSize: 22, fontWeight: 700, color: '#f87171', fontFamily: 'system-ui', margin: 0 },
  errorMsg:   { fontSize: 15, color: 'rgba(255,255,255,0.65)', fontFamily: 'system-ui', textAlign: 'center', maxWidth: 480, lineHeight: 1.6, margin: 0 },
  reloadBtn:  { marginTop: 8, background: '#4ade80', color: '#000', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 15, fontWeight: 700, fontFamily: 'system-ui', cursor: 'pointer' },
}
