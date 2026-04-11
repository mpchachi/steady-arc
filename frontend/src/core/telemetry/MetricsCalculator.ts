/**
 * MetricsCalculator — stroke rehabilitation, 10 clean metrics.
 */
import type { HandSample, FishCatch, ClinicalMetrics } from '@/games/fishing/types'

export class MetricsCalculator {

  compute(
    fishCatches:       FishCatch[],
    gripSamples:       HandSample[],
    fishingSamples:    HandSample[],
    neglectIndex:      number | null,
    attentionFraction: number | null,
  ): ClinicalMetrics {
    const { grip_MVC, grip_release_time } = this.computeGripMetrics(gripSamples)
    const emg_cocontraction_ratio         = this.computeEMGCocontraction(gripSamples)
    const { wrist_MT, wrist_SPARC }       = this.computeWristMetrics(fishingSamples)
    const { left_RT, right_RT, RT_gaze_to_grip } = this.computeCoordination(fishCatches)

    return {
      grip_MVC,
      grip_release_time,
      emg_cocontraction_ratio,
      neglect_index:   neglectIndex,
      left_RT,
      right_RT,
      RT_gaze_to_grip,
      attention_mean:  attentionFraction,
      wrist_MT,
      wrist_SPARC,
    }
  }

  // ── Grip (flex) ───────────────────────────────────────────────────────────

  computeGripMetrics(samples: HandSample[]): {
    grip_MVC: number | null
    grip_release_time: number | null
  } {
    if (samples.length < 10) return { grip_MVC: null, grip_release_time: null }

    const grip  = samples.map(s => s.gripStrength)
    const times = samples.map(s => s.timestamp)

    const grip_MVC = Math.max(...grip)

    // Find peaks above 0.4 with prominence > 0.15
    const peaks = this.findPeaks(grip, 0.15).filter(i => grip[i]! > 0.4)

    if (peaks.length < 1) return { grip_MVC, grip_release_time: null }

    // For each peak, time until grip drops below 0.2
    const releaseTimes: number[] = []
    for (const pi of peaks) {
      for (let j = pi + 1; j < grip.length; j++) {
        if (grip[j]! < 0.2) {
          releaseTimes.push(times[j]! - times[pi]!)
          break
        }
      }
    }

    return {
      grip_MVC,
      grip_release_time: releaseTimes.length ? mean(releaseTimes) : null,
    }
  }

  // ── EMG co-contraction ────────────────────────────────────────────────────
  // Baseline = first quiet seconds of grip phase (grip < 0.15, before first peak)

  computeEMGCocontraction(gripSamples: HandSample[]): number | null {
    const emgSamples = gripSamples.filter(s => s.emgRaw !== undefined)
    if (emgSamples.length < 20) return null

    const emgNorm = emgSamples.map(s => (s.emgRaw ?? 0) / 1023)

    // Active RMS (full grip phase)
    const activeRms = Math.sqrt(mean(emgNorm.map(v => v * v)))

    // Baseline: samples where grip is quiet (before first contraction)
    const gripVals = gripSamples.filter(s => s.emgRaw !== undefined).map(s => s.gripStrength)
    const firstPeakIdx = gripVals.findIndex(g => g > 0.35)
    const baselineSamples = firstPeakIdx > 5
      ? emgNorm.slice(0, firstPeakIdx)
      : emgNorm.slice(0, Math.min(30, Math.floor(emgNorm.length * 0.15)))

    const restRms = baselineSamples.length > 0
      ? Math.sqrt(mean(baselineSamples.map(v => v * v)))
      : 0

    return (restRms + activeRms) > 0 ? activeRms / (restRms + activeRms) : null
  }

  // ── Wrist movement (IMU, fishing phase) ───────────────────────────────────

  computeWristMetrics(samples: HandSample[]): {
    wrist_MT: number | null
    wrist_SPARC: number | null
  } {
    if (samples.length < 10) return { wrist_MT: null, wrist_SPARC: null }

    const times = samples.map(s => s.timestamp)
    const omega = samples.map(s =>
      Math.sqrt(s.gyroX ** 2 + s.gyroY ** 2 + s.gyroZ ** 2)
    )

    const threshold = 0.5  // rad/s
    const active = omega.map((v, i) => ({ i, v })).filter(x => x.v > threshold)
    const wrist_MT = active.length > 1
      ? times[active[active.length - 1]!.i]! - times[active[0]!.i]!
      : null

    const wrist_SPARC = this.computeSPARC(omega, times)

    return { wrist_MT, wrist_SPARC }
  }

