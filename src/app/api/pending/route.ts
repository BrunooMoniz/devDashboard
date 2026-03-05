import { NextResponse } from "next/server";
import { db, ensureDB } from "@/db";
import { tasks } from "@/db/schema";

export async function GET() {
  await ensureDB();
  const all = await db.select().from(tasks);
  const pending = all.filter(
    (t) => t.status === "waiting_approval" || t.status === "waiting_deploy"
  );
  return NextResponse.json({ count: pending.length, tasks: pending });
}
