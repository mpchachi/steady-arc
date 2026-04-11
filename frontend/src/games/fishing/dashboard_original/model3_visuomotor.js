import { kmeans } from 'ml-kmeans';

function standardize(data) {
  if (data.length === 0) return { standardized: [], means: [], stds: [] };
  const numFeatures = data[0].length;
  const means = new Array(numFeatures).fill(0);
  const stds = new Array(numFeatures).fill(0);

  data.forEach(row => { row.forEach((val, i) => { means[i] += val; }); });
  for (let i = 0; i < numFeatures; i++) means[i] /= data.length;

  data.forEach(row => { row.forEach((val, i) => { stds[i] += Math.pow(val - means[i], 2); }); });
  for (let i = 0; i < numFeatures; i++) {
    stds[i] = Math.sqrt(stds[i] / data.length);
    if (stds[i] === 0) stds[i] = 1;
  }

  const standardized = data.map(row => row.map((val, i) => (val - means[i]) / stds[i]));
  return { standardized, means, stds };
}

export function saveSession(patientId, sessionJson) {
  if (typeof window === 'undefined') return [];
  const key = 'steadyarc_vm_sessions_' + patientId;
  const existingStr = localStorage.getItem(key);
  const existing = existingStr ? JSON.parse(existingStr) : [];
  existing.push(sessionJson);
  localStorage.setItem(key, JSON.stringify(existing));
  return existing;
}

export function getSessions(patientId) {
  if (typeof window === 'undefined') return [];
  const key = 'steadyarc_vm_sessions_' + patientId;
  const existingStr = localStorage.getItem(key);
  return existingStr ? JSON.parse(existingStr) : [];
}

export function trainModel(patientId) {
  const sessions = getSessions(patientId);
  if (sessions.length < 5) return { error: 'Insufficient data. Minimum 5 sessions required.' };

  const rawData = sessions.map(s => [s.RT_gaze_to_grip, s.wrist_MT, s.wrist_SPARC]);
  const { standardized, means, stds } = standardize(rawData);

  const ans = kmeans(standardized, 2, { initialization: 'kmeans++' });
  
  const unstdC0_RT = ans.centroids[0].centroid[0] * stds[0] + means[0];
  const unstdC1_RT = ans.centroids[1].centroid[0] * stds[0] + means[0];
  const unstdC0_SPARC = ans.centroids[0].centroid[2] * stds[2] + means[2]; 
  const unstdC1_SPARC = ans.centroids[1].centroid[2] * stds[2] + means[2];

  const scoreC0 = unstdC0_SPARC - (unstdC0_RT / 1000);
  const scoreC1 = unstdC1_SPARC - (unstdC1_RT / 1000);
  
  const healthyClusterIndex = scoreC0 > scoreC1 ? 0 : 1;
  const pathClusterIndex = scoreC0 > scoreC1 ? 1 : 0;

  return {
    isTrained: true,
    numSessions: sessions.length,
    means, stds,
    centroids: ans.centroids,
    healthyClusterIndex, pathClusterIndex
  };
}

export function predictSession(newSessionData, trainResult) {
  if (!trainResult || !trainResult.isTrained) return { error: 'Model not trained' };
  
  const rawPoint = [newSessionData.RT_gaze_to_grip, newSessionData.wrist_MT, newSessionData.wrist_SPARC];
  const stdPoint = rawPoint.map((val, i) => (val - trainResult.means[i]) / trainResult.stds[i]);
  
  const distHealthy = Math.sqrt(
    Math.pow(stdPoint[0] - trainResult.centroids[trainResult.healthyClusterIndex].centroid[0], 2) +
    Math.pow(stdPoint[1] - trainResult.centroids[trainResult.healthyClusterIndex].centroid[1], 2) +
    Math.pow(stdPoint[2] - trainResult.centroids[trainResult.healthyClusterIndex].centroid[2], 2)
  );

  const distPath = Math.sqrt(
    Math.pow(stdPoint[0] - trainResult.centroids[trainResult.pathClusterIndex].centroid[0], 2) +
    Math.pow(stdPoint[1] - trainResult.centroids[trainResult.pathClusterIndex].centroid[1], 2) +
    Math.pow(stdPoint[2] - trainResult.centroids[trainResult.pathClusterIndex].centroid[2], 2)
  );

  // In Visuomotor, we specifically use the distance to the healthy centroid as an anomaly score.
  // The further away from healthy, the worse.
  const predictedCluster = distHealthy <= distPath ? trainResult.healthyClusterIndex : trainResult.pathClusterIndex;
  
  let rawScore = distPath / (distHealthy + distPath);
  if (isNaN(rawScore)) rawScore = 0.5;

  return { score: rawScore, predictedClass: predictedCluster === trainResult.healthyClusterIndex ? 'Normal' : 'Abnormal', anomalyDistance: distHealthy };
}

export function getPlotData(trainResult) { return null; }

export function processModel(patientId, sessionJson) {
  saveSession(patientId, sessionJson);
  const trainRes = trainModel(patientId);
  if (trainRes.error) return trainRes;
  return predictSession(sessionJson, trainRes);
}
