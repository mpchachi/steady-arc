import React, { useEffect, useRef, useCallback, useState } from 'react'
import { useGaze } from '@/hooks/useGaze'
import { KeyboardHandSimulator } from '@/core/input/KeyboardHandSimulator'
import { SerialHandBridge } from '@/core/input/SerialHandBridge'
import { useFishingGame } from './hooks/useFishingGame'
import { PhaseInstructions } from './components/PhaseInstructions'
import { TherapistPanel } from './components/TherapistPanel'
import { HistoricalDashboard } from './components/HistoricalDashboard'
import type { FishingConfig, FishState, HandInput } from './types'
import { DEFAULT_FISHING_CONFIG } from './types'

interface Props {
  onBackToMenu: () => void
  initialConfig?: Partial<FishingConfig>
}

export function FishingGame({ onBackToMenu, initialConfig }: Props) {
  const [config, setConfig]           = useState<FishingConfig>({ ...DEFAULT_FISHING_CONFIG, ...initialConfig })
  const [hwStatus, setHwStatus]       = useState<'none' | 'connected' | 'error'>('none')
  const [hwError, setHwError]         = useState<string>('')
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const kbSimRef     = useRef<KeyboardHandSimulator | null>(null)
  const serialRef    = useRef<SerialHandBridge | null>(null)
  const rafRef       = useRef(0)
  const ripples      = useRef<Array<{ x: number; y: number; r: number; age: number; maxAlpha?: number }>>([])
  const lastHandRef  = useRef<HandInput | null>(null)
  const heatmapRef   = useRef<HTMLCanvasElement | null>(null)   // offscreen gaze heatmap
  const sonarRef     = useRef<HTMLCanvasElement | null>(null)   // sonar brightness mask (alpha-based)
  const darknessRef  = useRef<HTMLCanvasElement | null>(null)   // black overlay with holes
  const smoothBarX   = useRef(-1)   // EMA-smoothed vertical bar X (roll → left/right)

  const gaze = useGaze()

  const {
    phase, timeLeftMs, fishes, fishCaught,
    sessionData, updateHand, updateGaze,
    initFishes, tickFishing, skipPhase, reset,
  } = useFishingGame(config)

  // Init keyboard simulator (always available as fallback)
  useEffect(() => {
    kbSimRef.current  = new KeyboardHandSimulator()
    serialRef.current = new SerialHandBridge()
    serialRef.current.onStatusChange((status, msg) => {
      setHwStatus(status === 'connected' ? 'connected' : status === 'error' ? 'error' : 'none')
      if (msg) setHwError(msg)
    })
    return () => {
      kbSimRef.current?.destroy()
      serialRef.current?.disconnect()
    }
  }, [])

  const connectArduino = useCallback(async () => {
    try {
      await serialRef.current?.connect()
    } catch {
      setHwStatus('error')
    }
  }, [])

  /** Get current hand input: real hardware if connected, keyboard otherwise */
  const getHandInput = useCallback((): HandInput => {
    // Guard: simulators may not be initialized yet on first frame
    if (!kbSimRef.current) {
      return {
        gripStrength: 0, flexRaw: 0,
        accel: { x: 0, y: 0, z: -1 },
        gyro:  { x: 0, y: 0, z: 0 },
        orientation: { pitch: 0, roll: 0, yaw: 0 },
        timestamp: performance.now(), source: 'keyboard', isConnected: false,
      }
    }
    if (serialRef.current?.isConnected()) {
      return serialRef.current.getLatest() ?? kbSimRef.current.update()
    }
    return kbSimRef.current.update()
  }, [])

  // Init fish + heatmap when entering fishing phase
  useEffect(() => {
    if (phase === 'fishing') {
      const w = window.innerWidth
      const h = window.innerHeight
      initFishes(w, h)
      // Heatmap (gaze accumulation)
      const hm = document.createElement('canvas')
      hm.width = w; hm.height = h
      heatmapRef.current = hm
      // Sonar brightness mask (starts fully transparent = all black)
      const sonar = document.createElement('canvas')
      sonar.width = w; sonar.height = h
      sonarRef.current = sonar
      // Darkness overlay canvas
      const dark = document.createElement('canvas')
      dark.width = w; dark.height = h
      darknessRef.current = dark
      smoothBarX.current = -1
    }
  }, [phase, initFishes])

  // Main render loop
  const renderLoop = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight
    const W = canvas.width
    const H = canvas.height

    const now = performance.now()

    // Update hand input (real hardware or keyboard fallback)
    const hand = getHandInput()
    updateHand(hand)
    lastHandRef.current = hand
    // Update gaze
    updateGaze(gaze)

    // Vertical bar: roll → X only (giro muñeca izq/dcha)
    const isSerial = serialRef.current?.isConnected() ?? false
    let barX = -1
    if (isSerial) {
      const ALPHA = 0.10
      const rawX  = Math.max(60, Math.min(W - 60, W / 2 - (hand.orientation.pitch / 45) * W * 0.45))
      smoothBarX.current = smoothBarX.current < 0 ? rawX : smoothBarX.current * (1 - ALPHA) + rawX * ALPHA
      barX = smoothBarX.current
    }

    // Fish tick
    if (phase === 'fishing') {
      tickFishing(1 / 60, W, H, barX, 0)
    }

    // ── Draw lake ─────────────────────────────────────────────────────────
    drawLake(ctx, W, H, now)

    // ── Ripples ────────────────────────────────────────────────────────────
    ripples.current = ripples.current.filter(r => r.age < 1)
    ripples.current.forEach(r => {
      r.r   += 1.5
      r.age += 0.007
      ctx.save()
      ctx.globalAlpha = (1 - r.age) * (r.maxAlpha ?? 0.25)
      ctx.strokeStyle = '#7dd3fc'
      ctx.lineWidth   = 1.5
      ctx.beginPath()
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    })

    // Ambient ripples
    if (Math.random() < 0.015) {
      ripples.current.push({
        x: 80 + Math.random() * (W - 160),
        y: 80 + Math.random() * (H - 160),
        r: 4,
        age: 0,
      })
    }

    if (phase === 'fishing') {
      // ── Gaze heatmap accumulation (silent, not rendered directly) ─────
      const hm = heatmapRef.current
      if (hm) {
        const hctx = hm.getContext('2d')
        if (hctx && gaze && !gaze.isBlinking) {
          const r   = 55
          const grd = hctx.createRadialGradient(gaze.filteredX, gaze.filteredY, 0, gaze.filteredX, gaze.filteredY, r)
          grd.addColorStop(0, 'rgba(255,80,0,0.08)')
          grd.addColorStop(1, 'rgba(255,80,0,0)')
          hctx.fillStyle = grd
          hctx.beginPath(); hctx.arc(gaze.filteredX, gaze.filteredY, r, 0, Math.PI * 2); hctx.fill()
        }
      }

      if (isSerial && sonarRef.current && darknessRef.current) {
        const sonar = sonarRef.current
        const sc    = sonar.getContext('2d')!

        // 1. Fade existing sonar marks (destination-in reduces alpha)
        sc.globalCompositeOperation = 'destination-in'
        sc.fillStyle = 'rgba(255,255,255,0.985)'   // ~1.5% fade per frame
        sc.fillRect(0, 0, W, H)

        // 2. Paint bright column at current bar position
        sc.globalCompositeOperation = 'source-over'
        const sweep = sc.createLinearGradient(barX - 110, 0, barX + 110, 0)
        sweep.addColorStop(0,   'rgba(255,220,80,0)')
        sweep.addColorStop(0.4, 'rgba(255,220,80,0.7)')
        sweep.addColorStop(0.5, 'rgba(255,220,80,1)')
        sweep.addColorStop(0.6, 'rgba(255,220,80,0.7)')
        sweep.addColorStop(1,   'rgba(255,220,80,0)')
        sc.fillStyle = sweep
        sc.fillRect(barX - 110, 0, 220, H)

        // 3. Build darkness overlay: solid black, cut holes where sonar is bright
        const dark = darknessRef.current
        const dc   = dark.getContext('2d')!
        dc.globalCompositeOperation = 'source-over'
        dc.fillStyle = '#000'
        dc.fillRect(0, 0, W, H)
        dc.globalCompositeOperation = 'destination-out'
        dc.drawImage(sonar, 0, 0)
        dc.globalCompositeOperation = 'source-over'

        // 4. Draw mines onto scene (they get revealed by sonar holes)
        fishes.forEach(fish => drawFish(ctx, fish, now, barX))

        // 5. Overlay darkness (covers unswept areas)
        ctx.drawImage(dark, 0, 0)

        // 6. Draw bar on top (always visible)
        drawBar(ctx, barX, H)

      } else {
        // Keyboard / no Arduino: show everything normally
        fishes.forEach(fish => drawFish(ctx, fish, now, -1))
      }
    }

    // ── Gaze cursor ───────────────────────────────────────────────────────
    if (gaze && !gaze.isBlinking) {
      const gx = gaze.filteredX; const gy = gaze.filteredY
      ctx.save()
      // Outer ring
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth   = 3
      ctx.globalAlpha = 0.80
      ctx.beginPath()
      ctx.arc(gx, gy, 42, 0, Math.PI * 2)
      ctx.stroke()
      // Inner filled dot
      ctx.beginPath()
      ctx.arc(gx, gy, 7, 0, Math.PI * 2)
      ctx.fillStyle = '#fff'
      ctx.globalAlpha = 0.90
      ctx.fill()
      // Crosshair lines
      ctx.globalAlpha = 0.40
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(gx - 58, gy); ctx.lineTo(gx - 46, gy); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(gx + 46, gy); ctx.lineTo(gx + 58, gy); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(gx, gy - 58); ctx.lineTo(gx, gy - 46); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(gx, gy + 46); ctx.lineTo(gx, gy + 58); ctx.stroke()
      ctx.restore()
    }

    // ── Phase overlay for non-fishing timed phases ─────────────────────────
    drawPhaseOverlay(ctx, W, H, phase)

    // ── Fishing HUD ────────────────────────────────────────────────────────
    if (phase === 'fishing') {
      drawFishingHUD(ctx, fishCaught, config.fishCount)
      drawGripIndicator(ctx, W, getHandInput().gripStrength ?? 0)
    }

    // ── Phase metrics panel (top right) ───────────────────────────────────
    drawPhaseMetrics(ctx, W, phase, getHandInput())

    rafRef.current = requestAnimationFrame(renderLoop)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gaze, phase, fishes, fishCaught, updateHand, updateGaze, tickFishing, config.fishCount, getHandInput])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(renderLoop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [renderLoop])

  // Skip phase with Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skipPhase()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [skipPhase])

  if (phase === 'summary' && sessionData) {
    return (
      <HistoricalDashboard
        session={sessionData}
        onPlayAgain={reset}
        onBackToMenu={onBackToMenu}
      />
    )
  }

  const hand = getHandInput()

  return (
    <>
      <canvas ref={canvasRef} style={styles.canvas} />

      <PhaseInstructions
        phase={phase}
        timeLeftMs={timeLeftMs}
      />

      {phase === 'fishing' && (
        <div style={styles.fishingInstruction}>
          {hwStatus === 'connected'
            ? 'Gira la muñeca para alinear la barra · Mira la mina · Aprieta'
            : 'Mira una mina · Espacio para detonar'}
        </div>
      )}

      <TherapistPanel
        config={config}
        onConfigChange={setConfig}
        handGrip={hand?.gripStrength ?? 0}
        gazeX={gaze?.filteredX ?? 0}
        gazeY={gaze?.filteredY ?? 0}
        currentPhase={phase}
        fishCaught={fishCaught}
      />

      <button style={styles.backBtn} onClick={onBackToMenu}>← Salir</button>
      <button style={styles.skipBtn} onClick={skipPhase}>⏭ Saltar fase</button>

      {hwStatus === 'none' && (
        <button style={styles.hwBtn} onClick={connectArduino}>🔌 Conectar Arduino</button>
      )}
      {hwStatus === 'connected' && (
        <div style={styles.hwConnected}>✓ Arduino conectado</div>
      )}
      {hwStatus === 'error' && (
        <div style={styles.hwError} title={hwError}>⚠ Error: {hwError || 'conexión fallida'}</div>
      )}
    </>
  )
}

