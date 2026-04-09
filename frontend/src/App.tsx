import React, { useState, useEffect, useRef, useCallback } from 'react'
import { FaceMeshProvider, useFaceMesh } from './core/eyeTracking/FaceMeshProvider'
import { CalibrationScreen } from './components/CalibrationScreen'
import { CaveLanternGame } from './games/caveLantern/CaveLanternGame'
import { SessionSummary } from './components/SessionSummary'
import { WebcamPreview } from './components/WebcamPreview'
import { DebugOverlay } from './components/DebugOverlay'
import { useGaze } from './hooks/useGaze'
import { useTelemetry, useGazeTelemetry } from './hooks/useTelemetry'
import { useInputManager } from './hooks/useInputManager'
import { GazeFilter } from './core/eyeTracking/GazeFilter'
import { CONFIG } from './config'
import type { CalibrationData } from './core/eyeTracking/types'
import type { SessionData } from './core/telemetry/types'

type AppScreen = 'calibration' | 'game' | 'summary'

function AppInner() {
  const [screen, setScreen] = useState<AppScreen>('calibration')
  const [debugVisible, setDebugVisible] = useState(false)
  const [sessionData, setSessionData] = useState<SessionData | null>(null)
  const percentRevealedRef = useRef(0)

  const { estimator, irisLandmarks, fps } = useFaceMesh()
  const gaze = useGaze()
  const filterRef = useRef(new GazeFilter())
  // useTelemetry now returns stable references — safe to use in useCallback deps
  const { collector, recordEvent, finalizeSession, resetSession } = useTelemetry()
  useInputManager(gaze)

  useGazeTelemetry(gaze, irisLandmarks, null, filterRef.current, collector)

  // Debug toggle — key D
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'd' || e.key === 'D') setDebugVisible(v => !v)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Restore calibration from localStorage — runs ONCE on mount only.
  // Uses estimator ref so it doesn't need it as a dep (stable class instance).
  useEffect(() => {
    const raw = localStorage.getItem(CONFIG.calibration.localStorageKey)
    if (!raw) return
    try {
      const cal: CalibrationData = JSON.parse(raw)

      // Sanity check 1: screen dimensions must match
      const widthOk = Math.abs(cal.screenWidth - window.innerWidth) < 100
      const heightOk = Math.abs(cal.screenHeight - window.innerHeight) < 100
      if (!widthOk || !heightOk) {
        localStorage.removeItem(CONFIG.calibration.localStorageKey)
        return
      }

      // Sanity check 2: coefficients must be finite numbers
      const allFinite = [...cal.coeffsX, ...cal.coeffsY].every(Number.isFinite)
      if (!allFinite) {
        localStorage.removeItem(CONFIG.calibration.localStorageKey)
        return
      }

      estimator.setCalibration(cal)
      setScreen('game')
    } catch {
      localStorage.removeItem(CONFIG.calibration.localStorageKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — run once on mount only

  const handleCalibrationComplete = useCallback((cal: CalibrationData) => {
    setScreen('game')
    recordEvent('calibration_done', { calibratedAt: cal.calibratedAt })
    recordEvent('game_start', {})
  }, [recordEvent])

  const handlePercentRevealed = useCallback((pct: number) => {
    percentRevealedRef.current = pct
  }, [])

  const handleTreasureFound = useCallback((count: number) => {
    recordEvent('treasure_found', { count })
  }, [recordEvent])

  const handleGameEnd = useCallback((pct: number) => {
    recordEvent('game_end', { percentRevealed: pct, trigger: 'win' })
    const data = finalizeSession(pct)
    setSessionData(data)
    setScreen('summary')
  }, [recordEvent, finalizeSession])

  const handleEscape = useCallback(() => {
    const pct = percentRevealedRef.current
    recordEvent('game_end', { percentRevealed: pct, trigger: 'escape' })
    const data = finalizeSession(pct)
    setSessionData(data)
    setScreen('summary')
  }, [recordEvent, finalizeSession])

  const handlePlayAgain = useCallback(() => {
    resetSession()
    percentRevealedRef.current = 0
    setSessionData(null)
    setScreen('game')
    recordEvent('game_start', { replay: true })
  }, [resetSession, recordEvent])

  return (
    <>
      {screen === 'calibration' && (
        <CalibrationScreen onComplete={handleCalibrationComplete} />
      )}

      {screen === 'game' && (
        <>
          <CaveLanternGame
            gazeX={gaze?.filteredX ?? -1}
            gazeY={gaze?.filteredY ?? -1}
            isBlinking={gaze?.isBlinking ?? true}
            onPercentRevealed={handlePercentRevealed}
            onTreasureFound={handleTreasureFound}
            onGameEnd={handleGameEnd}
            onEscapePressed={handleEscape}
          />
          <WebcamPreview />

          <button
            style={styles.recalibBtn}
            onClick={() => {
              localStorage.removeItem(CONFIG.calibration.localStorageKey)
              estimator.setCalibration(null)
              setScreen('calibration')
            }}
          >
            Recalibrar
          </button>
        </>
      )}

      {screen === 'summary' && sessionData && (
        <SessionSummary session={sessionData} onPlayAgain={handlePlayAgain} />
      )}

      <DebugOverlay
        gaze={gaze}
        iris={irisLandmarks}
        fps={fps}
        visible={debugVisible}
      />
    </>
  )
}

export default function App() {
  return (
    <FaceMeshProvider>
      <AppInner />
    </FaceMeshProvider>
  )
}

const styles: Record<string, React.CSSProperties> = {
  recalibBtn: {
    position: 'fixed',
    bottom: 148,
    right: 16,
    background: 'rgba(0,0,0,0.7)',
    color: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 12,
    fontFamily: 'system-ui',
    cursor: 'pointer',
    pointerEvents: 'all',
  },
}
