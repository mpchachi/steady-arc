import { DynamoDBClient, PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb"
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb"
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime"

const db      = new DynamoDBClient({ region: "eu-central-1" })
const bedrock = new BedrockRuntimeClient({ region: "eu-central-1" })
const TABLE   = "neuro-sessions"

const headers = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

function buildPrompt(body) {
  const { session_id, session_number, total_sessions, metrics, radar, alert_level, risk_score, domains } = body
  return `You are a clinical neurologist assistant. Write a concise, professional yet accessible clinical report for a stroke rehabilitation session. The report will be read by the treating physician.

SESSION: ${session_id} (${session_number} of ${total_sessions} total)
RISK SCORE: ${(risk_score * 100).toFixed(0)}/100 — Alert level: ${alert_level.toUpperCase()}

DOMAIN STATUS:
- Grip strength: ${domains.grip} (Radar: ${radar.Grip}/150)
- Hemispatial neglect: ${domains.neglect} (Neglect index: ${metrics.neglect_index?.toFixed(2)}, Radar: ${radar.Neglect}/150)
- Visuomotor coordination: ${domains.visuomotor} (RT gaze→grip: ${metrics.RT_gaze_to_grip}ms, Wrist MT: ${metrics.wrist_MT}ms, Radar: ${radar.Visuomotor}/150)
- Sustained attention: ${domains.attention} (Mean: ${metrics.attention_mean?.toFixed(2)}, Radar: ${radar.Attention}/150)

KEY METRICS:
- Grip MVC: ${metrics.grip_MVC?.toFixed(1)} N | Release time: ${metrics.grip_release_time} ms
- EMG co-contraction ratio: ${metrics.emg_cocontraction_ratio?.toFixed(2)}
- Left RT: ${metrics.left_RT} ms | Right RT: ${metrics.right_RT} ms | Asymmetry: ${Math.abs((metrics.left_RT || 0) - (metrics.right_RT || 0))} ms
- Wrist SPARC smoothness: ${metrics.wrist_SPARC?.toFixed(2)}

Write the report in this structure (use plain text, no markdown):
1. CLINICAL SUMMARY (2-3 sentences, accessible language for physician + family)
2. DOMAIN ANALYSIS (one short paragraph per domain with clinical interpretation)
3. RECOMMENDATIONS (2-4 bullet points, concrete and actionable)

Keep the total under 350 words. Be direct and clinically precise.`
}

export const handler = async (event) => {
  const method = event.requestContext?.http?.method ?? event.httpMethod
  const path   = event.rawPath ?? event.path ?? "/"

  if (method === "OPTIONS") {
    return { statusCode: 200, headers, body: "" }
  }

  // ── POST /report — Bedrock clinical report ────────────────────────────────
  if (method === "POST" && path === "/report") {
    const body = JSON.parse(event.body ?? "{}")

    const bedrockResponse = await bedrock.send(new InvokeModelCommand({
      modelId:     "eu.amazon.nova-lite-v1:0",
      contentType: "application/json",
      accept:      "application/json",
      body: JSON.stringify({
        messages: [{ role: "user", content: [{ text: buildPrompt(body) }] }],
        inferenceConfig: { maxTokens: 1024 },
      }),
    }))

    const parsed = JSON.parse(new TextDecoder().decode(bedrockResponse.body))
    const report = parsed.output.message.content[0].text

    return { statusCode: 200, headers, body: JSON.stringify({ report }) }
  }

  // ── POST /session — guardar sesión ────────────────────────────────────────
  if (method === "POST") {
    const body = JSON.parse(event.body ?? "{}")
    if (!body.patient_id || !body.session_id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Faltan patient_id o session_id" }) }
    }
    await db.send(new PutItemCommand({
      TableName: TABLE,
      Item: marshall(body, { removeUndefinedValues: true }),
    }))
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
  }

  // ── GET /session?patient_id=P001 — historial ──────────────────────────────
  if (method === "GET") {
    const patientId = event.queryStringParameters?.patient_id
    if (!patientId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Falta patient_id" }) }
    }
    const result = await db.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "patient_id = :pid",
      ExpressionAttributeValues: marshall({ ":pid": patientId }),
    }))
    const items = (result.Items ?? []).map(i => unmarshall(i))
    return { statusCode: 200, headers, body: JSON.stringify(items) }
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) }
}
