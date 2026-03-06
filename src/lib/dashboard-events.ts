/**
 * dashboard-events.ts
 *
 * Barramento de eventos central para o SSE event-driven.
 *
 * ANTES (polling):
 *   O endpoint /api/stream fazia db.select() em agents, tasks e logs
 *   a cada 1 segundo via setInterval, independentemente de haver mudanças.
 *   Com N clientes conectados, isso gerava N × 3 queries/segundo no SQLite.
 *
 * DEPOIS (event-driven):
 *   As rotas de escrita (PATCH /api/tasks, PATCH /api/agents, POST /api/logs)
 *   emitem eventos neste barramento após cada mutação bem-sucedida.
 *   O endpoint /api/stream apenas escuta esses eventos e os encaminha para
 *   os clientes SSE conectados. Zero queries por segundo em idle.
 *
 * Uso nas rotas de escrita:
 *   import { dashboardEvents } from "@/lib/dashboard-events";
 *   dashboardEvents.emit("task_updated", updatedTask);
 *   dashboardEvents.emit("agent_updated", updatedAgent);
 *   dashboardEvents.emit("log_created", newLog);
 *
 * Uso no stream SSE:
 *   dashboardEvents.on("task_updated", (task) => send("task_update", task));
 */

import { EventEmitter } from "events";
import type { Task, Agent } from "@/lib/types";

// Tipos dos payloads de cada evento
export type DashboardEventMap = {
  task_updated: Task;
  task_created: Task;
  task_deleted: { id: string };
  agent_updated: Agent;
  log_created: {
    id: string;
    agentId: string;
    level: string;
    message: string;
    metadata: string | null;
    createdAt: string;
  };
};

class DashboardEventEmitter extends EventEmitter {
  emit<K extends keyof DashboardEventMap>(
    event: K,
    payload: DashboardEventMap[K]
  ): boolean {
    return super.emit(event, payload);
  }

  on<K extends keyof DashboardEventMap>(
    event: K,
    listener: (payload: DashboardEventMap[K]) => void
  ): this {
    return super.on(event, listener);
  }

  off<K extends keyof DashboardEventMap>(
    event: K,
    listener: (payload: DashboardEventMap[K]) => void
  ): this {
    return super.off(event, listener);
  }
}

// Singleton global — compartilhado entre todas as rotas no mesmo processo Node.js.
// Em Next.js (standalone), todas as rotas de API rodam no mesmo processo,
// portanto este singleton funciona corretamente.
// Para múltiplos processos (cluster/PM2), substituir por Redis Pub/Sub.
declare global {
  // eslint-disable-next-line no-var
  var __dashboardEvents: DashboardEventEmitter | undefined;
}

if (!global.__dashboardEvents) {
  const emitter = new DashboardEventEmitter();
  // Aumentar o limite padrão de listeners (default: 10).
  // Cada cliente SSE conectado adiciona ~3 listeners. 200 clientes = 600 listeners.
  emitter.setMaxListeners(500);
  global.__dashboardEvents = emitter;
}

export const dashboardEvents = global.__dashboardEvents;
