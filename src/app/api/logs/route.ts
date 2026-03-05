import { NextRequest, NextResponse } from "next/server";
import { db, ensureDB } from "@/db";
import { logs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function GET(req: NextRequest) {
  await ensureDB();
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");
  const limit = parseInt(searchParams.get("limit") ?? "200");

  const all = await db.select().from(logs);
  let filtered = all.sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
  );
  if (agentId) filtered = filtered.filter((l) => l.agentId === agentId);
  return NextResponse.json(filtered.slice(0, limit));
}

export async function POST(req: NextRequest) {
  await ensureDB();
  const body = await req.json();
  const { agentId, level, message, metadata } = body;

  if (!agentId || !message) {
    return NextResponse.json({ error: "agentId and message required" }, { status: 400 });
  }

  const log = {
    id: randomUUID(),
    agentId,
    level: level ?? "info",
    message,
    metadata: metadata ? JSON.stringify(metadata) : null,
    createdAt: new Date(),
  };

  await db.insert(logs).values(log);
  return NextResponse.json(log, { status: 201 });
}
