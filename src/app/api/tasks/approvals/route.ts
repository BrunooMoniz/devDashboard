import { NextResponse } from "next/server";
import { db, ensureDB } from "@/db";
import { tasks } from "@/db/schema";

export async function GET() {
  await ensureDB();

  const all = await db.select().from(tasks);

  // Filter: status "waiting_approval" or "review" AND approvalType != null
  const pendingApprovals = all
    .filter(
      (t) =>
        (t.status === "waiting_approval" || t.status === "review") &&
        t.approvalType != null
    )
    .sort(
      (a, b) =>
        (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0)
    );

  return NextResponse.json(pendingApprovals);
}
