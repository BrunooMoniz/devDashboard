/**
 * GET /api/stream — SSE endpoint (event-driven)
 *
 * Mudança arquitetural: de polling-no-banco para event-driven via EventEmitter.
 *
 * ANTES: setInterval de 1s fazia 3 queries ao SQLite por cliente conectado.
 *        Com 10 clientes → 30 queries/s. Com 50 → 150 queries/s. CPU explode.
 *
 * DEPOIS: O stream envia o estado inicial ao conectar (1 query por conexão)
 *         e depois fica em idle. Só envia dados quando uma rota de escrita
 *         emite um evento via dashboardEvents. Zero queries em idle.
 *
 * Eventos suportados:
 *   - task_update   → emitido por PATCH/POST/DELETE /api/tasks
 *   - agent_update  → emitido por PATCH /api/agents
 *   - log_entry     → emitido por POST /api/logs
 *   - ping          → keepalive a cada 30s (era 1s antes)
 */

import { db, ensureDB } from "@/db";
import { agents, tasks, logs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { dashboardEvents } from "@/lib/dashboard-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await ensureDB();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      // ── 1. Estado inicial: uma única rodada de queries ao conectar ─────────
      // Enviamos o snapshot completo apenas uma vez, na conexão.
      // Depois, apenas deltas via eventos.
      const [allAgents, allTasks, recentLogs] = await Promise.all([
        db.select().from(agents),
        db.select().from(tasks),
        db.select().from(logs).orderBy(desc(logs.createdAt)).limit(50),
      ]);

      send("agents_update", allAgents);
      send("tasks_update", allTasks);
      send("log_entry", recentLogs);

      // ── 2. Listeners de eventos — recebem apenas deltas ───────────────────
      // Cada evento carrega apenas o objeto que mudou (task, agent ou log),
      // não o estado completo. O frontend deve fazer merge local.

      const onTaskUpdated = (task: unknown) => send("task_update", task);
      const onTaskCreated = (task: unknown) => send("task_update", task);
      const onTaskDeleted = (payload: unknown) => send("task_delete", payload);
      const onAgentUpdated = (agent: unknown) => send("agent_update", agent);
      const onLogCreated = (log: unknown) => send("log_entry", [log]);

      dashboardEvents.on("task_updated", onTaskUpdated);
      dashboardEvents.on("task_created", onTaskCreated);
      dashboardEvents.on("task_deleted", onTaskDeleted);
      dashboardEvents.on("agent_updated", onAgentUpdated);
      dashboardEvents.on("log_created", onLogCreated);

      // ── 3. Keepalive: ping a cada 30s (era 1s antes) ─────────────────────
      // Proxies e load balancers fecham conexões idle. 30s é suficiente para
      // manter a conexão viva sem desperdiçar recursos.
      const pingInterval = setInterval(() => {
        send("ping", { ts: Date.now() });
      }, 30_000);

      // ── 4. Cleanup ao desconectar ─────────────────────────────────────────
      return () => {
        closed = true;
        clearInterval(pingInterval);
        dashboardEvents.off("task_updated", onTaskUpdated);
        dashboardEvents.off("task_created", onTaskCreated);
        dashboardEvents.off("task_deleted", onTaskDeleted);
        dashboardEvents.off("agent_updated", onAgentUpdated);
        dashboardEvents.off("log_created", onLogCreated);
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Caddy/nginx: desactiva buffering
    },
  });
}
