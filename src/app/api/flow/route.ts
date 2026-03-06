import { NextResponse } from "next/server";
import { db, ensureDB } from "@/db";
import { agents, tasks, logs } from "@/db/schema";
import { eq, or, desc } from "drizzle-orm";

export async function GET() {
  await ensureDB();

  const TWO_HOURS = 2 * 60 * 60 * 1000;

  const [allAgents, allTasks, recentLogs] = await Promise.all([
    db.select().from(agents),
    db.select().from(tasks),
    db.select().from(logs).orderBy(desc(logs.createdAt)).limit(100),
  ]);

  const now = Date.now();

  // ── Nodes ────────────────────────────────────────────────────────────────
  const nodes = allAgents.map((agent) => ({
    id: agent.id,
    label: agent.name,
    role: agent.role,
    emoji: agent.emoji ?? "🤖",
    status: agent.status ?? "idle",
    model: agent.model ?? "claude-sonnet-4-6",
    currentTask: agent.currentTask ?? null,
    lastSeen: agent.lastSeen,
  }));

  // ── Edges ────────────────────────────────────────────────────────────────
  // Mapa agentId → agente para lookup
  const agentMap = new Map(allAgents.map((a) => [a.id, a]));

  const getSource = (task: typeof allTasks[0]): string => {
    if (task.parentId) {
      const parent = allTasks.find((t) => t.id === task.parentId);
      if (parent?.assignedAgent && agentMap.has(parent.assignedAgent)) {
        return parent.assignedAgent;
      }
    }
    return "main";
  };

  const activeEdges = allTasks
    .filter((t) => t.status === "in_progress" && t.assignedAgent && t.assignedAgent !== getSource(t))
    .map((t, i) => ({
      id: `active-${i}`,
      source: getSource(t),
      target: t.assignedAgent!,
      label: t.title,
      taskId: t.id,
      priority: t.priority,
      type: "active" as const,
    }));

  // Tasks concluídas nas últimas 2h
  const recentEdges = allTasks
    .filter((t) => {
      if (t.status !== "done" || !t.assignedAgent) return false;
      if (t.assignedAgent === getSource(t)) return false;
      const updated = new Date(t.updatedAt).getTime();
      return now - updated < TWO_HOURS;
    })
    .map((t, i) => ({
      id: `recent-${i}`,
      source: getSource(t),
      target: t.assignedAgent!,
      label: t.title,
      taskId: t.id,
      priority: t.priority,
      type: "recent" as const,
      completedAt: t.updatedAt,
    }));

  // Tasks planeadas (todo ou backlog com assignedAgent)
  const plannedEdges = allTasks
    .filter((t) => (t.status === "todo" || t.status === "backlog") && t.assignedAgent && t.assignedAgent !== getSource(t))
    .map((t, i) => ({
      id: `planned-${i}`,
      source: getSource(t),
      target: t.assignedAgent!,
      label: t.title,
      taskId: t.id,
      priority: t.priority,
      type: "planned" as const,
    }));

  // Últimos logs por agente (para mostrar actividade recente)
  const agentActivity: Record<string, { level: string; message: string; time: string }> = {};
  const sortedLogs = [...recentLogs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  for (const log of sortedLogs) {
    if (!agentActivity[log.agentId]) {
      agentActivity[log.agentId] = {
        level: log.level,
        message: log.message,
        time: log.createdAt?.toISOString() ?? "",
      };
    }
  }

  return NextResponse.json({
    nodes,
    edges: [...activeEdges, ...recentEdges, ...plannedEdges],
    agentActivity,
    stats: {
      active: activeEdges.length,
      recent: recentEdges.length,
      planned: plannedEdges.length,
    },
  });
}
