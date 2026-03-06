import { db, ensureDB } from "@/db";
import { agents, tasks, logs } from "@/db/schema";
import { desc } from "drizzle-orm";

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

      // Enviar estado inicial imediatamente
      const [allAgents, allTasks, recentLogs] = await Promise.all([
        db.select().from(agents),
        db.select().from(tasks),
        db.select().from(logs).orderBy(desc(logs.createdAt)).limit(50),
      ]);

      send("agents_update", allAgents);
      send("tasks_update", allTasks);
      send("log_entry", recentLogs);

      // Polling loop — emite actualizações a cada 1s
      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval);
          return;
        }
        try {
          const [updatedAgents, updatedTasks, latestLog] = await Promise.all([
            db.select().from(agents),
            db.select().from(tasks),
            db.select().from(logs).orderBy(desc(logs.createdAt)).limit(1),
          ]);

          send("agents_update", updatedAgents);
          send("tasks_update", updatedTasks);
          if (latestLog.length > 0) {
            send("log_entry", latestLog);
          }

          // Heartbeat para manter conexão viva
          send("ping", { ts: Date.now() });
        } catch {
          closed = true;
          clearInterval(interval);
          try { controller.close(); } catch {}
        }
      }, 1000);

      // Cleanup quando o cliente desliga
      return () => {
        closed = true;
        clearInterval(interval);
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
