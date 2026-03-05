import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export type TaskStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "review"
  | "qa"
  | "waiting_approval"
  | "waiting_deploy"
  | "deploy"
  | "done"
  | "cancelled";

export type Priority = "low" | "medium" | "high" | "critical";
export type AgentStatus = "idle" | "working" | "error" | "offline";
export type CommentType =
  | "comment"
  | "status_change"
  | "approval"
  | "rejection"
  | "assignment"
  | "architecture"
  | "review_cycle";

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("backlog"),
  parentId: text("parent_id"),
  assignedAgent: text("assigned_agent"),
  priority: text("priority").notNull().default("medium"),
  tags: text("tags").default("[]"), // JSON array
  architecture: text("architecture"), // written by architect
  reviewCycles: integer("review_cycles").notNull().default(0),
  approvalComment: text("approval_comment"),
  approvalType: text("approval_type"),
  approvalReason: text("approval_reason"),
  approvedBy: text("approved_by"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const taskComments = sqliteTable("task_comments", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  agentId: text("agent_id").notNull(),
  type: text("type").notNull().default("comment"),
  content: text("content").notNull(),
  metadata: text("metadata"), // JSON
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  emoji: text("emoji").default("🤖"),
  model: text("model").default("claude-sonnet-4-6"),
  status: text("status").notNull().default("idle"),
  currentTask: text("current_task"),
  lastSeen: integer("last_seen", { mode: "timestamp" }).notNull(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  direction: text("direction").notNull().default("user"), // "user" | "agent"
  content: text("content").notNull(),
  read: integer("read").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const logs = sqliteTable("logs", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  level: text("level").notNull().default("info"),
  message: text("message").notNull(),
  metadata: text("metadata"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
