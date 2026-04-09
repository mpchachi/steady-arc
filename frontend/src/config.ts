// Centralized configuration for the rehab platform

export const CONFIG = {
  eyeTracking: {
    // Kalman measurement noise (px² — higher = smoother but slower)
    kalmanMeasurementNoise: 40,
    // Kalman velocity process noise (px/s per frame — higher = more responsive)
    kalmanVelocityNoise: 80,
    // Blink detection threshold (eye openness ratio — conservative to avoid false positives)
    blinkThreshold: 0.07,
    // Saccade: speed above this (px/s) = saccade in progress
    saccadeVelocityThreshold: 400,
    // Fixation: gaze stable within this radius (px) for minFixationMs
    fixationRadiusPx: 40,
    minFixationMs: 80,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  },
  calibration: {
    // 16-point grid (4x4) — needed for the head-pose regression (10 features)
    points: 16,
    gridCols: 4,
    gridRows: 4,
    pointDurationMs: 2000,
    warmupMs: 800,
    // Outlier rejection: IQR multiplier (1.5 = standard Tukey fence)
    iqrMultiplier: 1.5,
    // Polynomial degree (2 = bivariate quadratic + head-pose cross-terms)
    polynomialDegree: 2,
    edgePadding: 0.08,
    // v2: includes head-pose features in regression (incompatible with v1)
    localStorageKey: 'rehab_calibration_v2',
    // Number of polynomial coefficients (10 with head-pose features)
    numCoeffs: 10,
  },
  lantern: {
    radius: 120,
    featherWidth: 60,
    fogOpacity: 0.96,
  },
  game: {
    winThreshold: 0.9,
    seed: 0,
  },
  telemetry: {
    sampleIntervalMs: 0,
  },
} as const
