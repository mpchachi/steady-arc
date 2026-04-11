import { DynamoDBClient, PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb"
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb"

const db = new DynamoDBClient({ region: "us-east-1" }) // cambia si usáis otra región
const TABLE = "neuro-sessions"

export const handler = async (event) => {
  const method = event.requestContext?.http?.method ?? event.httpMethod

  // ── CORS headers ──────────────────────────────────────────────────────────
  const headers = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }

  if (method === "OPTIONS") {
    return { statusCode: 200, headers, body: "" }
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
