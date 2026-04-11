import type { HandInput } from '@/games/fishing/types'

/**
 * Simulates a mechanical hand glove with keyboard input.
 * Generates realistic sensor-like signals (sinusoidal + noise) so that
 * MetricsCalculator produces meaningful values even without hardware.
 *
 * Key mapping:
 *   Space        → flex open/close cycle (grip)
 *   ← / →        → gyro.z pronation/supination
 *   ↑ / ↓        → gyro.x pitch
 *   R            → gyro.y yaw rotation
 */
export class KeyboardHandSimulator {
  private keys = new Set<string>()
  private flexPhase = 0           // 0 = open, increases when space held
  private flexVel = 0             // flex velocity
  private gyroZ = 0               // pronation state
  private gyroX = 0               // pitch state
  private gyroY = 0               // yaw state
  private accelX = 0
  private accelY = 0
  private accelZ = -1             // gravity baseline
  private lastTimestamp = performance.now()

  // Cycle tracking for event callbacks
  private onFlexPeak?: (t: number) => void
  private onFlexTrough?: (t: number) => void
  private prevFlexVel = 0

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.handleKeyUp   = this.handleKeyUp.bind(this)
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup',   this.handleKeyUp)
  }

  onCyclePeak(cb: (t: number) => void)   { this.onFlexPeak   = cb }
  onCycleTrough(cb: (t: number) => void) { this.onFlexTrough = cb }

  private handleKeyDown(e: KeyboardEvent) {
    // Don't swallow keypresses used by the app (D = debug, Escape, etc.)
    if (['d', 'D', 'Escape'].includes(e.key)) return
    this.keys.add(e.key)
  }

  private handleKeyUp(e: KeyboardEvent) {
    this.keys.delete(e.key)
  }

  /** Call once per frame to get current hand state */
  update(): HandInput {
    const now = performance.now()
    const dt = Math.min((now - this.lastTimestamp) / 1000, 0.05) // cap at 50ms
    this.lastTimestamp = now

    const spaceDown = this.keys.has(' ')

    // ── Flex simulation ──────────────────────────────────────────────────
    // Target: 1.0 when space held, 0.0 when released
    const flexTarget = spaceDown ? 1.0 : 0.0
    const flexSpeed  = 3.0  // 0→1 in ~333ms
    const prevFlex   = this.flexPhase
    this.flexPhase  += (flexTarget - this.flexPhase) * flexSpeed * dt
    this.flexPhase   = Math.max(0, Math.min(1, this.flexPhase))

    // Add mild noise to simulate sensor
    const noise = (Math.random() - 0.5) * 0.015
    const flexRaw = Math.max(0, Math.min(1, this.flexPhase + noise))

    this.flexVel = (this.flexPhase - prevFlex) / Math.max(dt, 0.001)

    // Cycle detection
    const wasMovingUp = this.prevFlexVel > 0.05
    const wasMovingDn = this.prevFlexVel < -0.05
    const nowMovingUp = this.flexVel > 0.05
    const nowMovingDn = this.flexVel < -0.05
    if (wasMovingUp && !nowMovingUp && this.flexPhase > 0.7) {
      this.onFlexPeak?.(now)
    }
    if (wasMovingDn && !nowMovingDn && this.flexPhase < 0.3) {
      this.onFlexTrough?.(now)
    }
    this.prevFlexVel = this.flexVel

    const gripStrength = flexRaw

    // ── Gyro simulation ──────────────────────────────────────────────────
    // Pronation/supination: left/right arrows → gyro.z
    const leftDown  = this.keys.has('ArrowLeft')
    const rightDown = this.keys.has('ArrowRight')
    const upDown    = this.keys.has('ArrowUp')
    const downDown  = this.keys.has('ArrowDown')
    const rDown     = this.keys.has('r') || this.keys.has('R')

    const targetGZ = leftDown ? -4 : rightDown ? 4 : 0
    const targetGX = upDown   ? -3 : downDown  ? 3 : 0
    const targetGY = rDown    ? 3  : 0

    const gyroDecay = 6.0
    this.gyroZ += (targetGZ - this.gyroZ) * gyroDecay * dt
    this.gyroX += (targetGX - this.gyroX) * gyroDecay * dt
    this.gyroY += (targetGY - this.gyroY) * gyroDecay * dt

    // Add tremor-band noise (2-6 Hz, low amplitude) to simulate baseline
    const tremorNoise = Math.sin(now * 0.025) * 0.04 + (Math.random() - 0.5) * 0.03
    const gyroX = this.gyroX + tremorNoise
    const gyroY = this.gyroY + tremorNoise * 0.7
    const gyroZ = this.gyroZ + tremorNoise * 0.8

    // ── Accel simulation ─────────────────────────────────────────────────
    // Derive approximate accel from gyro (simplified)
    this.accelX += this.gyroZ * 0.1 * dt
    this.accelY += this.gyroX * 0.1 * dt
    this.accelX *= 0.98  // drift correction
    this.accelY *= 0.98

    const accelX = this.accelX + (Math.random() - 0.5) * 0.02
    const accelY = this.accelY + (Math.random() - 0.5) * 0.02
    const accelZ = this.accelZ + (Math.random() - 0.5) * 0.01

    // ── Orientation (simple integration) ─────────────────────────────────
    const pitch = Math.atan2(accelY, accelZ) * (180 / Math.PI)
    const roll  = Math.atan2(-accelX, accelZ) * (180 / Math.PI)
    const yaw   = this.gyroY * 10  // simplified

    return {
      gripStrength,
      flexRaw,
      accel: { x: accelX, y: accelY, z: accelZ },
      gyro:  { x: gyroX,  y: gyroY,  z: gyroZ },
      orientation: { pitch, roll, yaw },
      timestamp: now,
      source: 'keyboard',
      isConnected: true,
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup',   this.handleKeyUp)
    this.keys.clear()
  }
}
