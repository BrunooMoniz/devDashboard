import { NextResponse } from "next/server";
import { db, ensureDB } from "@/db";
import { agents, tasks } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  await ensureDB();

  // Fetch all agents and in-progress tasks in parallel
  const [allAgents, inProgressTasks] = await Promise.all([
    db.select().from(agents),
    db.select().from(tasks).where(eq(tasks.status, "in_progress")),
  ]);

  // Build a map of agentId -> agent for quick lookup
  const agentMap = new Map(allAgents.map((a) => [a.id, a]));

  // Build nodes from agents
  const nodes = allAgents.map((agent) => ({
    id: agent.id,
    label: agent.name,
    role: agent.role,
    emoji: agent.emoji ?? "🤖",
    status: agent.status,
    model: agent.model ?? "claude-sonnet-4-6",
  }));

  // Build edges from in-progress tasks that have an assignedAgent
  const edges = inProgressTasks
    .filter((task) => task.assignedAgent)
    .map((task, index) => {
      // If task has a parentId, find the parent task's assignedAgent as source
      let source = "main"; // default source is the orchestrator
      if (task.parentId) {
        const parentTask = inProgressTasks.find((t) => t.id === task.parentId);
        if (parentTask?.assignedAgent && agentMap.has(parentTask.assignedAgent)) {
          source = parentTask.assignedAgent;
        }
      }

      return {
        id: `edge-${index + 1}`,
        source,
        target: task.assignedAgent!,
        label: task.title,
        taskId: task.id,
        status: task.status,
        priority: task.priority,
      };
    });

  return NextResponse.json({ nodes, edges });
}
