import React, { useEffect, useRef, useCallback, useState } from 'react'
import { generateCave, renderCaveToCanvas } from './CaveGenerator'
import { FogOfWar } from './FogOfWar'
import type { CaveMap, GameState } from './types'
import { CONFIG } from '@/config'

interface Props {
  gazeX: number
  gazeY: number
  isBlinking: boolean
  onPercentRevealed: (pct: number) => void
  onTreasureFound: (count: number) => void
  onGameEnd: (percent: number) => void
  onEscapePressed: () => void
}

export function CaveLanternGame({
  gazeX,
  gazeY,
  isBlinking,
  onPercentRevealed,
  onTreasureFound,
  onGameEnd,
  onEscapePressed,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const caveCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const fogRef = useRef<FogOfWar | null>(null)
  const caveMapRef = useRef<CaveMap | null>(null)
  const gameStateRef = useRef<GameState>({
    isRunning: true,
    startTime: performance.now(),
    percentRevealed: 0,
    treasuresFound: 0,
    totalTreasures: 0,
  })
  const animFrameRef = useRef<number>(0)
  const lastPercentSampleRef = useRef(0)
  const [percentRevealed, setPercentRevealed] = useState(0)

  // Build the cave once on mount
  useEffect(() => {
    const w = window.innerWidth
    const h = window.innerHeight
    const seed = CONFIG.game.seed || Date.now()
    const map = generateCave(w, h, seed)
    caveMapRef.current = map
    gameStateRef.current.totalTreasures = map.treasures.length

    // Render cave background to offscreen canvas
    const caveCanvas = document.createElement('canvas')
    caveCanvas.width = w
    caveCanvas.height = h
    renderCaveToCanvas(map, caveCanvas)
    caveCanvasRef.current = caveCanvas

    // Init fog
    fogRef.current = new FogOfWar(w, h)

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  // Handle ESC key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscapePressed()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onEscapePressed])

  // Main render loop
  const gazeXRef = useRef(gazeX)
  const gazeYRef = useRef(gazeY)
  const isBlinkingRef = useRef(isBlinking)
  gazeXRef.current = gazeX
  gazeYRef.current = gazeY
  isBlinkingRef.current = isBlinking

  const renderLoop = useCallback(() => {
    const canvas = canvasRef.current
    const fog = fogRef.current
    const caveCanvas = caveCanvasRef.current
    const map = caveMapRef.current
    if (!canvas || !fog || !caveCanvas || !map) {
      animFrameRef.current = requestAnimationFrame(renderLoop)
      return
    }

    const ctx = canvas.getContext('2d')!
    const gx = gazeXRef.current
    const gy = gazeYRef.current
    const blinking = isBlinkingRef.current

    // Draw cave background
    ctx.drawImage(caveCanvas, 0, 0)

    // Gaze is valid if it's a real coord within screen bounds (not the -1 sentinel)
    const gazeValid = Number.isFinite(gx) && Number.isFinite(gy) && gx >= 0 && gy >= 0

    // Reveal fog hole — always reveal even during saccades, block only on confirmed blink
    if (gazeValid && !blinking) {
      fog.reveal(gx, gy)
    }

    // Fog on top of cave background
    fog.drawOnto(ctx)

    // Lantern glow AFTER fog so it's always visible
    if (gazeValid) fog.drawLanternGlow(ctx, gx, gy)

    // Gaze cursor — always visible, helps debug and gives player feedback
    if (gazeValid) {
      ctx.save()
      ctx.globalAlpha = blinking ? 0.3 : 0.9
      ctx.strokeStyle = '#ffe066'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(gx, gy, 8, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.restore()
    }

    // Check for treasure discovery
    if (!blinking && map) {
      const { radius } = CONFIG.lantern
      for (const t of map.treasures) {
        if (!t.found) {
          const dx = gx - t.x
          const dy = gy - t.y
          if (dx * dx + dy * dy < (radius * 0.6) ** 2) {
            t.found = true
            gameStateRef.current.treasuresFound++
            onTreasureFound(gameStateRef.current.treasuresFound)
          }
        }
      }
    }

    // Sample revealed % every second
    const now = performance.now()
    if (now - lastPercentSampleRef.current > 1000) {
      const pct = fog.sampleRevealedPercent()
      gameStateRef.current.percentRevealed = pct
      setPercentRevealed(pct)
      onPercentRevealed(pct)
      lastPercentSampleRef.current = now

      if (pct >= CONFIG.game.winThreshold && gameStateRef.current.isRunning) {
        gameStateRef.current.isRunning = false
        onGameEnd(pct)
      }
    }

    animFrameRef.current = requestAnimationFrame(renderLoop)
  }, [onPercentRevealed, onTreasureFound, onGameEnd])

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(renderLoop)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [renderLoop])

  // Handle canvas resize
  useEffect(() => {
    function handleResize() {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth
        canvasRef.current.height = window.innerHeight
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ position: 'fixed', inset: 0, display: 'block', cursor: 'none' }}
      />
      {/* Exploration HUD */}
      <div style={hudStyle}>
        <span>{Math.round(percentRevealed * 100)}% explorado</span>
      </div>
    </>
  )
}

const hudStyle: React.CSSProperties = {
  position: 'fixed',
  top: 16,
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(0,0,0,0.6)',
  color: '#ffd700',
  fontFamily: 'system-ui',
  fontSize: 15,
  padding: '6px 18px',
  borderRadius: 20,
  letterSpacing: 1,
  pointerEvents: 'none',
}
