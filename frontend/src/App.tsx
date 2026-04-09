import React, { useState, useEffect, useRef, useCallback } from 'react'
import { SeesoProvider, useSeeso } from './core/eyeTracking/SeesoProvider'
import { CalibrationScreen } from './components/CalibrationScreen'
import { CaveLanternGame } from './games/caveLantern/CaveLanternGame'
import { SessionSummary } from './components/SessionSummary'
import { DebugOverlay } from './components/DebugOverlay'
import { useGaze } from './hooks/useGaze'
import { useTelemetry } from './hooks/useTelemetry'
import { useInputManager } from './hooks/useInputManager'
import { SEESO_LICENSE_KEY } from './config'
import type { SessionData } from './core/telemetry/types'

type AppScreen = 'calibration' | 'game' | 'summary'

function AppInner() {
  const [screen, setScreen]         = useState<AppScreen>('calibration')
  const [debugVisible, setDebugVisible] = useState(false)
  const [sessionData, setSessionData]   = useState<SessionData | null>(null)
  const percentRevealedRef = useRef(0)

  const { fps, cameraError, applyCalibrationData } = useSeeso()
  const gaze = useGaze()
  const { recordEvent, finalizeSession, resetSession } = useTelemetry()
  useInputManager(gaze)

  // Debug toggle — key D
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') setDebugVisible(v => !v)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Restore saved calibration from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('seeso_calibration_v1')
    if (!saved) return
    applyCalibrationData(saved)
      .then(() => setScreen('game'))
      .catch(() => localStorage.removeItem('seeso_calibration_v1'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // run once

  const handleCalibrationComplete = useCallback((calibrationData: string) => {
    // calibrationData is already saved to localStorage inside CalibrationFlowSeeso
    void applyCalibrationData(calibrationData)
    setScreen('game')
    recordEvent('calibration_done', {})
    recordEvent('game_start', {})
  }, [applyCalibrationData, recordEvent])

  const handlePercentRevealed = useCallback((pct: number) => {
    percentRevealedRef.current = pct
  }, [])

  const handleTreasureFound = useCallback((count: number) => {
    recordEvent('treasure_found', { count })
  }, [recordEvent])

  const handleGameEnd = useCallback((pct: number) => {
    recordEvent('game_end', { percentRevealed: pct, trigger: 'win' })
    setSessionData(finalizeSession(pct))
    setScreen('summary')
  }, [recordEvent, finalizeSession])

  const handleEscape = useCallback(() => {
    const pct = percentRevealedRef.current
    recordEvent('game_end', { percentRevealed: pct, trigger: 'escape' })
    setSessionData(finalizeSession(pct))
    setScreen('summary')
  }, [recordEvent, finalizeSession])

  const handlePlayAgain = useCallback(() => {
    resetSession()
    percentRevealedRef.current = 0
    setSessionData(null)
    setScreen('game')
    recordEvent('game_start', { replay: true })
  }, [resetSession, recordEvent])

  const handleRecalibrate = useCallback(() => {
    localStorage.removeItem('seeso_calibration_v1')
    setScreen('calibration')
  }, [])

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

          <button style={styles.recalibBtn} onClick={handleRecalibrate}>
            Recalibrar
          </button>
        </>
      )}

      {screen === 'summary' && sessionData && (
        <SessionSummary session={sessionData} onPlayAgain={handlePlayAgain} />
      )}

      <DebugOverlay
        gaze={gaze}
        iris={null}
        fps={fps}
        visible={debugVisible && !cameraError}
      />
    </>
  )
}

export default function App() {
  return (
    <SeesoProvider licenseKey={SEESO_LICENSE_KEY}>
      <AppInner />
    </SeesoProvider>
  )
}

const styles: Record<string, React.CSSProperties> = {
  recalibBtn: {
    position: 'fixed',
    bottom: 16,
    right: 16,
    background: 'rgba(0,0,0,0.7)',
    color: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 12,
    fontFamily: 'system-ui',
    cursor: 'pointer',
  },
}
