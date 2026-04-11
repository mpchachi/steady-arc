import { useState, useRef, useCallback, useEffect } from 'react'
import type {
  GamePhase, FishState, FishCatch, HandSample, FishingGazeSample,
  GameEvent, PhaseData, FishingSessionData, FishingConfig, HandInput,
} from '../types'
import { MetricsCalculator } from '@/core/telemetry/MetricsCalculator'
import type { GazePoint } from '@/core/eyeTracking/types'

const PHASES_ORDER: GamePhase[] = ['grip', 'fishing']
const TASK_IDS: Record<GamePhase, string> = {
  grip: 'T1', fishing: 'T2', summary: '-',
}

interface PhaseAccumulator {
  handSamples: HandSample[]
  gazeSamples: FishingGazeSample[]
  events: GameEvent[]
  startMs: number
}

function genId() { return Math.random().toString(36).slice(2, 10) }

function makeFish(
  id: string, w: number, h: number,
  radius: number, _speed: number,
  zone: 'left' | 'center' | 'right',
): FishState {
  const margin = 80
  const angle  = Math.random() * Math.PI * 2
  const vel    = 0
  let x: number
  if (zone === 'left')        x = margin + Math.random() * (w * 0.35 - margin)
  else if (zone === 'right')  x = w * 0.65 + Math.random() * (w * 0.35 - margin)
  else                        x = w * 0.3  + Math.random() * w * 0.4

  return {
    id, x,
    y: margin + Math.random() * (h - margin * 2),
    vx: Math.cos(angle) * vel,
    vy: Math.sin(angle) * vel,
    color: ['#38bdf8','#34d399','#f472b6','#fb923c','#a78bfa','#facc15'][
      Math.floor(Math.random() * 6)] ?? '#38bdf8',
    radius, angleDeg: angle * (180 / Math.PI),
    status: 'idle', gazeTimeMs: 0, dwellTimeMs: 0,
    eyeOnsetTime: null, eyeArrivalTime: null,
    handOnsetTime: null, handEndTime: null, eyeEndTime: null,
    spawnSide: zone,
  }
}

