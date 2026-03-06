import { NextRequest, NextResponse } from "next/server";
import { db, ensureDB } from "@/db";
import { tasks, taskComments } from "@/db/schema";
import { eq, isNull, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { dashboardEvents } from "@/lib/dashboard-events";

export async function GET(req: NextRequest) {
  await ensureDB();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const agentId = searchParams.get("agentId");
  const parentId = searchParams.get("parentId");
  const rootOnly = searchParams.get("rootOnly") === "true";

  let query = db.select().from(tasks);
  const all = await query;

  let filtered = all;
  if (status) filtered = filtered.filter((t) => t.status === status);
  if (agentId) filtered = filtered.filter((t) => t.assignedAgent === agentId);
  if (parentId) filtered = filtered.filter((t) => t.parentId === parentId);
  if (rootOnly) filtered = filtered.filter((t) => !t.parentId);

  const withStats = searchParams.get("withStats") === "true";
  if (withStats) {
    const pendingApprovals = all.filter((t) => t.status === "waiting_approval").length;
    return NextResponse.json({
      tasks: filtered,
      stats: {
        pendingApprovals,
        total: all.length,
      },
    });
  }

  return NextResponse.json(filtered);
}

export async function POST(req: NextRequest) {
  await ensureDB();
  const body = await req.json();
  const { title, description, status, assignedAgent, priority, parentId, tags, agentId } = body;

  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const now = new Date();
  const task = {
    id: randomUUID(),
    title,
    description: description ?? null,
    status: status ?? "backlog",
    parentId: parentId ?? null,
    assignedAgent: assignedAgent ?? null,
    priority: priority ?? "medium",
    tags: JSON.stringify(tags ?? []),
    architecture: null,
    reviewCycles: 0,
    approvalComment: null,
    approvalType: null,
    approvalReason: null,
    approvedBy: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(tasks).values(task);

  // Log creation
  if (agentId || assignedAgent) {
    await db.insert(taskComments).values({
      id: randomUUID(),
      taskId: task.id,
      agentId: agentId ?? "main",
      type: "comment",
      content: `Card criado: "${title}"`,
      metadata: null,
      createdAt: now,
    });
  }

  // Notificar clientes SSE conectados sobre a nova task
  dashboardEvents.emit("task_created", task as any);

  return NextResponse.json(task, { status: 201 });
}
