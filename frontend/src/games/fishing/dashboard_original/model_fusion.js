import { processModel as processGrip } from './model1_grip.js';
import { processModel as processNeglect } from './model2_neglect.js';
import { processModel as processVisuomotor } from './model3_visuomotor.js';
import { processModel as processAttention } from './model4_attention.js';

export function fuseModels(patientId, sessionJson) {
  const resGrip = processGrip(patientId, sessionJson);
  const resNeglect = processNeglect(patientId, sessionJson);
  const resVisuomotor = processVisuomotor(patientId, sessionJson);
  const resAttention = processAttention(patientId, sessionJson);

  let fusionScore = 0;
  let validModels = 0;
  let totalWeight = 0;

  if (!resGrip.error && resGrip.score !== undefined) { fusionScore += resGrip.score * 0.25; totalWeight += 0.25; validModels++; }
  if (!resNeglect.error && resNeglect.score !== undefined) { fusionScore += resNeglect.score * 0.30; totalWeight += 0.30; validModels++; }
  if (!resVisuomotor.error && resVisuomotor.score !== undefined) { fusionScore += resVisuomotor.score * 0.30; totalWeight += 0.30; validModels++; }
  if (!resAttention.error && resAttention.score !== undefined) { fusionScore += resAttention.score * 0.15; totalWeight += 0.15; validModels++; }

  if (validModels === 0 || totalWeight === 0) {
    return { error: 'No models are trained yet.', globalScore: null };
  }

  fusionScore = fusionScore / totalWeight;

  let alertLevel = 'alert';
  if (fusionScore > 0.75) alertLevel = 'improving';
  else if (fusionScore >= 0.50) alertLevel = 'stable';
  else if (fusionScore >= 0.25) alertLevel = 'watch';

  return {
    patientId,
    sessionTimestamp: sessionJson.timestamp,
    globalScore: fusionScore,
    alertLevel: alertLevel,
    details: {
      grip: resGrip.error ? 'Training...' : resGrip.score,
      neglect: resNeglect.error ? 'Training...' : resNeglect.score,
      visuomotor: resVisuomotor.error ? 'Training...' : resVisuomotor.score,
      attention: resAttention.error ? 'Training...' : resAttention.score
    }
  };
}
