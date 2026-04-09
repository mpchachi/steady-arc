import type { InputSource, InputEvent, InputSourceType } from './types'

/**
 * Strategy/Adapter pattern.
 * Manages multiple input sources with priority ordering.
 * Eye tracking is primary now; mechanical hand plugs in later.
 */
export class InputManager {
  private sources = new Map<InputSourceType, InputSource>()
  private priorityOrder: InputSourceType[] = ['eyeTracking', 'mechanicalHand', 'keyboard', 'mouse']

  register(source: InputSource): void {
    this.sources.set(source.sourceType, source)
  }

  unregister(type: InputSourceType): void {
    this.sources.get(type)?.destroy()
    this.sources.delete(type)
  }

  /**
   * Returns the latest position event from the highest-priority active source.
   */
  getActivePositionEvent(): InputEvent | null {
    for (const type of this.priorityOrder) {
      const source = this.sources.get(type)
      if (!source || !source.isActive()) continue
      const event = source.getLatestEvent()
      if (event?.type === 'position') return event
    }
    return null
  }

  getSource(type: InputSourceType): InputSource | undefined {
    return this.sources.get(type)
  }

  destroy(): void {
    for (const source of this.sources.values()) {
      source.destroy()
    }
    this.sources.clear()
  }
}

// ---- Eye tracking adapter ----

import type { GazePoint } from '@/core/eyeTracking/types'

export class EyeTrackingSource implements InputSource {
  readonly sourceType: InputSourceType = 'eyeTracking'
  private latestGaze: GazePoint | null = null
  private active = false

  update(gaze: GazePoint | null): void {
    this.latestGaze = gaze
    this.active = gaze !== null && !gaze.isBlinking
  }

  isActive(): boolean {
    return this.active
  }

  getLatestEvent(): InputEvent | null {
    if (!this.latestGaze) return null
    return {
      timestamp: this.latestGaze.timestamp,
      source: 'eyeTracking',
      type: 'position',
      x: this.latestGaze.filteredX,
      y: this.latestGaze.filteredY,
      meta: {
        rawX: this.latestGaze.rawX,
        rawY: this.latestGaze.rawY,
        isSaccade: this.latestGaze.isSaccade,
        confidence: this.latestGaze.confidence,
      },
    }
  }

  destroy(): void {
    this.latestGaze = null
    this.active = false
  }
}
