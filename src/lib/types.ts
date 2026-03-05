export type TaskStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "review"
  | "qa"
  | "waiting_approval"
  | "waiting_deploy"
  | "done";

export type Priority = "low" | "medium" | "high" | "critical";
export type CommentType =
  | "comment"
  | "status_change"
  | "approval"
  | "rejection"
  | "assignment"
  | "architecture"
  | "review_cycle";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  parentId: string | null;
  assignedAgent: string | null;
  priority: Priority;
  tags: string; // JSON string
  architecture: string | null;
  reviewCycles: number;
  approvalComment: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskDetail = Task & {
  subTasks: Task[];
  timeline: TaskComment[];
};

export type TaskComment = {
  id: string;
  taskId: string;
  agentId: string;
  type: CommentType;
  content: string;
  metadata: string | null;
  createdAt: string;
};

export type Agent = {
  id: string;
  name: string;
  role: string;
  emoji: string | null;
  model: string | null;
  status: "idle" | "working" | "error" | "offline";
  currentTask: string | null;
  lastSeen: string;
};

export const COLUMNS: { key: TaskStatus; label: string; color: string }[] = [
  { key: "backlog", label: "Backlog", color: "bg-slate-100 dark:bg-slate-800" },
  { key: "todo", label: "To Do", color: "bg-blue-50 dark:bg-blue-950" },
  { key: "in_progress", label: "Em Progresso", color: "bg-yellow-50 dark:bg-yellow-950" },
  { key: "review", label: "Revisão", color: "bg-purple-50 dark:bg-purple-950" },
  { key: "qa", label: "QA", color: "bg-orange-50 dark:bg-orange-950" },
  { key: "waiting_approval", label: "Aguardando Aprovação", color: "bg-red-50 dark:bg-red-950" },
  { key: "waiting_deploy", label: "Deploy", color: "bg-indigo-50 dark:bg-indigo-950" },
  { key: "done", label: "Concluído", color: "bg-green-50 dark:bg-green-950" },
];

export const PRIORITY_VARIANTS: Record<Priority, string> = {
  low: "secondary",
  medium: "outline",
  high: "default",
  critical: "destructive",
};

export const AGENT_INFO: Record<string, { emoji: string; color: string }> = {
  main: { emoji: "🧠", color: "text-violet-600" },
  pm: { emoji: "📋", color: "text-blue-600" },
  architect: { emoji: "🏗️", color: "text-amber-600" },
  frontend: { emoji: "🎨", color: "text-pink-600" },
  backend: { emoji: "⚙️", color: "text-slate-600" },
  devops: { emoji: "🚀", color: "text-emerald-600" },
  qa: { emoji: "🔍", color: "text-orange-600" },
  reviewer: { emoji: "👁️", color: "text-indigo-600" },
};

export function getTags(raw: string | null): string[] {
  try {
    return JSON.parse(raw ?? "[]");
  } catch {
    return [];
  }
}

export function timeAgo(dateStr: string | null) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}m atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  return `${Math.floor(hrs / 24)}d atrás`;
}