export function useFishingGame(config: FishingConfig) {
  const [phase, setPhase]             = useState<GamePhase>('grip')
  const [timeLeftMs, setTimeLeft]     = useState(config.gripDurationMs)
  const [fishes, setFishes]           = useState<FishState[]>([])
  const [fishCaught, setFishCaught]   = useState(0)
  const [sessionData, setSessionData] = useState<FishingSessionData | null>(null)

  const sessionId        = useRef(genId())
  const startTime        = useRef(Date.now())
  const phaseRef         = useRef<PhaseAccumulator>({ handSamples: [], gazeSamples: [], events: [], startMs: performance.now() })
  const phasesData       = useRef<PhaseData[]>([])
  const catchesRef       = useRef<FishCatch[]>([])
  const handRef          = useRef<HandInput | null>(null)
  const gazeRef          = useRef<GazePoint | null>(null)
  const prevGripRef      = useRef(false)
  const prevGazeTarget   = useRef<string | null>(null)
  const gazeLeftMsRef    = useRef(0)
  const gazeRightMsRef   = useRef(0)
  const gazeOnFishMsRef  = useRef(0)

  const phaseDuration = useCallback((p: GamePhase): number => {
    if (p === 'grip') return config.gripDurationMs
    return 0
  }, [config.gripDurationMs])

  // ── Advance phase ──────────────────────────────────────────────────────────
  const advancePhase = useCallback((current: GamePhase) => {
    const idx  = PHASES_ORDER.indexOf(current)
    const next = PHASES_ORDER[idx + 1] ?? 'summary'

    const acc = phaseRef.current
    phasesData.current.push({
      name: current, taskId: TASK_IDS[current],
      startMs: acc.startMs, endMs: performance.now(),
      handSamples: [...acc.handSamples],
      gazeSamples: [...acc.gazeSamples],
      events: [...acc.events],
      metrics: {},
    })
    phaseRef.current = { handSamples: [], gazeSamples: [], events: [], startMs: performance.now() }

    if (next === 'summary') finalize()
    else { setPhase(next); setTimeLeft(phaseDuration(next)) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseDuration])

  // ── Finalize ──────────────────────────────────────────────────────────────
  const finalize = useCallback(() => {
    const calc          = new MetricsCalculator()
    const gripSamples   = phasesData.current.find(p => p.name === 'grip')?.handSamples ?? []
    const fishingSamples = phasesData.current.find(p => p.name === 'fishing')?.handSamples ?? []

    const totalGaze  = gazeLeftMsRef.current + gazeRightMsRef.current
    const neglectIndex = totalGaze > 1000 ? gazeLeftMsRef.current / totalGaze : null

    const fishingPhase = phasesData.current.find(p => p.name === 'fishing')
    const fishingDurationMs = fishingPhase ? fishingPhase.endMs - fishingPhase.startMs : 0
    const attentionFraction = fishingDurationMs > 0
      ? Math.min(1, gazeOnFishMsRef.current / fishingDurationMs)
      : null

    const metrics = calc.compute(
      catchesRef.current, gripSamples, fishingSamples,
      neglectIndex, attentionFraction,
    )

    const allHand = phasesData.current.flatMap(p => p.handSamples)
    const allGaze = phasesData.current.flatMap(p => p.gazeSamples)

    setSessionData({
      version: '2.1',
      sessionId: sessionId.current,
      patientId: config.patientId,
      startTime: startTime.current,
      endTime: Date.now(),
      game: 'fishing',
      phases: phasesData.current,
      fishCatches: catchesRef.current,
      global_metrics: metrics,
      config,
      raw_data: {
        hand_samples_count: allHand.length,
        gaze_samples_count: allGaze.length,
        hand_sampling_rate_hz: 50,
        gaze_sampling_rate_hz: 30,
      },
    })
    setPhase('summary')
  }, [config])

  // ── External updates ──────────────────────────────────────────────────────
  const updateHand = useCallback((hand: HandInput) => {
    handRef.current = hand
    phaseRef.current.handSamples.push({
      timestamp: hand.timestamp, flexRaw: hand.flexRaw,
      gripStrength: hand.gripStrength,
      accelX: hand.accel.x, accelY: hand.accel.y, accelZ: hand.accel.z,
      gyroX: hand.gyro.x,   gyroY: hand.gyro.y,   gyroZ: hand.gyro.z,
      pitch: hand.orientation.pitch, roll: hand.orientation.roll, yaw: hand.orientation.yaw,
      emgRaw: hand.emgRaw, source: hand.source,
    })
  }, [])

  const updateGaze = useCallback((gaze: GazePoint | null) => {
    gazeRef.current = gaze
    if (!gaze) return
    phaseRef.current.gazeSamples.push({
      timestamp: gaze.timestamp, gazeX: gaze.rawX, gazeY: gaze.rawY,
      filteredX: gaze.filteredX, filteredY: gaze.filteredY,
      isBlinking: gaze.isBlinking, isSaccade: gaze.isSaccade,
    })
  }, [])

  // ── Mine init — spaced across visual field with minimum distance ─────────
  const initFishes = useCallback((w: number, h: number) => {
    const n       = config.fishCount
    const margin  = 130          // keep away from edges
    const minDist = Math.max(150, Math.min(w, h) / Math.sqrt(n) * 0.9)
    const placed: { x: number; y: number }[] = []
    const list:   FishState[] = []

    const tryPlace = (zone: 'left' | 'center' | 'right') => {
      for (let attempt = 0; attempt < 300; attempt++) {
        let x: number
        if (zone === 'left')       x = margin + Math.random() * (w * 0.35 - margin)
        else if (zone === 'right') x = w * 0.65 + Math.random() * (w * 0.35 - margin)
        else                       x = w * 0.3  + Math.random() * w * 0.4
        const y = margin + Math.random() * (h - margin * 2)
        const far = placed.every(p => Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) >= minDist)
        if (far) {
          placed.push({ x, y })
          const f = makeFish(genId(), w, h, config.fishSize, config.fishSpeed, zone)
          list.push({ ...f, x, y })
          return
        }
      }
      // fallback if no valid spot found
      const f = makeFish(genId(), w, h, config.fishSize, config.fishSpeed, zone)
      list.push(f)
    }

    const third = Math.floor(n / 3)
    for (let i = 0; i < third; i++) tryPlace('left')
    for (let i = 0; i < third; i++) tryPlace('right')
    for (let i = list.length; i < n; i++) tryPlace('center')
    setFishes(list)
  }, [config])

  // ── Fish tick ─────────────────────────────────────────────────────────────
  const tickFishing = useCallback((dt: number, canvasW: number, canvasH: number, hookX: number, _hookY: number) => {
    const gaze   = gazeRef.current
    const hand   = handRef.current
    const grip      = hand?.gripStrength ?? 0
    const prevGrip  = prevGripRef.current
    // Hysteresis: activates at 0.65 (flex≈200, ~50 sobre mínimo), deactivates at 0.20 (flex≈345)
    const gripOn    = prevGrip ? grip > 0.20 : grip > 0.65
    const risingEdge = gripOn && !prevGrip   // capture BEFORE updating ref
    prevGripRef.current = gripOn

    // Neglect: track gaze side
    if (gaze && !gaze.isBlinking) {
      if (gaze.filteredX < canvasW * 0.5) gazeLeftMsRef.current  += dt * 1000
      else                                gazeRightMsRef.current += dt * 1000
    }

    setFishes(prev => {
      const next = prev.map(fish => {
        // MTA tracking: when gaze leaves caught fish
        if (fish.status === 'caught') {
          const gz = gaze ? gaze.filteredX : -999
          const gy = gaze ? gaze.filteredY : -999
          const dx = gz - fish.x; const dy = gy - fish.y
          const wasPrev = prevGazeTarget.current === fish.id
          const stillOn = Math.sqrt(dx*dx + dy*dy) < fish.radius * 2.5
          if (wasPrev && !stillOn) {
            const eyeEnd = performance.now()
            const idx = catchesRef.current.findIndex(c => c.fishId === fish.id)
            if (idx >= 0) {
              const c = catchesRef.current[idx]!
              if (c.handEndTime !== null && c.MTA === null)
                catchesRef.current[idx] = { ...c, eyeEndTime: eyeEnd, MTA: eyeEnd - c.handEndTime }
            }
          }
          return fish
        }

        // Move
        let { x, y, vx, vy, angleDeg } = fish
        x += vx * dt * 60; y += vy * dt * 60
        const margin = 60
        if (x < margin)           { x = margin;           vx =  Math.abs(vx) }
        if (x > canvasW - margin) { x = canvasW - margin; vx = -Math.abs(vx) }
        if (y < margin)           { y = margin;           vy =  Math.abs(vy) }
        if (y > canvasH - margin) { y = canvasH - margin; vy = -Math.abs(vy) }
        const targetAngle = Math.atan2(vy, vx) * (180 / Math.PI)
        angleDeg += ((targetAngle - angleDeg + 540) % 360 - 180) * 0.05

        // Gaze hit test
        const gz = gaze ? gaze.filteredX : -999
        const gy = gaze ? gaze.filteredY : -999
        const dist = Math.sqrt((gz-x)**2 + (gy-y)**2)
        const gazeOnFish = dist < fish.radius * 3.5

        let gazeTimeMs = fish.gazeTimeMs
        let dwellTimeMs = fish.dwellTimeMs
        let status: FishState['status'] = fish.status
        let eyeOnsetTime   = fish.eyeOnsetTime
        let eyeArrivalTime = fish.eyeArrivalTime
        let handOnsetTime  = fish.handOnsetTime
        let handEndTime    = fish.handEndTime
        let eyeEndTime     = fish.eyeEndTime
        let anyGazeOnFish  = false

        // Bar covers full Y — only check horizontal alignment, very generous for stroke patients
        const hookOk = hookX < 0 || Math.abs(hookX - x) < fish.radius * 6

        if (status === 'idle' || status === 'targeted') {
          if (gazeOnFish) {
            anyGazeOnFish = true
            if (prevGazeTarget.current !== fish.id) {
              eyeOnsetTime = performance.now()
              if (status === 'idle') eyeArrivalTime = null
            }
            gazeTimeMs += dt * 1000
            if (gazeTimeMs >= config.fixationThresholdMs && status === 'idle') {
              status = 'targeted'
              eyeArrivalTime = performance.now()
            }
          } else {
            if (prevGazeTarget.current === fish.id) {
              eyeOnsetTime = null; eyeArrivalTime = null
              if (status === 'idle') gazeTimeMs = 0
            }
            if (status === 'idle') gazeTimeMs = Math.max(0, gazeTimeMs - dt * 800)
          }

          // Dwell mechanic: gaze + bar simultaneously on mine for 2s → explode
          if (gazeOnFish && hookOk) {
            dwellTimeMs += dt * 1000
          } else {
            dwellTimeMs = 0
          }
        }

        if (anyGazeOnFish) gazeOnFishMsRef.current += dt * 1000

        const DWELL_THRESHOLD_MS = 2000

        const shouldCatch =
          // Mechanic 1: 2s gaze + bar dwell
          (dwellTimeMs >= DWELL_THRESHOLD_MS) ||
          // Mechanic 2: flex rising edge (grip) when targeted
          (status === 'targeted' && risingEdge && hookOk)

        if (shouldCatch) {
          status = 'caught'
          dwellTimeMs = 0
          if (eyeArrivalTime === null) eyeArrivalTime = performance.now()
          handOnsetTime = performance.now()
          handEndTime   = performance.now()
          const side: FishCatch['side'] = x < canvasW * 0.4 ? 'left' : x > canvasW * 0.6 ? 'right' : 'center'
          catchesRef.current.push({
            fishId: fish.id, catchIndex: catchesRef.current.length,
            targetX: x, targetY: y, side,
            eyeOnsetTime, eyeArrivalTime, handOnsetTime, handEndTime, eyeEndTime: null,
            RT_gaze_to_grip: eyeArrivalTime !== null && handOnsetTime !== null ? handOnsetTime - eyeArrivalTime : null,
            MOA: eyeOnsetTime  !== null && handOnsetTime !== null ? handOnsetTime - eyeOnsetTime   : null,
            FT:  eyeArrivalTime !== null && handOnsetTime !== null ? handOnsetTime - eyeArrivalTime : null,
            MTA: null,
          })
          setFishCaught(c => c + 1)
          phaseRef.current.events.push({ timestamp: performance.now(), phase: 'fishing', type: 'fish_caught', data: { fishId: fish.id, side } })
        }

        if (gazeOnFish) prevGazeTarget.current = fish.id
        else if (prevGazeTarget.current === fish.id) prevGazeTarget.current = null

        return { ...fish, x, y, vx, vy, angleDeg, gazeTimeMs, dwellTimeMs, status, eyeOnsetTime, eyeArrivalTime, handOnsetTime, handEndTime, eyeEndTime }
      })

      if (next.every(f => f.status === 'caught')) setTimeout(() => advancePhase('fishing'), 1000)
      return next
    })
  }, [config.fixationThresholdMs, advancePhase])

  // ── Phase timer ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'fishing' || phase === 'summary') return
    const dur = phaseDuration(phase)
    if (dur === 0) return
    const start = performance.now()
    let raf: number
    const tick = () => {
      const left = Math.max(0, dur - (performance.now() - start))
      setTimeLeft(left)
      if (left > 0) raf = requestAnimationFrame(tick)
      else advancePhase(phase)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase, phaseDuration, advancePhase])

  const skipPhase = useCallback(() => {
    if (phase !== 'summary') advancePhase(phase)
  }, [phase, advancePhase])

  const reset = useCallback(() => {
    sessionId.current = genId(); startTime.current = Date.now()
    phaseRef.current  = { handSamples: [], gazeSamples: [], events: [], startMs: performance.now() }
    phasesData.current = []; catchesRef.current = []
    prevGripRef.current = false; prevGazeTarget.current = null
    gazeLeftMsRef.current = 0; gazeRightMsRef.current = 0; gazeOnFishMsRef.current = 0
    setPhase('grip'); setTimeLeft(config.gripDurationMs)
    setFishes([]); setFishCaught(0); setSessionData(null)
  }, [config.gripDurationMs])

  return { phase, timeLeftMs, fishes, fishCaught, sessionData, updateHand, updateGaze, initFishes, tickFishing, skipPhase, reset }
}
