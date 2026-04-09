export interface IrisLandmarks {
  // Center of each iris (screen-space, 0..1)
  leftIrisCenter: { x: number; y: number }
  rightIrisCenter: { x: number; y: number }
  // Ratio of iris center relative to eye corners (position-invariant)
  leftIrisRatio: { x: number; y: number }
  rightIrisRatio: { x: number; y: number }
  // Eye-openness: 0 = closed, 1 = fully open
  leftEyeOpenness: number
  rightEyeOpenness: number
  // Combined blink flag
  isBlinking: boolean
}

export interface GazePoint {
  // Raw screen coords (pixels)
  rawX: number
  rawY: number
  // Filtered screen coords (pixels)
  filteredX: number
  filteredY: number
  // Confidence 0..1
  confidence: number
  // Whether a saccade is in progress
  isSaccade: boolean
  // Whether blinking
  isBlinking: boolean
  // High-res timestamp
  timestamp: number
}

export interface CalibrationSample {
  targetX: number // screen px
  targetY: number // screen px
  irisRatioX: number // mean iris ratio X for this point
  irisRatioY: number // mean iris ratio Y for this point
}

export interface CalibrationData {
  samples: CalibrationSample[]
  coeffsX: number[] // polynomial coefficients for X
  coeffsY: number[] // polynomial coefficients for Y
  calibratedAt: number
  screenWidth: number
  screenHeight: number
}

export interface HeadPose {
  pitch: number // rotation around X axis (radians)
  yaw: number   // rotation around Y axis (radians)
  roll: number  // rotation around Z axis (radians)
}
