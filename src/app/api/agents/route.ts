import { NextRequest, NextResponse } from "next/server";
import { db, ensureDB } from "@/db";
import { agents } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { dashboardEvents } from "@/lib/dashboard-events";

const GHOST_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutos

export async function GET() {
  await ensureDB();
  const all = await db.select().from(agents);

  // Auto-reset ghost "working" agents (lastSeen > 30 min ago) — batch update
  const now = Date.now();
  const ghostIds = all
    .filter((agent) => agent.status === "working" && agent.lastSeen &&
      now - new Date(agent.lastSeen).getTime() > GHOST_THRESHOLD_MS)
    .map((agent) => agent.id);

  if (ghostIds.length > 0) {
    await db.update(agents)
      .set({ status: "idle", currentTask: null })
      .where(inArray(agents.id, ghostIds));
    for (const agent of all) {
      if (ghostIds.includes(agent.id)) {
        agent.status = "idle";
        agent.currentTask = null;
        // Notificar SSE sobre cada agente resetado
        dashboardEvents.emit("agent_updated", agent as any);
      }
    }
  }

  // Add virtual "moniz" agent if not already in DB
  const hasMoniz = all.some((a) => a.id === "moniz");
  if (!hasMoniz) {
    const monizAgent = {
      id: "moniz",
      name: "Moniz",
      role: "Product Owner",
      emoji: "👤",
      status: "idle" as const,
      model: "human",
      currentTask: null,
      lastSeen: new Date(),
    };
    return NextResponse.json([...all, monizAgent]);
  }

  return NextResponse.json(all);
}

export async function PATCH(req: NextRequest) {
  await ensureDB();
  const body = await req.json();
  const { id, status, currentTask, name, emoji, model } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await db.update(agents).set({
    ...(status !== undefined && { status }),
    ...(currentTask !== undefined && { currentTask }),
    ...(name !== undefined && { name }),
    ...(emoji !== undefined && { emoji }),
    ...(model !== undefined && { model }),
    lastSeen: new Date(),
  }).where(eq(agents.id, id));

  const updated = await db.select().from(agents).where(eq(agents.id, id));

  // Notificar clientes SSE conectados sobre o agente atualizado
  if (updated[0]) {
    dashboardEvents.emit("agent_updated", updated[0] as any);
  }

  return NextResponse.json(updated[0]);
}
