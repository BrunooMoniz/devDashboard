"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, AlertCircle, GripVertical, X, Clock } from "lucide-react";
import {
  Task, TaskStatus, COLUMNS, PRIORITY_VARIANTS, PRIORITY_ICONS, AGENT_INFO, getTags, timeAgo,
  Agent,
} from "@/lib/types";
import { CreateCardModal } from "./create-card-modal";
import { CardDetailModal } from "./card-detail-modal";

// ─── Mini progress bar ───────────────────────────────────────────────────────
function miniProgressBar(done: number, total: number): string {
  if (total === 0) return "";
  const filled = Math.round((done / total) * 3);
  return "▓".repeat(filled) + "░".repeat(3 - filled);
}

// ─── Draggable Card ─────────────────────────────────────────────────────────

function KanbanCard({
  task,
  onClick,
  overlay = false,
  agents = [],
  subTaskTotal = 0,
  subTaskDone = 0,
}: {
  task: Task;
  onClick: () => void;
  overlay?: boolean;
  agents?: Agent[];
  subTaskTotal?: number;
  subTaskDone?: number;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.35 : 1,
    cursor: overlay ? "grabbing" : "grab",
  };

  const tags = getTags(task.tags);
  const isApprovalCard = task.status === "waiting_approval" || !!task.approvalType;
  const agentInfo = task.assignedAgent ? agents.find(a => a.id === task.assignedAgent) : null;
  const agentEmoji = task.assignedAgent
    ? (AGENT_INFO[task.assignedAgent]?.emoji ?? "🤖")
    : null;
  const agentName = agentInfo?.name ?? task.assignedAgent;

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={overlay ? { cursor: "grabbing" } : style}
      className={`
        bg-background rounded-lg border p-3 space-y-2 select-none
        hover:shadow-md transition-all
        ${isApprovalCard ? "border-yellow-400 border-2" : "hover:border-primary/40"}
        ${overlay ? "shadow-xl rotate-1 opacity-95" : ""}
      `}
    >
      {/* Approval badge */}
      {isApprovalCard && (
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-semibold text-yellow-700 bg-yellow-100 border border-yellow-300 rounded px-1.5 py-0.5">
            ⏳ Aprovação
          </span>
        </div>
      )}

      {/* Drag handle + title */}
      <div className="flex items-start gap-1.5">
        {!overlay && (
          <div
            {...listeners}
            {...attributes}
            className="text-muted-foreground/40 hover:text-muted-foreground mt-0.5 shrink-0 cursor-grab active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>
        )}
        <p
          className="text-sm font-medium leading-snug flex-1 cursor-pointer"
          onClick={onClick}
        >
          {task.title}
        </p>
      </div>

      {task.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 pl-5">
          {task.description}
        </p>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-5">
          {tags.slice(0, 3).map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px] px-1 py-0">
              {t}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pl-5">
        <div className="flex items-center gap-1">
          <span className="text-sm">{PRIORITY_ICONS[task.priority] ?? ""}</span>
          <Badge
            variant={PRIORITY_VARIANTS[task.priority] as any}
            className="text-[10px] px-1.5 py-0"
          >
            {task.priority}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {task.reviewCycles > 0 && (
            <span className="text-[10px] text-muted-foreground">🔄{task.reviewCycles}</span>
          )}
          {agentEmoji ? (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5" title={agentName ?? ""}>
              <span className="text-sm">{agentEmoji}</span>
              <span>{agentName}</span>
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">sem dono</span>
          )}
        </div>
      </div>

      {/* Sub-tasks count + progress */}
      {subTaskTotal > 0 && (
        <div className="flex items-center gap-2 pl-5 text-[10px] text-muted-foreground">
          <span>📎 {subTaskTotal}</span>
          <span className="font-mono tracking-tighter">
            {miniProgressBar(subTaskDone, subTaskTotal)} {subTaskDone}/{subTaskTotal}
          </span>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground pl-5">{timeAgo(task.updatedAt)}</p>
    </div>
  );
}

// ─── Droppable Column ────────────────────────────────────────────────────────

function KanbanColumn({
  col,
  tasks,
  onCardClick,
  agents,
  subTaskMap,
}: {
  col: (typeof COLUMNS)[number];
  tasks: Task[];
  onCardClick: (id: string) => void;
  agents: Agent[];
  subTaskMap: Record<string, { total: number; done: number }>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  const isApproval = col.key === "waiting_approval" || col.key === "waiting_deploy";

  return (
    <div
      className={`
        flex-shrink-0 w-64 rounded-xl ${col.color} p-3 space-y-2 transition-all
        ${isOver ? "ring-2 ring-primary/50 ring-offset-1" : ""}
      `}
    >
      <div className="flex items-center justify-between px-1">
        <span className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
          {isApproval && tasks.length > 0 && (
            <AlertCircle className="inline w-3 h-3 mr-1 text-orange-500" />
          )}
          {col.label}
        </span>
        <Badge variant="outline" className="text-xs h-5 px-1.5">
          {tasks.length}
        </Badge>
      </div>

      <div
        ref={setNodeRef}
        className="space-y-2 min-h-[80px]"
        style={{ minHeight: isOver && tasks.length === 0 ? "120px" : undefined }}
      >
        <ScrollArea className="h-[calc(100vh-280px)]">
          <div className="space-y-2 pr-1">
            {tasks.map((task) => (
              <KanbanCard
                key={task.id}
                task={task}
                onClick={() => onCardClick(task.id)}
                agents={agents}
                subTaskTotal={subTaskMap[task.id]?.total ?? 0}
                subTaskDone={subTaskMap[task.id]?.done ?? 0}
              />
            ))}

            {tasks.length === 0 && (
              <div
                className={`
                  rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground
                  transition-colors
                  ${isOver
                    ? "border-primary/50 bg-primary/5 text-primary"
                    : "border-muted-foreground/30"
                  }
                `}
              >
                {isOver ? "Soltar aqui" : "Vazio"}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// ─── Filter Bar ─────────────────────────────────────────────────────────────

function KanbanFilterBar({
  agents,
  activeAgents,
  setActiveAgents,
  activePriority,
  setActivePriority,
  localApproval,
  setLocalApproval,
}: {
  agents: Agent[];
  activeAgents: string[];
  setActiveAgents: (v: string[]) => void;
  activePriority: string;
  setActivePriority: (v: string) => void;
  localApproval: boolean;
  setLocalApproval: (v: boolean) => void;
}) {
  const hasFilter = activeAgents.length > 0 || activePriority !== "" || localApproval;

  const toggleAgent = (id: string) => {
    setActiveAgents(
      activeAgents.includes(id)
        ? activeAgents.filter(a => a !== id)
        : [...activeAgents, id]
    );
  };

  const clear = () => {
    setActiveAgents([]);
    setActivePriority("");
    setLocalApproval(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 p-2 bg-muted/40 rounded-lg border">
      {/* Agent chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {agents.filter(a => a.id !== "moniz").map(agent => {
          const isActive = activeAgents.includes(agent.id);
          return (
            <button
              key={agent.id}
              onClick={() => toggleAgent(agent.id)}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-all font-medium ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-background text-muted-foreground border-muted-foreground/30 hover:border-primary/50 hover:text-foreground"
              }`}
            >
              <span>{agent.emoji ?? "🤖"}</span>
              <span>{agent.name}</span>
            </button>
          );
        })}
      </div>

      {/* Divider */}
      {agents.length > 0 && <div className="h-5 w-px bg-border" />}

      {/* Priority dropdown */}
      <Select value={activePriority || "all"} onValueChange={v => setActivePriority(v === "all" ? "" : v)}>
        <SelectTrigger className="h-7 text-xs w-36 bg-background">
          <SelectValue placeholder="Prioridade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as prioridades</SelectItem>
          <SelectItem value="critical">🔴 Crítica</SelectItem>
          <SelectItem value="high">🟠 Alta</SelectItem>
          <SelectItem value="medium">🟡 Média</SelectItem>
          <SelectItem value="low">🟢 Baixa</SelectItem>
        </SelectContent>
      </Select>

      {/* Approval filter */}
      <button
        onClick={() => setLocalApproval(!localApproval)}
        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all font-medium ${
          localApproval
            ? "bg-yellow-100 text-yellow-800 border-yellow-400 shadow-sm"
            : "bg-background text-muted-foreground border-muted-foreground/30 hover:border-yellow-400/50 hover:text-foreground"
        }`}
      >
        <Clock className="w-3 h-3" />
        <span>Minha Aprovação</span>
      </button>

      {/* Clear */}
      {hasFilter && (
        <button
          onClick={clear}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-red-300 text-red-600 bg-red-50 hover:bg-red-100 transition-all font-medium"
        >
          <X className="w-3 h-3" />
          <span>Limpar</span>
        </button>
      )}
    </div>
  );
}

// ─── Main Board ──────────────────────────────────────────────────────────────

export function KanbanBoard({ filterStatus }: { filterStatus?: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [subTaskMap, setSubTaskMap] = useState<Record<string, { total: number; done: number }>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  // Filter state
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  const [activePriority, setActivePriority] = useState<string>("");
  const [localApproval, setLocalApproval] = useState(false);
  const [searchText, setSearchText] = useState<string>("");

  // Optimistic local override: taskId → status
  const optimistic = useRef<Record<string, TaskStatus>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const fetchTasks = async () => {
    try {
      const [rootRes, allRes] = await Promise.all([
        fetch("/api/tasks?rootOnly=true"),
        fetch("/api/tasks"),
      ]);
      const rootData = await rootRes.json();
      const allData = await allRes.json();

      // Build sub-task count map
      const counts: Record<string, { total: number; done: number }> = {};
      for (const t of allData) {
        if (t.parentId) {
          if (!counts[t.parentId]) counts[t.parentId] = { total: 0, done: 0 };
          counts[t.parentId].total++;
          if (t.status === "done") counts[t.parentId].done++;
        }
      }
      setSubTaskMap(counts);

      // Clear optimistic overrides for tasks that came back from server
      for (const t of rootData) {
        if (optimistic.current[t.id] === t.status) {
          delete optimistic.current[t.id];
        }
      }
      setTasks(rootData);
      if (loading) setLoading(false);
    } catch (err) {
      console.error("[KanbanBoard] fetchTasks falhou — estado anterior mantido:", err);
      // Estado anterior mantido; loading termina para não bloquear a UI indefinidamente
      if (loading) setLoading(false);
    }
  };

  const fetchAgents = async () => {
    try {
      const res = await fetch("/api/agents");
      if (res.ok) setAgents(await res.json());
    } catch {}
  };

  useEffect(() => {
    fetchTasks();
    fetchAgents();
    const i = setInterval(fetchTasks, 5000);
    const j = setInterval(fetchAgents, 15000);
    return () => { clearInterval(i); clearInterval(j); };
  }, []);

  // Effective tasks with optimistic overrides applied
  const effectiveTasks = tasks.map((t) =>
    optimistic.current[t.id]
      ? { ...t, status: optimistic.current[t.id] }
      : t
  );

  const byStatus = (status: string) => {
    // External approval filter (from page header)
    if (filterStatus && status !== filterStatus) return [];
    // Local approval filter button
    if (localApproval && status !== "waiting_approval") return [];

    const query = searchText.trim().toLowerCase();

    return effectiveTasks.filter((t) => {
      if (t.status !== status) return false;
      // Agent filter
      if (activeAgents.length > 0 && (!t.assignedAgent || !activeAgents.includes(t.assignedAgent))) return false;
      // Priority filter
      if (activePriority && t.priority !== activePriority) return false;
      // Search filter (título ou descrição, case-insensitive)
      if (query) {
        const inTitle = t.title?.toLowerCase().includes(query);
        const inDesc  = t.description?.toLowerCase().includes(query);
        if (!inTitle && !inDesc) return false;
      }
      return true;
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const newStatus = over.id as TaskStatus;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    // Optimistic update
    optimistic.current[taskId] = newStatus;
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );
    setMovingId(taskId);

    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, agentId: "main" }),
      });
    } catch {
      // Revert on error
      delete optimistic.current[taskId];
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: task.status } : t))
      );
    } finally {
      setMovingId(null);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">
          {tasks.length} card{tasks.length !== 1 ? "s" : ""} no board
          {movingId && (
            <span className="ml-2 text-primary animate-pulse">· movendo...</span>
          )}
        </p>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" /> Novo Card
        </Button>
      </div>

      {/* Pesquisa de texto */}
      <div className="mb-2">
        <input
          type="text"
          placeholder="🔍 Pesquisar cards..."
          className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
        />
      </div>

      <KanbanFilterBar
        agents={agents}
        activeAgents={activeAgents}
        setActiveAgents={setActiveAgents}
        activePriority={activePriority}
        setActivePriority={setActivePriority}
        localApproval={localApproval}
        setLocalApproval={setLocalApproval}
      />

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          className="flex gap-3 overflow-x-auto pb-4"
          style={{ minHeight: "calc(100vh - 220px)" }}
        >
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.key}
              col={col}
              tasks={byStatus(col.key)}
              onCardClick={(id) => setSelectedId(id)}
              agents={agents}
              subTaskMap={subTaskMap}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
          {activeTask && (
            <KanbanCard
              task={activeTask}
              onClick={() => {}}
              overlay
              agents={agents}
              subTaskTotal={subTaskMap[activeTask.id]?.total ?? 0}
              subTaskDone={subTaskMap[activeTask.id]?.done ?? 0}
            />
          )}
        </DragOverlay>
      </DndContext>

      <CreateCardModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={fetchTasks}
      />

      <CardDetailModal
        taskId={selectedId}
        onClose={() => setSelectedId(null)}
        onRefresh={fetchTasks}
      />
    </>
  );
}
