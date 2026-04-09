export type InputSourceType = 'eyeTracking' | 'mechanicalHand' | 'keyboard' | 'mouse'

export interface InputEvent {
  timestamp: number
  source: InputSourceType
  type: 'position' | 'button' | 'gesture'
  x?: number
  y?: number
  button?: string
  gesture?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meta?: Record<string, any>
}

/** Strategy interface — each input source must implement this */
export interface InputSource {
  readonly sourceType: InputSourceType
  isActive(): boolean
  getLatestEvent(): InputEvent | null
  destroy(): void
}
