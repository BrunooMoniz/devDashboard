import { NextRequest, NextResponse } from "next/server";
import { db, ensureDB } from "@/db";
import { chatMessages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDB();
  const { id } = await params;
  const all = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.agentId, id));

  const sorted = all.sort(
    (a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
  );
  return NextResponse.json(sorted);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDB();
  const { id } = await params;
  const body = await req.json();
  const { content, direction } = body;

  if (!content?.trim()) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }

  const msg = {
    id: randomUUID(),
    agentId: id,
    direction: direction ?? "user",
    content: content.trim(),
    read: 0,
    createdAt: new Date().toISOString(),
  };

  await db.insert(chatMessages).values(msg);
  return NextResponse.json(msg, { status: 201 });
}
