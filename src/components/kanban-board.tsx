"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, AlertCircle } from "lucide-react";
import {
  Task, COLUMNS, PRIORITY_VARIANTS, AGENT_INFO, getTags, timeAgo,
} from "@/lib/types";
import { CreateCardModal } from "./create-card-modal";
import { CardDetailModal } from "./card-detail-modal";

export function KanbanBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchTasks = async () => {
    const res = await fetch("/api/tasks?rootOnly=true");
    const data = await res.json();
    setTasks(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchTasks();
    const i = setInterval(fetchTasks, 5000);
    return () => clearInterval(i);
  }, []);

  const byStatus = (status: string) =>
    tasks.filter((t) => t.status === status);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {tasks.length} card{tasks.length !== 1 ? "s" : ""} no board
        </p>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" /> Novo Card
        </Button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 220px)" }}>
        {COLUMNS.map((col) => {
          const colTasks = byStatus(col.key);
          const isApproval = col.key === "waiting_approval" || col.key === "waiting_deploy";

          return (
            <div
              key={col.key}
              className={`flex-shrink-0 w-64 rounded-xl ${col.color} p-3 space-y-2`}
            >
              <div className="flex items-center justify-between px-1">
                <span className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                  {isApproval && colTasks.length > 0 && (
                    <AlertCircle className="inline w-3 h-3 mr-1 text-orange-500" />
                  )}
                  {col.label}
                </span>
                <Badge variant="outline" className="text-xs h-5 px-1.5">
                  {colTasks.length}
                </Badge>
              </div>

              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="space-y-2 pr-1">
                  {colTasks.map((task) => {
                    const tags = getTags(task.tags);
                    return (
                      <div
                        key={task.id}
                        onClick={() => setSelectedId(task.id)}
                        className={`
                          bg-background rounded-lg border p-3 space-y-2 cursor-pointer
                          hover:shadow-md hover:border-primary/40 transition-all
                          ${isApproval ? "border-orange-300" : ""}
                        `}
                      >
                        <p className="text-sm font-medium leading-snug">{task.title}</p>

                        {task.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {task.description}
                          </p>
                        )}

                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {tags.slice(0, 3).map((t) => (
                              <Badge key={t} variant="secondary" className="text-[10px] px-1 py-0">
                                {t}
                              </Badge>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <Badge
                            variant={PRIORITY_VARIANTS[task.priority] as any}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {task.priority}
                          </Badge>
                          <div className="flex items-center gap-1">
                            {task.reviewCycles > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                🔄{task.reviewCycles}
                              </span>
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

                        <p className="text-[10px] text-muted-foreground">
                          {timeAgo(task.updatedAt)}
                        </p>
                      </div>
                    );
                  })}

                  {colTasks.length === 0 && (
                    <div className="rounded-lg border border-dashed border-muted-foreground/30 p-4 text-center text-xs text-muted-foreground">
                      Vazio
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>

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
