import { NextRequest, NextResponse } from "next/server";
import { db, ensureDB } from "@/db";
import { logs } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
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
  const limit = Math.max(1, Math.min(isNaN(rawLimit) ? DEFAULT_LIMIT : rawLimit, MAX_LIMIT));

  const rawOffset = parseInt(searchParams.get("offset") ?? "0");
  const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);

  // Build DB-side filters
  const conditions = [];
  if (agentId) conditions.push(eq(logs.agentId, agentId));
  if (level) conditions.push(eq(logs.level, level));

  const all = await db.select().from(logs)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(logs.createdAt))
    .limit(limit)
    .offset(offset);

  // For total/hasMore, count without pagination
  const allForCount = await db.select().from(logs)
    .where(conditions.length ? and(...conditions) : undefined);
  const total = allForCount.length;
  const hasMore = offset + limit < total;

  if (withMeta) {
    return NextResponse.json({ logs: all, total, hasMore });
  }

  return NextResponse.json(all);
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
