import { NextResponse } from "next/server";
import { db, ensureDB } from "@/db";
import { chatMessages } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET() {
  await ensureDB();
  const pending = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.direction, "user"), eq(chatMessages.read, 0)));

  return NextResponse.json(pending);
}
