import React from 'react'

interface Props {
  onSelectCave:    () => void
  onSelectFishing: () => void
}

export function GameSelector({ onSelectCave, onSelectFishing }: Props) {
  return (
    <div style={styles.wrap}>
      <h1 style={styles.title}>NeuroRehab</h1>
      <p style={styles.subtitle}>Plataforma de rehabilitación neurológica</p>

      <div style={styles.cards}>
        <GameCard
          title="Cueva de la Linterna"
          description="Explora la cueva moviendo la mirada. Revela el mapa oculto con tu mirada."
          icon="🔦"
          tags={['Eye tracking']}
          onClick={onSelectCave}
        />
        <GameCard
          title="La Pesca"
          description="Mira los peces para detectarlos y agarra para pescarlos. Combina mirada y mano."
          icon="🎣"
          tags={['Eye tracking', 'Mano mecánica', 'Métricas clínicas']}
          onClick={onSelectFishing}
          highlight
        />
      </div>

      <p style={styles.hint}>Ctrl+T → panel terapeuta durante el juego</p>
    </div>
  )
}

interface CardProps {
  title: string
  description: string
  icon: string
  tags: string[]
  onClick: () => void
  highlight?: boolean
}

function GameCard({ title, description, icon, tags, onClick, highlight }: CardProps) {
  const [hover, setHover] = React.useState(false)
  return (
    <button
      style={{
        ...styles.card,
        ...(highlight ? styles.cardHighlight : {}),
        ...(hover ? styles.cardHover : {}),
      }}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span style={styles.icon}>{icon}</span>
      <span style={styles.cardTitle}>{title}</span>
      <span style={styles.cardDesc}>{description}</span>
      <div style={styles.tags}>
        {tags.map(t => <span key={t} style={styles.tag}>{t}</span>)}
      </div>
    </button>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap:          { position: 'fixed', inset: 0, background: '#080f1c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 },
  title:         { fontSize: 36, fontWeight: 900, color: '#e0f0ff', fontFamily: 'system-ui', margin: 0 },
  subtitle:      { fontSize: 16, color: 'rgba(200,230,255,0.5)', fontFamily: 'system-ui', margin: '0 0 32px' },
  cards:         { display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' },
  card:          { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '32px 28px', width: 260, display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer', textAlign: 'left', transition: 'transform 0.15s, box-shadow 0.15s' },
  cardHighlight: { border: '1px solid rgba(59,130,246,0.5)', background: 'rgba(59,130,246,0.06)' },
  cardHover:     { transform: 'translateY(-4px)', boxShadow: '0 12px 32px rgba(0,0,0,0.4)' },
  icon:          { fontSize: 40 },
  cardTitle:     { fontSize: 18, fontWeight: 700, color: '#e0f0ff', fontFamily: 'system-ui' },
  cardDesc:      { fontSize: 14, color: 'rgba(200,230,255,0.65)', fontFamily: 'system-ui', lineHeight: 1.5 },
  tags:          { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tag:           { fontSize: 11, color: '#7dd3fc', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 20, padding: '2px 10px', fontFamily: 'system-ui' },
  hint:          { fontSize: 12, color: 'rgba(255,255,255,0.2)', fontFamily: 'system-ui', marginTop: 16 },
}
