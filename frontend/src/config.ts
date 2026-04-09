// Centralized configuration for the rehab platform
// All tunable parameters live here so nothing is hardcoded

export const CONFIG = {
  eyeTracking: {
    // EMA smoothing factor (0 = no smoothing, 1 = completely frozen)
    emaAlpha: 0.3,
    // Blink detection: eye-openness ratio below this threshold = blink
    // Kept conservative (low) — only flag nearly-closed eyes to avoid false positives
    blinkThreshold: 0.07,
    // Saccade detection: velocity above this (px/ms) = saccade
    saccadeVelocityThreshold: 0.5,
    // Fixation: gaze stable within this radius (normalized) for minFixationMs
    fixationRadius: 0.05,
    minFixationMs: 80,
    // MediaPipe refineLandmarks enables iris tracking
    refineLandmarks: true,
    // Max detection confidence
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  },
  calibration: {
    // 9-point grid (3x3)
    points: 9,
    gridCols: 3,
    gridRows: 3,
    // Duration per point in milliseconds
    pointDurationMs: 2000,
    // Discard first N ms (saccade settling time)
    warmupMs: 1000,
    // Polynomial regression degree
    polynomialDegree: 2,
    // Padding from screen edges (0..1)
    edgePadding: 0.1,
    localStorageKey: 'rehab_calibration_v1',
  },
  lantern: {
    // Radius of the revealed circle in pixels
    radius: 120,
    // Feathering width in pixels (soft edge)
    featherWidth: 60,
    // Opacity of the fog layer
    fogOpacity: 0.96,
  },
  game: {
    // Percentage of area to reveal to win
    winThreshold: 0.9,
    // Cave generation seed (0 = random)
    seed: 0,
  },
  telemetry: {
    // GazeSample recording interval in ms (0 = every frame)
    sampleIntervalMs: 0,
  },
} as const
