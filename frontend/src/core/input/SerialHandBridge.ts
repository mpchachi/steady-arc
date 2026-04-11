import type { HandInput } from '@/games/fishing/types'

/**
 * Web Serial API bridge — Arduino hand_sensor.ino v2.0
 * Protocolo: JSON, 115200 baud, 50Hz
 * {"flex":423,"emg":128,"ax":0.0007,"ay":-0.9995,"az":0.0031,"gx":7.6,"gy":-2.3,"gz":1.1}
 *
 * Llama a connect() tras un gesto del usuario (botón).
 * Fallback automático a KeyboardHandSimulator si no hay puerto.
 */

// EMG thresholds — v3.0: envelope desde baseline (0 = reposo, sube con contracción)
export const EMG_THRESHOLDS = {
  baseline:   10,   // 0-10    ruido basal / reposo
  voluntary:  80,   // 10-80   contracción voluntaria
  strong:    200,   // 80-200  contracción fuerte
  max:       500,   // >200    contracción máxima / espasmo
}

// Flex calibration state
// Sensor recto (sin apretar) = max (1023). Flexionado (apretando) = min (valor bajo).
// gripStrength = 1 cuando aprieta, 0 cuando relaja.
interface FlexCal { min: number; max: number; calibrated: boolean }

type StatusListener = (status: 'connected' | 'disconnected' | 'error', msg?: string) => void

export class SerialHandBridge {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private port: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private reader: any = null
  private connected    = false
  private emgConnected = false
  private latest: HandInput | null = null
  // relajado (~400) → grip=0 | flexionado (~150) → grip=1
  private flexCal: FlexCal = { min: 100, max: 430, calibrated: false }
  private flexSmoothed = 0  // EMA para suavizar oscilaciones
  private onStatus?: StatusListener
  private buf = ''

  onStatusChange(cb: StatusListener) { this.onStatus = cb }

  isConnected(): boolean    { return this.connected }
  isEmgConnected(): boolean { return this.emgConnected }
  getLatest(): HandInput | null { return this.latest }

  /** Open Web Serial port — must be called from a user gesture */
  async connect(): Promise<void> {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial no soportado. Usa Chrome o Edge.')
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.port = await (navigator as any).serial.requestPort()
      await this.port.open({ baudRate: 115200 })
      this.connected = true
      this.onStatus?.('connected')
      this.readLoop()
    } catch (e) {
      this.onStatus?.('error', String(e))
      throw e
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false
    try { await this.reader?.cancel() } catch { /* ok */ }
    try { await this.port?.close()  } catch { /* ok */ }
    this.port   = null
    this.reader = null
    this.latest = null
    this.onStatus?.('disconnected')
  }

  /**
   * Flex calibration — call once at session start:
   * Ask patient to squeeze max ("aprieta al máximo") → call setFlexMax()
   * Ask patient to relax ("relaja la mano")          → call setFlexMin()
   */
  /** Llama cuando el paciente tiene la mano rígida/extendida (ADC bajo ~300) */
  calibrateOpen() {
    const raw = this.latest?.flexRaw ?? 300
    this.flexCal.min = Math.min(raw, this.flexCal.max - 50)
  }
  /** Llama cuando el paciente flexiona al máximo (ADC alto ~620) */
  calibrateGrip() {
    const raw = this.latest?.flexRaw ?? 620
    this.flexCal.max = Math.max(raw, this.flexCal.min + 50)
    this.flexCal.calibrated = true
  }

  private async readLoop(): Promise<void> {
    try {
      const decoder = new TextDecoderStream()
      this.port.readable.pipeTo(decoder.writable)
      const reader = decoder.readable.getReader()
      this.reader  = reader

      while (this.connected) {
        const { value, done } = await reader.read()
        if (done) break
        this.buf += value
        const lines = this.buf.split('\n')
        this.buf = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith('{')) this.parseLine(trimmed)
        }
      }
    } catch {
      this.connected = false
      this.onStatus?.('disconnected')
    }
  }

  private parseLine(line: string): void {
    try {
      const d = JSON.parse(line) as {
        flex: number; emg: number; emg_raw?: number
        ax: number; ay: number; az: number
        gx: number; gy: number; gz: number
        status?: string; emg_connected?: boolean; emg_baseline?: number
      }

      // Status packet from Arduino init
      if (d.status === 'ready') {
        this.emgConnected = d.emg_connected ?? false
        return
      }

      // Flex: relajado=max(~400) → grip=0 | flexionado=min(~150) → grip=1
      const { min, max } = this.flexCal
      const raw = Math.max(0, Math.min(1, (max - d.flex) / (max - min)))
      // EMA para suavizar oscilaciones 300-400 (alpha=0.3)
      this.flexSmoothed = this.flexSmoothed * 0.7 + raw * 0.3
      const flexNorm = this.flexSmoothed

      // emgRaw = ADC real 0-1023 (d.emg_raw) → para MetricsCalculator
      // emgNorm = envelope normalizado (d.emg) → para display
      const emgRaw  = (d.emg_raw !== undefined && d.emg_raw >= 0) ? d.emg_raw : undefined
      const emgNorm = (d.emg !== undefined && d.emg >= 0) ? Math.min(1, d.emg / 500) : undefined
      if (emgRaw !== undefined) this.emgConnected = true

      // Orientation from accel (pitch/roll in degrees)
      const pitch = Math.atan2(d.ay, d.az) * (180 / Math.PI)
      const roll  = Math.atan2(-d.ax, d.az) * (180 / Math.PI)
      // Yaw needs magnetometer — approximate from gyro integration (not done here)
      const yaw   = 0

      // Convert °/s → rad/s so MetricsCalculator thresholds are consistent with keyboard sim
      const DEG2RAD = Math.PI / 180
      this.latest = {
        gripStrength: flexNorm,
        flexRaw:      d.flex,
        accel: { x: d.ax, y: d.ay, z: d.az },
        gyro:  { x: d.gx * DEG2RAD, y: d.gy * DEG2RAD, z: d.gz * DEG2RAD },
        orientation: { pitch, roll, yaw },
        emg:    emgNorm,
        emgRaw: emgRaw,
        timestamp:   performance.now(),
        source:      'serial',
        isConnected: true,
      }
    } catch {
      // malformed packet — skip silently
    }
  }
}
