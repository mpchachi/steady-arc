export const EMPTY_STATE = {
  sessions: [],
  message: "No sessions yet. Start playing to begin tracking your recovery.",
  hasData: false
};

export const PATIENT_INFO = {
  id: "P001",
  name: "Paciente 001",
  age: 64,
  diagnosis: "Ictus hemisfÃ©rico derecho â€” fase subaguda",
  disease: "stroke",
  weeksPostStroke: 2
};

export const METRICS_SDC = {
  grip_MVC: { value: 4.0, higher_bad: false },
  grip_release_time: { value: 35.0, higher_bad: true },
  emg_cocontraction_ratio: { value: 0.05, higher_bad: true },
  neglect_index: { value: 0.08, higher_bad: false },
  left_RT: { value: 40.0, higher_bad: true },
  right_RT: { value: 35.0, higher_bad: true },
  RT_gaze_to_grip: { value: 25.0, higher_bad: true },
  wrist_MT: { value: 45.0, higher_bad: true },
  wrist_SPARC: { value: 0.20, higher_bad: false },
  attention_mean: { value: 0.06, higher_bad: false }
};

// Seeded random for consistent mock reloading visually if needed, but Math.random() is fine for static module execution.
const generateHeatmap = (totalPoints, rightPercent) => {
  const points = [];
  const rightCount = Math.round(totalPoints * rightPercent);
  const leftCount = totalPoints - rightCount;

  for (let i = 0; i < rightCount; i++) {
    points.push({
      x: 0.55 + Math.random() * 0.4,
      y: 0.1 + Math.random() * 0.8,
      duration_ms: Math.floor(80 + Math.random() * 320)
    });
  }
  for (let i = 0; i < leftCount; i++) {
    points.push({
      x: 0.05 + Math.random() * 0.44, // keep it clearly left
      y: 0.1 + Math.random() * 0.8,
      duration_ms: Math.floor(80 + Math.random() * 320)
    });
  }
  return points.sort(() => Math.random() - 0.5);
};

