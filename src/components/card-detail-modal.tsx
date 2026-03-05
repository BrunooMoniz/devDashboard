"use client";

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Task, TaskDetail, TaskComment, COLUMNS, PRIORITY_VARIANTS, AGENT_INFO, getTags, timeAgo,
} from "@/lib/types";
import { CreateCardModal } from "./create-card-modal";
import { CheckCircle, XCircle, Clock, GitBranch, Ban, Trash2 } from "lucide-react";

const COMMENT_ICONS: Record<string, string> = {
  comment: "💬",
  status_change: "↪️",
  approval: "✅",
  rejection: "❌",
  assignment: "👤",
  architecture: "🏗️",
  review_cycle: "🔄",
};

type Props = {
  taskId: string | null;
  onClose: () => void;
  onRefresh: () => void;
};

export function CardDetailModal({ taskId, onClose, onRefresh }: Props) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [comment, setComment] = useState("");
  const [approvalComment, setApprovalComment] = useState("");
  const [showApproval, setShowApproval] = useState(false);
  const [showSubCard, setShowSubCard] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fetchDetail = async () => {
    if (!taskId) return;
    const res = await fetch(`/api/tasks/${taskId}`);
    if (res.ok) setDetail(await res.json());
  };

  useEffect(() => {
    fetchDetail();
  }, [taskId]);

  if (!taskId) return null;

  const cancelCard = async () => {
    if (!detail) return;
    setLoading(true);
    await fetch(`/api/tasks/${detail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled", agentId: "main", comment: "Card cancelado por Moniz." }),
    });
    setLoading(false);
    onRefresh();
    onClose();
  };

  const deleteCard = async () => {
    if (!detail) return;
    setLoading(true);
    await fetch(`/api/tasks/${detail.id}`, { method: "DELETE" });
    setLoading(false);
    onRefresh();
    onClose();
  };

  const needsApproval =
    detail?.status === "waiting_approval" || detail?.status === "waiting_deploy";

  const addComment = async () => {
    if (!comment.trim() || !detail) return;
    setLoading(true);
    await fetch(`/api/tasks/${detail.id}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: "main", type: "comment", content: comment }),
    });
    setComment("");
    setLoading(false);
    fetchDetail();
  };

  const doApproval = async (approved: boolean) => {
    if (!detail) return;
    setLoading(true);
    const newStatus =
      detail.status === "waiting_approval"
        ? approved ? "in_progress" : "todo"
        : approved ? "done" : "waiting_deploy";

    await fetch(`/api/tasks/${detail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: newStatus,
        approvalComment,
        agentId: "main",
        comment: approved
          ? `✅ Aprovado por Moniz${approvalComment ? `: ${approvalComment}` : ""}`
          : `❌ Rejeitado por Moniz${approvalComment ? `: ${approvalComment}` : ""}`,
      }),
    });

    // Log comment type
    await fetch(`/api/tasks/${detail.id}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "main",
        type: approved ? "approval" : "rejection",
        content: approved ? "Aprovado" : `Rejeitado: ${approvalComment}`,
      }),
    });

    setApprovalComment("");
    setShowApproval(false);
    setLoading(false);
    fetchDetail();
    onRefresh();
  };

  return (
    <>
      <Dialog open={!!taskId} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={PRIORITY_VARIANTS[detail?.priority ?? "medium"] as any} className="text-xs">
                    {detail?.priority}
                  </Badge>
                  {detail && (
                    <Badge variant="outline" className="text-xs">
                      {COLUMNS.find((c) => c.key === detail.status)?.label ?? detail.status}
                    </Badge>
                  )}
                  {getTags(detail?.tags ?? null).map((t) => (
                    <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                  ))}
                </div>
                <DialogTitle className="mt-2 text-left">{detail?.title}</DialogTitle>
              </div>
              {detail?.assignedAgent && (
                <span className="text-2xl" title={detail.assignedAgent}>
                  {AGENT_INFO[detail.assignedAgent]?.emoji ?? "🤖"}
                </span>
              )}
            </div>
          </DialogHeader>

          {/* Danger zone */}
          {detail?.status !== "cancelled" && (
            <div className="flex gap-2 pt-1 pb-2 border-b">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                onClick={cancelCard}
                disabled={loading}
              >
                <Ban className="w-3.5 h-3.5" /> Cancelar card
              </Button>
              {!confirmDelete ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 ml-auto"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Apagar
                </Button>
              ) : (
                <div className="ml-auto flex gap-1.5 items-center">
                  <span className="text-xs text-red-600 font-medium">Tens a certeza?</span>
                  <Button size="sm" variant="destructive" onClick={deleteCard} disabled={loading}>
                    Sim, apagar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
                    Não
                  </Button>
                </div>
              )}
            </div>
          )}

          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-4 pb-4">
              {/* Description */}
              {detail?.description && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {detail.description}
                </p>
              )}

              {/* Architecture */}
              {detail?.architecture && (
                <div className="rounded-lg bg-muted/50 border p-3 space-y-1">
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">
                    🏗️ Arquitetura (Orion)
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{detail.architecture}</p>
                </div>
              )}

              {/* Approval area */}
              {needsApproval && (
                <div className="rounded-lg border-2 border-orange-200 bg-orange-50 dark:bg-orange-950/30 p-4 space-y-3">
                  <p className="text-sm font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {detail?.status === "waiting_approval"
                      ? "Aguardando sua aprovação de arquitetura"
                      : "Aguardando sua aprovação para deploy"}
                  </p>
                  {showApproval ? (
                    <>
                      <Textarea
                        placeholder="Comentário (opcional)..."
                        value={approvalComment}
                        onChange={(e) => setApprovalComment(e.target.value)}
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button
                          className="flex-1 bg-green-600 hover:bg-green-700"
                          onClick={() => doApproval(true)}
                          disabled={loading}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" /> Aprovar
                        </Button>
                        <Button
                          variant="destructive"
                          className="flex-1"
                          onClick={() => doApproval(false)}
                          disabled={loading}
                        >
                          <XCircle className="w-4 h-4 mr-1" /> Pedir Alterações
                        </Button>
                        <Button variant="outline" onClick={() => setShowApproval(false)}>
                          Cancelar
                        </Button>
                      </div>
                    </>
                  ) : (
                    <Button onClick={() => setShowApproval(true)} className="w-full">
                      Revisar e Decidir
                    </Button>
                  )}
                </div>
              )}

              {/* Review cycles */}
              {detail?.reviewCycles !== undefined && detail.reviewCycles > 0 && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <GitBranch className="w-3 h-3" />
                  {detail.reviewCycles} ciclo(s) de revisão
                  {detail.reviewCycles >= 3 && " (máximo atingido)"}
                </p>
              )}

              {/* Sub-tasks */}
              {detail?.subTasks && detail.subTasks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Sub-tarefas ({detail.subTasks.length})
                  </p>
                  {detail.subTasks.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center gap-2 text-sm rounded-lg border px-3 py-2 bg-muted/30"
                    >
                      <span className="text-xs">
                        {AGENT_INFO[sub.assignedAgent ?? ""]?.emoji ?? "○"}
                      </span>
                      <span className="flex-1 truncate">{sub.title}</span>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {COLUMNS.find((c) => c.key === sub.status)?.label ?? sub.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setShowSubCard(true)}
              >
                + Sub-tarefa
              </Button>

              <Separator />

              {/* Timeline */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Timeline
                </p>
                {detail?.timeline?.length === 0 && (
                  <p className="text-xs text-muted-foreground">Sem atividade ainda.</p>
                )}
                {[...(detail?.timeline ?? [])].reverse().map((c) => (
                  <div key={c.id} className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 mt-0.5">
                      {COMMENT_ICONS[c.type] ?? "•"}
                    </span>
                    <span className="shrink-0 font-medium">
                      {AGENT_INFO[c.agentId]?.emoji ?? "🤖"} {c.agentId}
                    </span>
                    <span className="flex-1 text-muted-foreground">{c.content}</span>
                    <span className="shrink-0 text-muted-foreground">{timeAgo(c.createdAt)}</span>
                  </div>
                ))}
              </div>

              {/* Add comment */}
              <div className="space-y-2">
                <Textarea
                  placeholder="Adicionar comentário..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                />
                <Button
                  size="sm"
                  onClick={addComment}
                  disabled={!comment.trim() || loading}
                >
                  Comentar
                </Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {showSubCard && detail && (
        <CreateCardModal
          open={showSubCard}
          onClose={() => setShowSubCard(false)}
          onCreated={() => { fetchDetail(); onRefresh(); }}
          parentId={detail.id}
        />
      )}
    </>
  );
}
