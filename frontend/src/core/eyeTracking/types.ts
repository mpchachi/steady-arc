export interface IrisLandmarks {
  leftIrisCenter: { x: number; y: number }
  rightIrisCenter: { x: number; y: number }
  leftIrisRatio: { x: number; y: number }
  rightIrisRatio: { x: number; y: number }
  leftEyeOpenness: number
  rightEyeOpenness: number
  isBlinking: boolean
}

export interface GazePoint {
  rawX: number
  rawY: number
  filteredX: number
  filteredY: number
  velocityPxS: number   // px/s from Kalman state
  confidence: number
  isSaccade: boolean
  isBlinking: boolean
  timestamp: number
}

export interface CalibrationSample {
  targetX: number
  targetY: number
  irisRatioX: number
  irisRatioY: number
  headYaw: number    // radians — used as regression feature
  headPitch: number  // radians
}

export interface CalibrationData {
  samples: CalibrationSample[]
  coeffsX: number[]  // 10 coefficients (with head-pose features)
  coeffsY: number[]
  calibratedAt: number
  screenWidth: number
  screenHeight: number
}

export interface HeadPose {
  pitch: number
  yaw: number
  roll: number
}
