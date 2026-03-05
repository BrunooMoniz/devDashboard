import { NextRequest, NextResponse } from "next/server";
import { ensureDB } from "@/db";
import { createClient } from "@libsql/client";
import path from "path";

function getClient() {
  const DB_DIR = path.join(process.cwd(), "data");
  const DB_URL = process.env.DB_URL ?? `file:${path.join(DB_DIR, "dashboard.db")}`;
  return createClient({ url: DB_URL });
}

// GET /api/agent-sessions — lista sessões activas por agente (da DB)
export async function GET(_request: NextRequest) {
  await ensureDB();
  const client = getClient();

  const result = await client.execute(
    `SELECT id, agent_id as agentId, session_key as sessionKey, status,
            created_at as createdAt, last_ping as lastPing
     FROM agent_sessions
     WHERE status = 'active'
     ORDER BY last_ping DESC`
  );

  return NextResponse.json({ sessions: result.rows });
}

// POST /api/agent-sessions — regista session_key para um agente
// Body: { agentId, sessionKey, status? }
export async function POST(request: NextRequest) {
  await ensureDB();
  const client = getClient();

  let body: { agentId: string; sessionKey: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { agentId, sessionKey, status = "active" } = body;
  if (!agentId || !sessionKey) {
    return NextResponse.json(
      { error: "agentId and sessionKey are required" },
      { status: 400 }
    );
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await client.execute({
    sql: `INSERT INTO agent_sessions (id, agent_id, session_key, status, created_at, last_ping)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            session_key = excluded.session_key,
            status = excluded.status,
            last_ping = excluded.last_ping`,
    args: [id, agentId, sessionKey, status, now, now],
  });

  return NextResponse.json({ id, agentId, sessionKey, status, createdAt: now });
}
