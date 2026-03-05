import { NextRequest, NextResponse } from "next/server";
import { db, ensureDB } from "@/db";
import { chatMessages } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; msgId: string }> }
) {
  await ensureDB();
  const { msgId } = await params;
  const body = await req.json();

  await db
    .update(chatMessages)
    .set({ ...(body.read !== undefined && { read: body.read }) })
    .where(eq(chatMessages.id, msgId));

  const updated = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.id, msgId));

  return NextResponse.json(updated[0] ?? { ok: true });
}
