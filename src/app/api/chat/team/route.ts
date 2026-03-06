import { NextRequest, NextResponse } from "next/server";
import { ensureDB } from "@/db";

// Personalidades + domínios de cada agente
const AGENTS: Record<string, { name: string; emoji: string; role: string; domain: string; systemPrompt: string }> = {
  pm: {
    name: "Iris",
    emoji: "📋",
    role: "Product Manager",
    domain: "requisitos, features, priorização, backlog, user stories, roadmap, produto",
    systemPrompt: "És a Iris, Product Manager. Analítica, focas em requisitos, clarificação e priorização. Responde sempre em português.",
  },
  architect: {
    name: "Orion",
    emoji: "🏗️",
    role: "Tech Lead",
    domain: "arquitectura, design de sistema, trade-offs técnicos, padrões, stack, decisões de engenharia",
    systemPrompt: "És o Orion, Tech Lead e Arquitecto. Falas de arquitectura, trade-offs e decisões técnicas. Responde sempre em português.",
  },
  frontend: {
    name: "Pixel",
    emoji: "🎨",
    role: "Frontend Dev",
    domain: "UI, UX, design, componentes, React, Next.js, shadcn, Tailwind, CSS, animações, acessibilidade, interface, layout, visualização",
    systemPrompt: "És o Pixel, Frontend Developer. Entusiasta de UI/UX, shadcn/ui, Tailwind, Next.js 15, React. Responde sempre em português.",
  },
  backend: {
    name: "Forge",
    emoji: "⚙️",
    role: "Backend Dev",
    domain: "API, base de dados, SQL, ORM, autenticação, servidor, performance backend, endpoints, schema, migrations",
    systemPrompt: "És o Forge, Backend Developer. APIs, performance, segurança, bases de dados. Responde sempre em português.",
  },
  devops: {
    name: "Vega",
    emoji: "🚀",
    role: "DevOps",
    domain: "deploy, Docker, CI/CD, infra, VPS, Caddy, nginx, containers, servidores, uptime, monitoring, SSL",
    systemPrompt: "És a Vega, DevOps Engineer. Docker, CI/CD, infra, uptime, monitorização. Responde sempre em português.",
  },
  qa: {
    name: "Lyra",
    emoji: "🔍",
    role: "QA Engineer",
    domain: "testes, bugs, edge cases, validação, qualidade, erros, crashes, comportamento inesperado",
    systemPrompt: "És a Lyra, QA Engineer. Edge cases, testes, bugs, validação. Responde sempre em português.",
  },
  reviewer: {
    name: "Argus",
    emoji: "👁️",
    role: "Code Reviewer",
    domain: "revisão de código, code review, padrões, boas práticas, clean code, refactoring, pull requests",
    systemPrompt: "És o Argus, Code Reviewer. Padrões de código, boas práticas, pull requests. Responde sempre em português.",
  },
};

const SKIP_TOKEN = "__SKIP__";

// POST /api/chat/team
// Body: { message: string; history?: Array<{agentId, role, content}> }
export async function POST(request: NextRequest) {
  await ensureDB();

  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  if (!gatewayUrl || !gatewayToken) {
    return NextResponse.json({ error: "Gateway not configured" }, { status: 500 });
  }

  let body: { message: string; history?: Array<{ agentId?: string; role: string; content: string }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message, history = [] } = body;
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Formata histórico para contexto (últimas 10 mensagens)
  const recentHistory = history.slice(-10);
  const historyText = recentHistory
    .map(m => {
      const who = m.agentId ? (AGENTS[m.agentId]?.name ?? m.agentId) : "Moniz";
      return `${who}: ${m.content}`;
    })
    .join("\n");

  // SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      // Track se algum agente respondeu (para fallback do Atlas)
      let hasResponded = false;

      // Chama todos os agentes em paralelo
      const agentPromises = Object.entries(AGENTS).map(async ([agentId, agent]) => {
        const relevanceInstruction = `Estás num chat de grupo com o time inteiro e com Moniz (o Product Owner).
O teu domínio é: ${agent.domain}.

REGRA CRÍTICA: Analisa a conversa e decide se deves responder.
- Se o tópico está dentro do teu domínio → responde de forma útil e concisa (máx. 3 frases)
- Se o tópico não tem nada a ver contigo → responde APENAS com: ${SKIP_TOKEN}
- Se a discussão toca indirectamente no teu domínio → podes adicionar uma perspectiva breve
- Nunca respondas só para "marcar presença" — só fala se tens algo genuinamente útil

${historyText ? `Histórico recente:\n${historyText}\n` : ""}
Nova mensagem de Moniz: ${message}`;

        const messages = [
          { role: "system", content: agent.systemPrompt },
          { role: "user", content: relevanceInstruction },
        ];

        try {
          const res = await fetch(`${gatewayUrl}/v1/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${gatewayToken}`,
            },
            body: JSON.stringify({
              model: agentId === "architect" ? "claude-sonnet-4-6" : "claude-haiku-4-5",
              messages,
              max_tokens: 300,
              stream: false,
            }),
          });

          if (!res.ok) return;
          const data = await res.json();
          const content: string = data.choices?.[0]?.message?.content ?? "";

          if (!content || content.trim() === SKIP_TOKEN || content.includes(SKIP_TOKEN)) return;

          // Emite resposta deste agente
          hasResponded = true;
          send({
            agentId,
            name: agent.name,
            emoji: agent.emoji,
            role: agent.role,
            content: content.trim(),
          });
        } catch {
          // Agente falhou — silencioso
        }
      });

      await Promise.all(agentPromises);

      // Fallback: se nenhum agente respondeu, Atlas responde sempre
      if (!hasResponded) {
        try {
          const atlasMessages = [
            {
              role: "system",
              content: "És o Atlas, Orquestrador do time de desenvolvimento. Responde de forma concisa e útil em português.",
            },
            {
              role: "user",
              content: `${historyText ? `Histórico:\n${historyText}\n\n` : ""}Moniz diz: ${message}`,
            },
          ];
          const res = await fetch(`${gatewayUrl}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${gatewayToken}` },
            body: JSON.stringify({ model: "openclaw:main", messages: atlasMessages, max_tokens: 300, stream: false }),
          });
          if (res.ok) {
            const data = await res.json();
            const content: string = data.choices?.[0]?.message?.content ?? "";
            if (content && !content.includes(SKIP_TOKEN)) {
              send({ agentId: "main", name: "Atlas", emoji: "🧠", role: "Orchestrator", content: content.trim() });
            }
          }
        } catch {
          // Silencioso
        }
      }

      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
