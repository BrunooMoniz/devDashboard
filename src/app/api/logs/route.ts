import { NextRequest, NextResponse } from "next/server";
import { db, ensureDB } from "@/db";
import { logs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req: NextRequest) {
  await ensureDB();
  const { searchParams } = new URL(req.url);

  const agentId = searchParams.get("agentId");
  const level = searchParams.get("level");
  const withMeta = searchParams.get("withMeta") === "true";

  const rawLimit = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT));
  const limit = Math.min(isNaN(rawLimit) ? DEFAULT_LIMIT : rawLimit, MAX_LIMIT);

  const rawOffset = parseInt(searchParams.get("offset") ?? "0");
  const offset = isNaN(rawOffset) ? 0 : rawOffset;

  // Fetch all matching logs (DB-side sort)
  let all = await db.select().from(logs).orderBy(desc(logs.createdAt));

  // Filter in-memory (SQLite via libsql — simple enough for now)
  if (agentId) all = all.filter((l) => l.agentId === agentId);
  if (level) all = all.filter((l) => l.level === level);

  const total = all.length;
  const sliced = all.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  if (withMeta) {
    return NextResponse.json({ logs: sliced, total, hasMore });
  }

  return NextResponse.json(sliced);
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
