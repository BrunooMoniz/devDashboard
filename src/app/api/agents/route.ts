import { NextRequest, NextResponse } from "next/server";
import { db, ensureDB } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  await ensureDB();
  const all = await db.select().from(agents);
  return NextResponse.json(all);
}

export async function PATCH(req: NextRequest) {
  await ensureDB();
  const body = await req.json();
  const { id, status, currentTask, name, emoji } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await db.update(agents).set({
    ...(status !== undefined && { status }),
    ...(currentTask !== undefined && { currentTask }),
    ...(name !== undefined && { name }),
    ...(emoji !== undefined && { emoji }),
    lastSeen: new Date(),
  }).where(eq(agents.id, id));

  const updated = await db.select().from(agents).where(eq(agents.id, id));
  return NextResponse.json(updated[0]);
}