  // ── Coordination + neglect ────────────────────────────────────────────────

  computeCoordination(catches: FishCatch[]): {
    left_RT: number | null
    right_RT: number | null
    RT_gaze_to_grip: number | null
  } {
    const leftFTs  = catches.filter(c => c.side === 'left'  && c.FT !== null).map(c => c.FT!)
    const rightFTs = catches.filter(c => c.side === 'right' && c.FT !== null).map(c => c.FT!)
    const allFTs   = catches.map(c => c.FT).filter((v): v is number => v !== null)

    return {
      left_RT:         leftFTs.length  ? mean(leftFTs)  : null,
      right_RT:        rightFTs.length ? mean(rightFTs) : null,
      RT_gaze_to_grip: allFTs.length   ? mean(allFTs)   : null,
    }
  }

  // ── Signal processing ─────────────────────────────────────────────────────

  private computeSPARC(omega: number[], times: number[]): number {
    if (omega.length < 4) return 0
    const duration  = (times[times.length - 1]! - times[0]!) / 1000
    const peakOmega = Math.max(...omega) || 1
    const v   = omega.map(o => o / peakOmega)
    const n   = nextPow2(v.length)
    const pad = [...v, ...new Array(n - v.length).fill(0)]
    const mag = this.fftMagnitude(pad)
    const fc  = 10
    const maxK = Math.min(Math.floor(fc * duration) + 1, mag.length)
    let arcLen = 0
    for (let i = 1; i < maxK; i++) {
      const df   = 1 / duration
      const dMag = (mag[i]! - mag[i - 1]!) / df
      arcLen += Math.sqrt(1 + dMag * dMag) * df
    }
    return -Math.log(arcLen + 1e-6)
  }

  private fftMagnitude(x: number[]): number[] {
    const n = x.length
    if (n === 1) return [Math.abs(x[0]!)]
    const re = Float64Array.from(x)
    const im = new Float64Array(n)
    let j = 0
    for (let i = 1; i < n; i++) {
      let bit = n >> 1
      for (; j & bit; bit >>= 1) j ^= bit
      j ^= bit
      if (i < j) {
        ;[re[i], re[j]] = [re[j]!, re[i]!];
        [im[i], im[j]] = [im[j]!, im[i]!]
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len
      const wr = Math.cos(ang); const wi = Math.sin(ang)
      for (let i = 0; i < n; i += len) {
        let cr = 1; let ci = 0
        for (let k = 0; k < len / 2; k++) {
          const ur = re[i+k]!; const ui = im[i+k]!
          const vr = re[i+k+len/2]!*cr - im[i+k+len/2]!*ci
          const vi = re[i+k+len/2]!*ci + im[i+k+len/2]!*cr
          re[i+k]       = ur+vr; im[i+k]       = ui+vi
          re[i+k+len/2] = ur-vr; im[i+k+len/2] = ui-vi
          const nr = cr*wr - ci*wi; ci = cr*wi + ci*wr; cr = nr
        }
      }
    }
    return Array.from({ length: n/2 }, (_, i) =>
      Math.sqrt(re[i]!**2 + im[i]!**2) / n
    )
  }

  private findPeaks(signal: number[], minProminence: number): number[] {
    const peaks: number[] = []
    for (let i = 1; i < signal.length - 1; i++) {
      if (signal[i]! > signal[i-1]! && signal[i]! > signal[i+1]!) {
        const leftMin  = Math.min(...signal.slice(Math.max(0, i-20), i))
        const rightMin = Math.min(...signal.slice(i+1, Math.min(signal.length, i+20)))
        if (signal[i]! - Math.max(leftMin, rightMin) >= minProminence) peaks.push(i)
      }
    }
    return peaks
  }
}

function mean(arr: number[]): number {
  if (!arr.length) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

function nextPow2(n: number): number {
  let p = 1; while (p < n) p <<= 1; return p
}
