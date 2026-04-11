export function saveSession(patientId, sessionJson) {
  if (typeof window === 'undefined') return [];
  const key = 'steadyarc_attention_sessions_' + patientId;
  const existingStr = localStorage.getItem(key);
  const existing = existingStr ? JSON.parse(existingStr) : [];
  existing.push(sessionJson);
  localStorage.setItem(key, JSON.stringify(existing));
  return existing;
}

export function getSessions(patientId) {
  if (typeof window === 'undefined') return [];
  const key = 'steadyarc_attention_sessions_' + patientId;
  const existingStr = localStorage.getItem(key);
  return existingStr ? JSON.parse(existingStr) : [];
}

export function trainModel(patientId) {
  const sessions = getSessions(patientId);
  if (sessions.length < 2) return { error: 'Insufficient data. Minimum 2 sessions required.' };

  const xArray = [];
  const yArray = [];

  sessions.forEach((s, idx) => {
    xArray.push(idx + 1); // session sequence as X
    yArray.push(s.attention_mean); // attention as Y
  });

  const n = xArray.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += xArray[i];
    sumY += yArray[i];
    sumXY += xArray[i] * yArray[i];
    sumX2 += xArray[i] * xArray[i];
  }

  const denominator = (n * sumX2) - (sumX * sumX);
  const slope = denominator === 0 ? 0 : ((n * sumXY) - (sumX * sumY)) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  let score = 0.5 + (slope * 2);
  if (score > 1.0) score = 1.0;
  if (score < 0.0) score = 0.0;

  return { isTrained: true, slope, intercept, numSessions: n, score };
}

export function predictSession(newSessionData, trainResult) {
  if (!trainResult || !trainResult.isTrained) return { error: 'Model not trained' };
  
  return {
    predictedClass: trainResult.slope > 0 ? 'Improving' : 'Deteriorating',
    score: trainResult.score,
    slope: trainResult.slope
  };
}

export function getPlotData(trainResult) { return null; }

export function processModel(patientId, sessionJson) {
  saveSession(patientId, sessionJson);
  const trainRes = trainModel(patientId);
  if (trainRes.error) return trainRes;
  return predictSession(sessionJson, trainRes);
}