// ── Canvas drawing helpers ────────────────────────────────────────────────────

function drawLake(ctx: CanvasRenderingContext2D, W: number, H: number, now: number) {
  // Background gradient
  const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7)
  bg.addColorStop(0,   '#1e3a5f')
  bg.addColorStop(0.5, '#162d4a')
  bg.addColorStop(1,   '#0d1f35')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Subtle horizontal wave bands
  const waveCount = 8
  for (let i = 0; i < waveCount; i++) {
    const y     = (H / waveCount) * i + (H / waveCount / 2)
    const alpha = 0.015 + 0.01 * Math.sin(now * 0.0008 + i)
    const wave  = ctx.createLinearGradient(0, y - 8, 0, y + 8)
    wave.addColorStop(0,   `rgba(100,180,255,0)`)
    wave.addColorStop(0.5, `rgba(100,180,255,${alpha})`)
    wave.addColorStop(1,   `rgba(100,180,255,0)`)
    ctx.fillStyle = wave
    ctx.fillRect(0, y - 8, W, 16)
  }
}

function drawFish(ctx: CanvasRenderingContext2D, fish: FishState, now: number, barX = -1) {
  if (fish.status === 'caught') return

  const { x, y, radius, color, status, gazeTimeMs } = fish
  const pulse      = 0.6 + 0.4 * Math.sin(now * 0.006)
  const barOverlap = barX >= 0 && Math.abs(barX - x) < radius * 3

  ctx.save()
  ctx.translate(x, y)

  // Gaze progress arc
  if (status === 'idle') {
    const progress = gazeTimeMs / 1500
    if (progress > 0.05) {
      ctx.globalAlpha = 0.6
      ctx.strokeStyle = color
      ctx.lineWidth   = 3
      ctx.beginPath()
      ctx.arc(0, 0, radius * 1.8, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2)
      ctx.stroke()
    }
  }

  // Targeted / hooked outer ring
  if (status === 'targeted' || status === 'hooked') {
    ctx.globalAlpha = pulse * 0.7
    ctx.strokeStyle = status === 'hooked' ? '#fbbf24' : color
    ctx.lineWidth   = 3
    ctx.beginPath()
    ctx.arc(0, 0, radius * 2.0, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Chain (3 links hanging from bottom)
  ctx.globalAlpha = 0.55
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth   = 2
  for (let i = 0; i < 3; i++) {
    const ly = radius + 6 + i * 7
    ctx.beginPath()
    ctx.ellipse(0, ly, 3, 4, 0, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Bar intersection highlight
  if (barOverlap && status !== 'targeted' && status !== 'hooked') {
    ctx.globalAlpha = 0.35
    ctx.fillStyle   = '#fbbf24'
    ctx.beginPath()
    ctx.arc(0, 0, radius * 1.6, 0, Math.PI * 2)
    ctx.fill()
  }

  // Mine body
  ctx.globalAlpha = 1
  const bodyGrad = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, 1, 0, 0, radius)
  bodyGrad.addColorStop(0, '#4b5563')
  bodyGrad.addColorStop(1, '#1f2937')
  ctx.fillStyle = bodyGrad
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.fill()

  // Mine rim
  ctx.strokeStyle = '#374151'
  ctx.lineWidth   = 2
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.stroke()

  // Spikes (6 horns)
  ctx.fillStyle   = '#6b7280'
  ctx.strokeStyle = '#4b5563'
  ctx.lineWidth   = 1
  const SPIKES = 6
  for (let i = 0; i < SPIKES; i++) {
    const angle = (i / SPIKES) * Math.PI * 2
    const sx = Math.cos(angle) * (radius + 10)
    const sy = Math.sin(angle) * (radius + 10)
    ctx.beginPath()
    ctx.arc(sx, sy, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }

  // Status light (center dot)
  const lightColor = status === 'hooked' ? '#fbbf24'
    : status === 'targeted' ? color
    : '#ef4444'
  const lightAlpha = status === 'idle' ? 0.5 + 0.5 * Math.sin(now * 0.003) : pulse
  ctx.globalAlpha = lightAlpha
  ctx.fillStyle   = lightColor
  ctx.beginPath()
  ctx.arc(0, 0, radius * 0.28, 0, Math.PI * 2)
  ctx.fill()

  // Light gleam
  ctx.globalAlpha = 0.6
  ctx.fillStyle   = 'rgba(255,255,255,0.7)'
  ctx.beginPath()
  ctx.arc(-radius * 0.08, -radius * 0.08, radius * 0.09, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

function drawPhaseOverlay(ctx: CanvasRenderingContext2D, W: number, H: number, phase: string) {
  if (phase === 'fishing' || phase === 'summary') return

  // Translucent vignette during passive phases
  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8)
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,10,20,0.45)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, W, H)
}

function drawFishingHUD(ctx: CanvasRenderingContext2D, caught: number, total: number) {
  ctx.save()
  ctx.font = 'bold 18px system-ui'
  ctx.fillStyle = 'rgba(200,230,255,0.7)'
  ctx.fillText(`🐟 ${caught} / ${total}`, 20, 36)
  ctx.restore()
}

type PhaseMetric = { label: string; value: string }

const PHASE_METRICS: Record<string, PhaseMetric[]> = {
  grip:    [{ label: 'Midiendo', value: 'Fuerza y espasticidad' }, { label: 'Sensores', value: 'Flex + EMG' }, { label: 'Métricas', value: 'grip_MVC · grip_release_time · EMG cocontracción' }],
  fishing: [{ label: 'Midiendo', value: 'Negligencia hemispatial' }, { label: 'Sensores', value: 'Eye tracker + Flex + IMU' }, { label: 'Métricas', value: 'neglect_index · left_RT · right_RT · RT_gaze_to_grip' }],
}

function drawPhaseMetrics(ctx: CanvasRenderingContext2D, W: number, phase: string, hand: { gyro: { x: number; y: number; z: number }; gripStrength: number }) {
  const metrics = PHASE_METRICS[phase]
  if (!metrics || phase === 'summary') return

  const x = W - 16
  const yStart = 16
  const lineH = 20
  const padX = 14; const padY = 10

  // Measure width
  ctx.font = 'bold 12px system-ui'
  const maxW = Math.max(...metrics.map(m => ctx.measureText(`${m.label}: ${m.value}`).width)) + padX * 2

  const boxH = metrics.length * lineH + padY * 2

  ctx.save()
  ctx.globalAlpha = 0.75
  ctx.fillStyle = 'rgba(8,16,32,0.9)'
  ctx.beginPath()
  ctx.roundRect(x - maxW, yStart, maxW, boxH, 8)
  ctx.fill()
  ctx.globalAlpha = 1

  metrics.forEach((m, i) => {
    const ty = yStart + padY + i * lineH + 13
    ctx.font = 'bold 11px system-ui'
    ctx.fillStyle = 'rgba(120,180,255,0.7)'
    ctx.textAlign = 'right'
    ctx.fillText(m.label.toUpperCase(), x - padX - ctx.measureText(': ' + m.value).width - 2, ty)
    ctx.font = '11px system-ui'
    ctx.fillStyle = '#e0f0ff'
    ctx.textAlign = 'right'
    ctx.fillText(m.value, x - padX, ty)
  })

  // Live sensor bar
  const barY = yStart + boxH + 6
  const barW = maxW - padX * 2
  if (phase === 'rest') {
    const omega = Math.sqrt(hand.gyro.x ** 2 + hand.gyro.y ** 2 + hand.gyro.z ** 2)
    const norm  = Math.min(1, omega / 3)
    ctx.globalAlpha = 0.6
    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    ctx.beginPath(); ctx.roundRect(x - maxW + padX, barY, barW, 5, 3); ctx.fill()
    ctx.fillStyle = norm > 0.4 ? '#f87171' : '#38bdf8'
    ctx.beginPath(); ctx.roundRect(x - maxW + padX, barY, barW * norm, 5, 3); ctx.fill()
    ctx.font = '10px system-ui'; ctx.fillStyle = 'rgba(200,230,255,0.5)'; ctx.textAlign = 'right'
    ctx.fillText('movimiento IMU', x - padX, barY + 15)
  } else if (phase === 'grip') {
    const norm = Math.min(1, hand.gripStrength)
    ctx.globalAlpha = 0.6
    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    ctx.beginPath(); ctx.roundRect(x - maxW + padX, barY, barW, 5, 3); ctx.fill()
    ctx.fillStyle = norm > 0.6 ? '#4ade80' : '#fbbf24'
    ctx.beginPath(); ctx.roundRect(x - maxW + padX, barY, barW * norm, 5, 3); ctx.fill()
    ctx.font = '10px system-ui'; ctx.fillStyle = 'rgba(200,230,255,0.5)'; ctx.textAlign = 'right'
    ctx.fillText('agarre (flex)', x - padX, barY + 15)
  }

  ctx.restore()
}


function drawBar(ctx: CanvasRenderingContext2D, bx: number, H: number) {
  ctx.save()
  // Outer glow
  const glow = ctx.createLinearGradient(bx - 12, 0, bx + 12, 0)
  glow.addColorStop(0,   'rgba(251,191,36,0)')
  glow.addColorStop(0.5, 'rgba(251,191,36,0.18)')
  glow.addColorStop(1,   'rgba(251,191,36,0)')
  ctx.fillStyle = glow
  ctx.fillRect(bx - 12, 0, 24, H)
  // Core line
  const line = ctx.createLinearGradient(0, 0, 0, H)
  line.addColorStop(0,   'rgba(251,191,36,0)')
  line.addColorStop(0.15,'rgba(251,191,36,0.8)')
  line.addColorStop(0.85,'rgba(251,191,36,0.8)')
  line.addColorStop(1,   'rgba(251,191,36,0)')
  ctx.strokeStyle = line
  ctx.lineWidth   = 3
  ctx.beginPath()
  ctx.moveTo(bx, 0)
  ctx.lineTo(bx, H)
  ctx.stroke()
  ctx.restore()
}

function drawGripIndicator(ctx: CanvasRenderingContext2D, W: number, grip: number) {
  const barW = 120; const barH = 8; const x = W - barW - 20; const y = 20
  ctx.save()
  ctx.globalAlpha = 0.6
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.beginPath()
  ctx.roundRect(x, y, barW, barH, 4)
  ctx.fill()
  ctx.fillStyle = grip > 0.45 ? '#fbbf24' : '#3b82f6'
  ctx.beginPath()
  ctx.roundRect(x, y, barW * grip, barH, 4)
  ctx.fill()
  ctx.fillStyle = 'rgba(200,230,255,0.5)'
  ctx.font = '11px system-ui'
  ctx.fillText('agarre', x, y + barH + 14)
  ctx.restore()
}

const styles: Record<string, React.CSSProperties> = {
  canvas:             { position: 'fixed', inset: 0, display: 'block' },
  backBtn:            { position: 'fixed', top: 12, left: 12, background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontFamily: 'system-ui', cursor: 'pointer', zIndex: 40 },
  skipBtn:            { position: 'fixed', top: 12, left: 90, background: 'rgba(251,191,36,0.15)', color: 'rgba(251,191,36,0.8)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontFamily: 'system-ui', cursor: 'pointer', zIndex: 40 },
  fishingInstruction: { position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', fontSize: 14, color: 'rgba(200,230,255,0.55)', fontFamily: 'system-ui', pointerEvents: 'none', zIndex: 20 },
  hwBtn:              { position: 'fixed', bottom: 16, left: 12, background: 'rgba(59,130,246,0.85)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontFamily: 'system-ui', cursor: 'pointer', zIndex: 40 },
  hwConnected:        { position: 'fixed', bottom: 16, left: 12, color: '#4ade80', fontSize: 13, fontFamily: 'system-ui', zIndex: 40 },
  hwError:            { position: 'fixed', bottom: 16, left: 12, color: '#f87171', fontSize: 13, fontFamily: 'system-ui', zIndex: 40 },
}
