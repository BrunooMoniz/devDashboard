import { NextRequest, NextResponse } from "next/server";
import { db, ensureDB } from "@/db";
import { tasks, taskComments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { dashboardEvents } from "@/lib/dashboard-events";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  await ensureDB();
  const { id } = await params;

  const task = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!task[0]) return NextResponse.json({ error: "not found" }, { status: 404 });

  const subTasks = await db.select().from(tasks).where(eq(tasks.parentId, id));
  const timeline = await db
    .select()
    .from(taskComments)
    .where(eq(taskComments.taskId, id));

  return NextResponse.json({ ...task[0], subTasks, timeline });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  await ensureDB();
  const { id } = await params;
  const body = await req.json();
  const {
    title, description, status, assignedAgent, priority,
    tags, architecture, reviewCycles, approvalComment, agentId, comment,
  } = body;

  // Get current task for comparison
  const current = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!current[0]) return NextResponse.json({ error: "not found" }, { status: 404 });

  const now = new Date();
  await db.update(tasks).set({
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(status !== undefined && { status }),
    ...(assignedAgent !== undefined && { assignedAgent }),
    ...(priority !== undefined && { priority }),
    ...(tags !== undefined && {
      // Normalizar tags: aceita array ou string JSON, sempre guarda como JSON array
      tags: JSON.stringify(Array.isArray(tags) ? tags : (() => {
        try { const p = JSON.parse(tags); return Array.isArray(p) ? p : []; } catch { return []; }
      })()),
    }),
    ...(architecture !== undefined && { architecture }),
    ...(reviewCycles !== undefined && { reviewCycles }),
    ...(approvalComment !== undefined && { approvalComment }),
    updatedAt: now,
  }).where(eq(tasks.id, id));

  // Auto-log status changes
  if (status && status !== current[0].status) {
    await db.insert(taskComments).values({
      id: randomUUID(),
      taskId: id,
      agentId: agentId ?? "main",
      type: "status_change",
      content: `Status: ${current[0].status} → ${status}`,
      metadata: JSON.stringify({ from: current[0].status, to: status }),
      createdAt: now,
    });
  }

  // Auto-log assignment changes
  if (assignedAgent !== undefined && assignedAgent !== current[0].assignedAgent) {
    await db.insert(taskComments).values({
      id: randomUUID(),
      taskId: id,
      agentId: agentId ?? "main",
      type: "assignment",
      content: `Atribuído para: ${assignedAgent ?? "ninguém"}`,
      metadata: null,
      createdAt: now,
    });
  }

  // Extra comment
  if (comment) {
    await db.insert(taskComments).values({
      id: randomUUID(),
      taskId: id,
      agentId: agentId ?? "main",
      type: "comment",
      content: comment,
      metadata: null,
      createdAt: now,
    });
  }

  const updated = await db.select().from(tasks).where(eq(tasks.id, id));

  // Notificar clientes SSE conectados sobre a task atualizada
  dashboardEvents.emit("task_updated", updated[0] as any);

  return NextResponse.json(updated[0]);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  await ensureDB();
  const { id } = await params;
  await db.delete(taskComments).where(eq(taskComments.taskId, id));
  await db.delete(tasks).where(eq(tasks.id, id));

  // Notificar clientes SSE conectados sobre a remoção
  dashboardEvents.emit("task_deleted", { id });

  return NextResponse.json({ ok: true });
}
