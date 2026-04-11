import React from 'react'
import type { GamePhase } from '../types'

interface Props { phase: GamePhase; timeLeftMs: number }

const PHASE_INFO: Record<GamePhase, { title: string; body: string; keys?: string }> = {
  grip:    { title: 'Ejercicio de agarre', body: 'Aprieta la mano con fuerza y suéltala despacio. Repite el ciclo con calma.', keys: 'Espacio → apretar / soltar → abrir' },
  fishing: { title: 'A pescar', body: 'Mira un pez hasta que se ilumine. Luego aprieta para engancharlo.', keys: 'Espacio → agarrar' },
  summary: { title: '', body: '' },
}

export function PhaseInstructions({ phase, timeLeftMs }: Props) {
  if (phase === 'summary' || phase === 'fishing') return null
  const info = PHASE_INFO[phase]
  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <p style={styles.title}>{info.title}</p>
        <p style={styles.body}>{info.body}</p>
        {info.keys && <p style={styles.keys}>{info.keys}</p>}
        {timeLeftMs > 0 && <p style={styles.timer}>{Math.ceil(timeLeftMs / 1000)}s</p>}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap:  { position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)', zIndex: 30, pointerEvents: 'none' },
  card:  { background: 'rgba(10,20,35,0.88)', border: '1px solid rgba(100,180,255,0.2)', borderRadius: 16, padding: '18px 32px', textAlign: 'center', backdropFilter: 'blur(8px)', maxWidth: 520 },
  title: { fontSize: 22, fontWeight: 700, color: '#e0f0ff', fontFamily: 'system-ui', margin: '0 0 6px' },
  body:  { fontSize: 16, color: 'rgba(200,230,255,0.8)', fontFamily: 'system-ui', margin: '0 0 6px', lineHeight: 1.5 },
  keys:  { fontSize: 13, color: 'rgba(120,200,255,0.6)', fontFamily: 'monospace', margin: '4px 0 0', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '4px 10px', display: 'inline-block' },
  timer: { fontSize: 32, fontWeight: 900, color: '#7dd3fc', fontFamily: 'system-ui', margin: '10px 0 0' },
}
