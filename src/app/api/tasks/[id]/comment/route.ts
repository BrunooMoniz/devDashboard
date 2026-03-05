import { NextRequest, NextResponse } from "next/server";
import { db, ensureDB } from "@/db";
import { taskComments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  await ensureDB();
  const { id: taskId } = await params;
  const body = await req.json();
  const { agentId, type, content, metadata } = body;

  if (!agentId || !content) {
    return NextResponse.json({ error: "agentId and content required" }, { status: 400 });
  }

  const comment = {
    id: randomUUID(),
    taskId,
    agentId,
    type: type ?? "comment",
    content,
    metadata: metadata ? JSON.stringify(metadata) : null,
    createdAt: new Date(),
  };

  await db.insert(taskComments).values(comment);
  return NextResponse.json(comment, { status: 201 });
}

export async function GET(_req: NextRequest, { params }: Params) {
  await ensureDB();
  const { id: taskId } = await params;
  const comments = await db
    .select()
    .from(taskComments)
    .where(eq(taskComments.taskId, taskId));
  return NextResponse.json(comments);
}
