import { kmeans } from 'ml-kmeans';

/**
 * Standardize an array of arrays (z-score normalization).
 * Returns the standardized data along with means and standard deviations.
 */
function standardize(data) {
  if (data.length === 0) return { standardized: [], means: [], stds: [] };
  const numFeatures = data[0].length;
  const means = new Array(numFeatures).fill(0);
  const stds = new Array(numFeatures).fill(0);

  // Calculate means
  data.forEach(row => {
    row.forEach((val, i) => { means[i] += val; });
  });
  for (let i = 0; i < numFeatures; i++) means[i] /= data.length;

  // Calculate standard deviations
  data.forEach(row => {
    row.forEach((val, i) => { stds[i] += Math.pow(val - means[i], 2); });
  });
  for (let i = 0; i < numFeatures; i++) {
    stds[i] = Math.sqrt(stds[i] / data.length);
    if (stds[i] === 0) stds[i] = 1; // Prevent division by zero
  }

  // Standardize data
  const standardized = data.map(row => 
    row.map((val, i) => (val - means[i]) / stds[i])
  );

  return { standardized, means, stds };
}

export function saveSession(patientId, sessionJson) {
  if (typeof window === 'undefined') return []; // Prevent SSR crash
  const key = 'steadyarc_grip_sessions_' + patientId;
  const existingStr = localStorage.getItem(key);
  const existing = existingStr ? JSON.parse(existingStr) : [];
  existing.push(sessionJson);
  localStorage.setItem(key, JSON.stringify(existing));
  return existing;
}

export function getSessions(patientId) {
  if (typeof window === 'undefined') return [];
  const key = 'steadyarc_grip_sessions_' + patientId;
  const existingStr = localStorage.getItem(key);
  return existingStr ? JSON.parse(existingStr) : [];
}

export function trainModel(patientId) {
  const sessions = getSessions(patientId);
  if (sessions.length < 5) return { error: 'Insufficient data. Minimum 5 sessions required.' };

  // Metrics: grip_MVC, grip_release_time, emg_cocontraction_ratio
  const rawData = sessions.map(s => [s.grip_MVC, s.grip_release_time, s.emg_cocontraction_ratio]);
  const { standardized, means, stds } = standardize(rawData);

  // Train K-Means
  const ans = kmeans(standardized, 2, { initialization: 'kmeans++' });
  
  // Healthy logic: High grip_MVC, low grip_release_time.
  const c0_mvc = ans.centroids[0].centroid[0];
  const c1_mvc = ans.centroids[1].centroid[0];
  const c0_rel = ans.centroids[0].centroid[1];
  const c1_rel = ans.centroids[1].centroid[1];
  
  // Score: higher MVC is better (+), lower release is better (-)
  const scoreC0 = c0_mvc - c0_rel;
  const scoreC1 = c1_mvc - c1_rel;
  
  const healthyClusterIndex = scoreC0 > scoreC1 ? 0 : 1;
  const pathClusterIndex = scoreC0 > scoreC1 ? 1 : 0;

  return {
    isTrained: true,
    numSessions: sessions.length,
    means,
    stds,
    centroids: ans.centroids,
    healthyClusterIndex,
    pathClusterIndex,
  };
}

export function predictSession(newSessionData, trainResult) {
  if (!trainResult || !trainResult.isTrained) return { error: 'Model not trained' };
  
  const rawPoint = [newSessionData.grip_MVC, newSessionData.grip_release_time, newSessionData.emg_cocontraction_ratio];
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

  const predictedCluster = distHealthy <= distPath ? trainResult.healthyClusterIndex : trainResult.pathClusterIndex;
  
  // Recovery score from 0 to 1 based on distances. 1 = closest to healthy, furthest from path.
  // Using linear proportion of path distance over total.
  let rawScore = distPath / (distHealthy + distPath);
  if (isNaN(rawScore)) rawScore = 0.5;

  return {
    score: rawScore,
    predictedClass: predictedCluster === trainResult.healthyClusterIndex ? 'Normal' : 'Abnormal',
  };
}

export function getPlotData(trainResult) {
  return null;
}

export function processModel(patientId, sessionJson) {
  saveSession(patientId, sessionJson);
  const trainRes = trainModel(patientId);
  if (trainRes.error) return trainRes;
  return predictSession(sessionJson, trainRes);
}
