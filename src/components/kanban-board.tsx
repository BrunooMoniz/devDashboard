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
import { Plus, AlertCircle, GripVertical } from "lucide-react";
import {
  Task, TaskStatus, COLUMNS, PRIORITY_VARIANTS, AGENT_INFO, getTags, timeAgo,
} from "@/lib/types";
import { CreateCardModal } from "./create-card-modal";
import { CardDetailModal } from "./card-detail-modal";

// ─── Draggable Card ─────────────────────────────────────────────────────────

function KanbanCard({
  task,
  isApproval,
  onClick,
  overlay = false,
}: {
  task: Task;
  isApproval: boolean;
  onClick: () => void;
  overlay?: boolean;
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

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={overlay ? { cursor: "grabbing" } : style}
      className={`
        bg-background rounded-lg border p-3 space-y-2 select-none
        hover:shadow-md hover:border-primary/40 transition-all
        ${isApproval ? "border-orange-300" : ""}
        ${overlay ? "shadow-xl rotate-1 opacity-95" : ""}
      `}
    >
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
        <Badge
          variant={PRIORITY_VARIANTS[task.priority] as any}
          className="text-[10px] px-1.5 py-0"
        >
          {task.priority}
        </Badge>
        <div className="flex items-center gap-1">
          {task.reviewCycles > 0 && (
            <span className="text-[10px] text-muted-foreground">🔄{task.reviewCycles}</span>
          )}
          {task.assignedAgent ? (
            <span className="text-sm" title={task.assignedAgent}>
              {AGENT_INFO[task.assignedAgent]?.emoji ?? "🤖"}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">sem dono</span>
          )}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground pl-5">{timeAgo(task.updatedAt)}</p>
    </div>
  );
}

// ─── Droppable Column ────────────────────────────────────────────────────────

function KanbanColumn({
  col,
  tasks,
  onCardClick,
}: {
  col: (typeof COLUMNS)[number];
  tasks: Task[];
  onCardClick: (id: string) => void;
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
                isApproval={isApproval}
                onClick={() => onCardClick(task.id)}
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

// ─── Main Board ──────────────────────────────────────────────────────────────

export function KanbanBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  // Optimistic local override: taskId → status
  const optimistic = useRef<Record<string, TaskStatus>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const fetchTasks = async () => {
    const res = await fetch("/api/tasks?rootOnly=true");
    const data = await res.json();
    // Clear optimistic overrides for tasks that came back from server
    for (const t of data) {
      if (optimistic.current[t.id] === t.status) {
        delete optimistic.current[t.id];
      }
    }
    setTasks(data);
    if (loading) setLoading(false);
  };

  useEffect(() => {
    fetchTasks();
    const i = setInterval(fetchTasks, 5000);
    return () => clearInterval(i);
  }, []);

  // Effective tasks with optimistic overrides applied
  const effectiveTasks = tasks.map((t) =>
    optimistic.current[t.id]
      ? { ...t, status: optimistic.current[t.id] }
      : t
  );

  const byStatus = (status: string) =>
    effectiveTasks.filter((t) => t.status === status);

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
      <div className="flex items-center justify-between mb-4">
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
            />
          ))}
        </div>

        <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
          {activeTask && (
            <KanbanCard
              task={activeTask}
              isApproval={false}
              onClick={() => {}}
              overlay
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
