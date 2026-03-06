import { NextRequest, NextResponse } from "next/server";
import { db, ensureDB } from "@/db";
import { tasks, taskComments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { dashboardEvents } from "@/lib/dashboard-events";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  await ensureDB();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const agentId: string = body.agentId ?? "moniz";
  const reason: string = body.reason ?? "Sem motivo especificado";

  const current = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!current[0]) return NextResponse.json({ error: "not found" }, { status: 404 });

  const now = new Date();

  await db.update(tasks).set({
    status: "cancelled",
    approvalReason: reason,
    updatedAt: now,
  }).where(eq(tasks.id, id));

  await db.insert(taskComments).values({
    id: randomUUID(),
    taskId: id,
    agentId,
    type: "rejection",
    content: `❌ Rejeitado: ${reason}`,
    metadata: JSON.stringify({ previousStatus: current[0].status, reason }),
    createdAt: now,
  });

  // Log status change
  await db.insert(taskComments).values({
    id: randomUUID(),
    taskId: id,
    agentId,
    type: "status_change",
    content: `Status: ${current[0].status} → cancelled`,
    metadata: JSON.stringify({ from: current[0].status, to: "cancelled" }),
    createdAt: now,
  });

  const updated = await db.select().from(tasks).where(eq(tasks.id, id));

  // Notificar clientes SSE conectados sobre a rejeição
  if (updated[0]) {
    dashboardEvents.emit("task_updated", updated[0] as any);
  }

  return NextResponse.json(updated[0]);
}