export const MOCK_SESSIONS = [
  {
    id: "S1",
    date: "2026-04-10",
    metrics: { grip_MVC: 28.5, grip_release_time: 520.0, emg_cocontraction_ratio: 0.68, neglect_index: 0.38, left_RT: 820.0, right_RT: 380.0, RT_gaze_to_grip: 380.0, wrist_MT: 720.0, wrist_SPARC: -3.20, attention_mean: 0.42 },
    globalStatus: {
      riskScore: 0.82,
      alertLevel: "alert",
      domains: { grip: "deteriorating", neglect: "deteriorating", visuomotor: "deteriorating", attention: "watch" },
      clinicalSynthesis: "Session 1: First post-discharge session. Significant left hemispatial neglect detected (neglect_index: 0.38). Grip strength severely reduced. High spasticity markers. Immediate rehabilitation protocol recommended."
    },
    gaze_heatmap: generateHeatmap(20, 0.85),
    radar: { Grip: 35, Neglect: 28, Visuomotor: 32, Attention: 42 }
  },
  {
    id: "S2",
    date: "2026-04-17",
    metrics: { grip_MVC: 31.2, grip_release_time: 495.0, emg_cocontraction_ratio: 0.63, neglect_index: 0.45, left_RT: 780.0, right_RT: 365.0, RT_gaze_to_grip: 355.0, wrist_MT: 690.0, wrist_SPARC: -2.95, attention_mean: 0.46 },
    globalStatus: {
      riskScore: 0.75,
      alertLevel: "alert",
      domains: { grip: "deteriorating", neglect: "watch", visuomotor: "deteriorating", attention: "watch" },
      clinicalSynthesis: "Session 2: Slight improvement in neglect (0.45) and grip strength. Spasticity remains high. Visuomotor coordination still impaired. Continue intensive protocol."
    },
    gaze_heatmap: generateHeatmap(20, 0.70),
    radar: { Grip: 42, Neglect: 35, Visuomotor: 38, Attention: 46 }
  },
  {
    id: "S3",
    date: "2026-04-24",
    metrics: { grip_MVC: 35.8, grip_release_time: 460.0, emg_cocontraction_ratio: 0.57, neglect_index: 0.54, left_RT: 720.0, right_RT: 345.0, RT_gaze_to_grip: 320.0, wrist_MT: 645.0, wrist_SPARC: -2.65, attention_mean: 0.52 },
    globalStatus: {
      riskScore: 0.65,
      alertLevel: "watch",
      domains: { grip: "watch", neglect: "watch", visuomotor: "watch", attention: "stable" },
      clinicalSynthesis: "Session 3: Neglect index crossing 0.50 threshold â€” clinically significant improvement. Grip improving consistently. Smoothness (SPARC) recovering. Positive trajectory confirmed."
    },
    gaze_heatmap: generateHeatmap(20, 0.55),
    radar: { Grip: 52, Neglect: 48, Visuomotor: 50, Attention: 52 }
  },
  {
    id: "S4",
    date: "2026-05-01",
    metrics: { grip_MVC: 39.4, grip_release_time: 425.0, emg_cocontraction_ratio: 0.52, neglect_index: 0.63, left_RT: 660.0, right_RT: 328.0, RT_gaze_to_grip: 285.0, wrist_MT: 598.0, wrist_SPARC: -2.35, attention_mean: 0.58 },
    globalStatus: {
      riskScore: 0.52,
      alertLevel: "watch",
      domains: { grip: "stable", neglect: "stable", visuomotor: "watch", attention: "stable" },
      clinicalSynthesis: "Session 4: Neglect index 0.63 â€” substantial recovery. Grip MVC approaching functional range. Reaction time asymmetry reducing. Protocol intensity can be maintained."
    },
    gaze_heatmap: generateHeatmap(20, 0.52),
    radar: { Grip: 61, Neglect: 58, Visuomotor: 60, Attention: 58 }
  },
  {
    id: "S5",
    date: "2026-05-08",
    metrics: { grip_MVC: 43.1, grip_release_time: 392.0, emg_cocontraction_ratio: 0.47, neglect_index: 0.71, left_RT: 595.0, right_RT: 312.0, RT_gaze_to_grip: 252.0, wrist_MT: 548.0, wrist_SPARC: -2.08, attention_mean: 0.64 },
    globalStatus: {
      riskScore: 0.38,
      alertLevel: "stable",
      domains: { grip: "stable", neglect: "improving", visuomotor: "stable", attention: "stable" },
      clinicalSynthesis: "Session 5: All domains showing consistent improvement. Neglect index 0.71 â€” near functional range. Visuomotor coordination recovering well. Consider reducing session frequency."
    },
    gaze_heatmap: generateHeatmap(20, 0.50),
    radar: { Grip: 70, Neglect: 68, Visuomotor: 69, Attention: 64 }
  },
  {
    id: "S6",
    date: "2026-05-15",
    metrics: { grip_MVC: 46.8, grip_release_time: 362.0, emg_cocontraction_ratio: 0.43, neglect_index: 0.78, left_RT: 538.0, right_RT: 298.0, RT_gaze_to_grip: 218.0, wrist_MT: 502.0, wrist_SPARC: -1.82, attention_mean: 0.71 },
    globalStatus: {
      riskScore: 0.28,
      alertLevel: "stable",
      domains: { grip: "improving", neglect: "improving", visuomotor: "improving", attention: "improving" },
      clinicalSynthesis: "Session 6: Significant recovery across all domains. Neglect index 0.78, grip MVC 46.8N, attention 0.71. Patient approaching functional independence thresholds. Excellent rehabilitation response."
    },
    gaze_heatmap: generateHeatmap(20, 0.50),
    radar: { Grip: 78, Neglect: 76, Visuomotor: 74, Attention: 71 }
  }
];

export const EVOLUTION_DATA = MOCK_SESSIONS.map((s, idx) => ({ name: s.id, ...s.metrics }));

export function getSessionData(patientId) {
  if (typeof window === 'undefined') return MOCK_SESSIONS;
  const stored = localStorage.getItem(`steadyarc_sessions_${patientId}`);
  if (stored && JSON.parse(stored).length > 0) {
    return JSON.parse(stored);
  }
  return MOCK_SESSIONS;
}

export function saveRealSession(patientId, sessionJson) {
  if (typeof window === 'undefined') return;
  const key = `steadyarc_sessions_${patientId}`;
  const existing = JSON.parse(localStorage.getItem(key) || '[]');
  existing.push(sessionJson);
  localStorage.setItem(key, JSON.stringify(existing));
}

export function isUsingRealData(patientId) {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem(`steadyarc_sessions_${patientId}`);
  return stored && JSON.parse(stored).length > 0;
}
