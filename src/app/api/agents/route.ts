import { NextRequest, NextResponse } from "next/server";
import { db, ensureDB } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  await ensureDB();
  const all = await db.select().from(agents);

  // Add virtual "moniz" agent if not already in DB
  const hasMoniz = all.some((a) => a.id === "moniz");
  if (!hasMoniz) {
    const monizAgent = {
      id: "moniz",
      name: "Moniz",
      role: "Product Owner",
      emoji: "👤",
      status: "active" as const,
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
  return NextResponse.json(updated[0]);
}
