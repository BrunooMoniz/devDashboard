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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Task, TaskDetail, TaskComment, COLUMNS, PRIORITY_VARIANTS, AGENT_INFO, getTags, timeAgo,
} from "@/lib/types";
import { CreateCardModal } from "./create-card-modal";
import { CheckCircle, XCircle, Clock, GitBranch, Ban, Trash2, ChevronRight, X } from "lucide-react";

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

// ─── Painel de detalhe (reutilizado para task principal e subtarefa) ──────────

function DetailPane({
  detail,
  onRefresh,
  compact = false,
}: {
  detail: TaskDetail;
  onRefresh: () => void;
  compact?: boolean;
}) {
  const [comment, setComment] = useState("");
  const [approvalComment, setApprovalComment] = useState("");
  const [showApproval, setShowApproval] = useState(false);
  const [loading, setLoading] = useState(false);

  const needsApproval =
    detail.status === "waiting_approval" || detail.status === "waiting_deploy";

  const addComment = async () => {
    if (!comment.trim()) return;
    setLoading(true);
    await fetch(`/api/tasks/${detail.id}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: "main", type: "comment", content: comment }),
    });
    setComment("");
    setLoading(false);
    onRefresh();
  };

  const doApproval = async (approved: boolean) => {
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
          ? `✅ Aprovado${approvalComment ? `: ${approvalComment}` : ""}`
          : `❌ Rejeitado${approvalComment ? `: ${approvalComment}` : ""}`,
      }),
    });
    setApprovalComment("");
    setShowApproval(false);
    setLoading(false);
    onRefresh();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header info */}
      <div className="space-y-2 shrink-0 pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={PRIORITY_VARIANTS[detail.priority] as any} className="text-xs">
            {detail.priority}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {COLUMNS.find((c) => c.key === detail.status)?.label ?? detail.status}
          </Badge>
          {getTags(detail.tags).map((t) => (
            <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
          ))}
          {detail.assignedAgent && (
            <span className="ml-auto text-xl" title={detail.assignedAgent}>
              {AGENT_INFO[detail.assignedAgent]?.emoji ?? "🤖"}
            </span>
          )}
        </div>
        {!compact && (
          <p className={`font-semibold leading-snug ${compact ? "text-sm" : "text-base"}`}>
            {detail.title}
          </p>
        )}
      </div>

      <ScrollArea className="flex-1 -mx-1 px-1">
        <div className="space-y-4 pb-4">
          {/* Description */}
          {detail.description && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {detail.description}
            </p>
          )}

          {/* Architecture */}
          {detail.architecture && (
            <div className="rounded-lg bg-muted/50 border p-3 space-y-1">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">
                🏗️ Arquitetura (Orion)
              </p>
              <p className="text-sm whitespace-pre-wrap">{detail.architecture}</p>
            </div>
          )}

          {/* Approval */}
          {needsApproval && (
            <div className="rounded-lg border-2 border-orange-200 bg-orange-50 dark:bg-orange-950/30 p-3 space-y-2">
              <p className="text-sm font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {detail.status === "waiting_approval"
                  ? "Aguardando aprovação de arquitetura"
                  : "Aguardando aprovação para deploy"}
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
                      className="flex-1 bg-green-600 hover:bg-green-700 text-xs h-8"
                      onClick={() => doApproval(true)}
                      disabled={loading}
                    >
                      <CheckCircle className="w-3.5 h-3.5 mr-1" /> Aprovar
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1 text-xs h-8"
                      onClick={() => doApproval(false)}
                      disabled={loading}
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Pedir Alterações
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowApproval(false)}>
                      ✕
                    </Button>
                  </div>
                </>
              ) : (
                <Button onClick={() => setShowApproval(true)} className="w-full h-8 text-xs">
                  Revisar e Decidir
                </Button>
              )}
            </div>
          )}

          {/* Review cycles */}
          {detail.reviewCycles > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <GitBranch className="w-3 h-3" />
              {detail.reviewCycles} ciclo(s) de revisão
              {detail.reviewCycles >= 3 && " (máximo atingido)"}
            </p>
          )}

          <Separator />

          {/* Timeline */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Timeline
            </p>
            {detail.timeline?.length === 0 && (
              <p className="text-xs text-muted-foreground">Sem atividade ainda.</p>
            )}
            {[...(detail.timeline ?? [])].reverse().map((c) => (
              <div key={c.id} className="flex items-start gap-2 text-xs">
                <span className="shrink-0 mt-0.5">{COMMENT_ICONS[c.type] ?? "•"}</span>
                <span className="shrink-0 font-medium">
                  {AGENT_INFO[c.agentId]?.emoji ?? "🤖"} {c.agentId}
                </span>
                <span className="flex-1 text-muted-foreground">{c.content}</span>
                <span className="shrink-0 text-muted-foreground">{timeAgo(c.createdAt)}</span>
              </div>
            ))}
          </div>

          {/* Comment */}
          <div className="space-y-2">
            <Textarea
              placeholder="Adicionar comentário..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="text-sm"
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
    </div>
  );
}

// ─── Modal principal ──────────────────────────────────────────────────────────

export function CardDetailModal({ taskId, onClose, onRefresh }: Props) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [subDetail, setSubDetail] = useState<TaskDetail | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showSubCard, setShowSubCard] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchDetail = async () => {
    if (!taskId) return;
    const res = await fetch(`/api/tasks/${taskId}`);
    if (res.ok) setDetail(await res.json());
  };

  const fetchSubDetail = async (id: string) => {
    const res = await fetch(`/api/tasks/${id}`);
    if (res.ok) setSubDetail(await res.json());
  };

  useEffect(() => {
    fetchDetail();
    setSelectedSubId(null);
    setSubDetail(null);
  }, [taskId]);

  useEffect(() => {
    if (!selectedSubId) { setSubDetail(null); return; }
    fetchSubDetail(selectedSubId);
  }, [selectedSubId]);

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

  const hasSub = !!selectedSubId && !!subDetail;

  return (
    <>
      <Dialog open={!!taskId} onOpenChange={onClose}>
        <DialogContent
          className={`
            flex flex-col gap-0 p-0 overflow-hidden
            transition-all duration-300
            ${hasSub ? "max-w-5xl" : "max-w-2xl"}
          `}
          style={{ maxHeight: "90vh" }}
        >
          {/* ── Danger zone header ── */}
          <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b shrink-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
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
              <h2 className="font-semibold text-base leading-snug truncate pr-4">
                {detail?.title}
              </h2>
            </div>

            {/* Ações */}
            {detail?.status !== "cancelled" && (
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-orange-600 border-orange-200 hover:bg-orange-50 text-xs h-7 px-2"
                  onClick={cancelCard}
                  disabled={loading}
                >
                  <Ban className="w-3 h-3" /> Cancelar
                </Button>
                {!confirmDelete ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-red-600 border-red-200 hover:bg-red-50 text-xs h-7 px-2"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="w-3 h-3" /> Apagar
                  </Button>
                ) : (
                  <div className="flex gap-1 items-center">
                    <span className="text-xs text-red-600 font-medium">Certeza?</span>
                    <Button size="sm" variant="destructive" className="h-7 text-xs px-2" onClick={deleteCard} disabled={loading}>
                      Sim
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => setConfirmDelete(false)}>
                      Não
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Corpo split ── */}
          <div className="flex flex-1 min-h-0">

            {/* Painel esquerdo — task principal */}
            <div className={`flex flex-col min-h-0 px-5 py-4 ${hasSub ? "w-[45%] border-r" : "w-full"}`}>

              {detail && (
                <DetailPane
                  detail={detail}
                  onRefresh={() => { fetchDetail(); onRefresh(); }}
                />
              )}

              {/* Sub-tarefas */}
              <div className="shrink-0 pt-3 border-t mt-2 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Sub-tarefas {detail?.subTasks?.length ? `(${detail.subTasks.length})` : ""}
                </p>

                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                  {detail?.subTasks?.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhuma ainda.</p>
                  )}
                  {detail?.subTasks?.map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => setSelectedSubId(selectedSubId === sub.id ? null : sub.id)}
                      className={`
                        w-full flex items-center gap-2 text-left rounded-lg border px-3 py-2
                        text-sm transition-all hover:shadow-sm
                        ${selectedSubId === sub.id
                          ? "border-primary bg-primary/5"
                          : "hover:border-primary/30 bg-muted/30"
                        }
                      `}
                    >
                      <span className="text-xs shrink-0">
                        {AGENT_INFO[sub.assignedAgent ?? ""]?.emoji ?? "○"}
                      </span>
                      <span className="flex-1 truncate text-xs">{sub.title}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {COLUMNS.find((c) => c.key === sub.status)?.label ?? sub.status}
                      </Badge>
                      <ChevronRight className={`w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform ${selectedSubId === sub.id ? "rotate-90" : ""}`} />
                    </button>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-7"
                  onClick={() => setShowSubCard(true)}
                >
                  + Sub-tarefa
                </Button>
              </div>
            </div>

            {/* Painel direito — subtarefa selecionada */}
            {hasSub && subDetail && (
              <div className="flex flex-col min-h-0 w-[55%] px-5 py-4">
                <div className="flex items-start gap-2 mb-3 shrink-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide mb-1">
                      Sub-tarefa
                    </p>
                    <p className="font-semibold text-sm leading-snug">{subDetail.title}</p>
                  </div>
                  <button
                    onClick={() => { setSelectedSubId(null); setSubDetail(null); }}
                    className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <DetailPane
                  detail={subDetail}
                  compact
                  onRefresh={() => { fetchDetail(); fetchSubDetail(subDetail.id); onRefresh(); }}
                />
              </div>
            )}
          </div>
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
