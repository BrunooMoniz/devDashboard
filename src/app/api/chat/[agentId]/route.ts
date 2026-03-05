import { NextRequest, NextResponse } from "next/server";
import { ensureDB } from "@/db";
import { createClient } from "@libsql/client";
import path from "path";

// System prompts por agente
const SYSTEM_PROMPTS: Record<string, string> = {
  main: "És o Atlas, Orquestrador do time de desenvolvimento. Coordenas Iris, Orion, Pixel, Forge, Vega, Lyra e Argus. Directo, técnico, visão de conjunto. Responde sempre em português.",
  pm: "És a Iris, Product Manager. Analítica, focas em requisitos e clarificação. Fazes boas perguntas. Responde sempre em português.",
  architect: "És o Orion, Tech Lead e Arquitecto. Falas de arquitectura, trade-offs e decisões técnicas. Responde sempre em português.",
  frontend: "És o Pixel, Frontend Developer. Entusiasta de UI/UX, shadcn/ui, Tailwind, Next.js. Responde sempre em português.",
  backend: "És o Forge, Backend Developer. APIs, performance, segurança, bases de dados. Responde sempre em português.",
  devops: "És a Vega, DevOps Engineer. Docker, CI/CD, infra, uptime, monitorização. Responde sempre em português.",
  qa: "És a Lyra, QA Engineer. Edge cases, testes, bugs, validação. Responde sempre em português.",
  reviewer: "És o Argus, Code Reviewer. Padrões de código, boas práticas, pull requests. Responde sempre em português.",
};

function getClient() {
  const DB_DIR = path.join(process.cwd(), "data");
  const DB_URL = process.env.DB_URL ?? `file:${path.join(DB_DIR, "dashboard.db")}`;
  return createClient({ url: DB_URL });
}

// POST /api/chat/[agentId]
// Body: { message: string, history?: Array<{role, content}> }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  if (!gatewayUrl || !gatewayToken) {
    return NextResponse.json(
      { error: "Gateway not configured" },
      { status: 500 }
    );
  }

  let body: { message: string; history?: Array<{ role: string; content: string }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message, history = [] } = body;
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const systemPrompt =
    SYSTEM_PROMPTS[agentId] ??
    `És um agente de desenvolvimento chamado ${agentId}. Responde sempre em português.`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: message },
  ];

  // Persist user message to DB
  await ensureDB();
  const client = getClient();
  const now = Date.now();
  const userId = crypto.randomUUID();
  await client.execute({
    sql: "INSERT INTO chat_messages (id, agent_id, direction, content, read, created_at) VALUES (?, ?, 'user', ?, 0, ?)",
    args: [userId, agentId, message, now],
  });

  // Forward to OpenClaw gateway with streaming
  let gatewayResponse: Response;
  try {
    gatewayResponse = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gatewayToken}`,
      },
      body: JSON.stringify({
        model: `openclaw:${agentId}`,
        messages,
        stream: true,
        max_tokens: 1024,
      }),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Gateway unreachable", detail: String(err) },
      { status: 502 }
    );
  }

  if (!gatewayResponse.ok) {
    const errorText = await gatewayResponse.text();
    return NextResponse.json(
      { error: "Gateway error", detail: errorText },
      { status: gatewayResponse.status }
    );
  }

  // Stream SSE back to browser, accumulating full response for DB persistence
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Process stream in background
  (async () => {
    let fullContent = "";
    try {
      const reader = gatewayResponse.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // Forward raw SSE chunk to browser
        await writer.write(encoder.encode(chunk));

        // Extract content from SSE data lines for DB persistence
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const data = JSON.parse(line.slice(6));
              const delta = data?.choices?.[0]?.delta?.content;
              if (delta) fullContent += delta;
            } catch {
              // ignore parse errors in stream chunks
            }
          }
        }
      }
    } finally {
      await writer.close();

      // Persist assistant response to DB
      if (fullContent) {
        try {
          const assistantId = crypto.randomUUID();
          await client.execute({
            sql: "INSERT INTO chat_messages (id, agent_id, direction, content, read, created_at) VALUES (?, ?, 'assistant', ?, 0, ?)",
            args: [assistantId, agentId, fullContent, Date.now()],
          });
        } catch {
          // Non-fatal: log failure silently
        }
      }
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// GET /api/chat/[agentId]
// Returns last 20 messages for agentId, ordered by created_at asc
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  await ensureDB();
  const client = getClient();

  const result = await client.execute({
    sql: `SELECT id, agent_id as agentId, direction, content, read, created_at as createdAt
          FROM chat_messages
          WHERE agent_id = ?
          ORDER BY created_at DESC
          LIMIT 20`,
    args: [agentId],
  });

  // Return in chronological order (oldest first)
  const messages = [...result.rows].reverse();
  return NextResponse.json({ messages });
}
