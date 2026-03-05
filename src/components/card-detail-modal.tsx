"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Task, TaskDetail, COLUMNS, PRIORITY_VARIANTS, AGENT_INFO, getTags, timeAgo,
} from "@/lib/types";
import { CreateCardModal } from "./create-card-modal";
import {
  CheckCircle, XCircle, Clock, GitBranch, Ban, Trash2, ChevronRight, X, Plus,
} from "lucide-react";

const COMMENT_ICONS: Record<string, string> = {
  comment: "💬", status_change: "↪️", approval: "✅",
  rejection: "❌", assignment: "👤", architecture: "🏗️", review_cycle: "🔄",
};

// ─── Painel de detalhe reutilizável ──────────────────────────────────────────

function DetailPane({
  detail,
  title,
  onRefresh,
  onClose,
  actions,
}: {
  detail: TaskDetail;
  title?: React.ReactNode;
  onRefresh: () => void;
  onClose?: () => void;
  actions?: React.ReactNode;
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
        status: newStatus, approvalComment, agentId: "main",
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
    <div className="flex flex-col h-full overflow-hidden min-h-0">
      {/* Card header */}
      <div className="shrink-0 px-5 pt-4 pb-3 border-b">
        {title && <div className="mb-2">{title}</div>}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
              <Badge variant={PRIORITY_VARIANTS[detail.priority] as any} className="text-xs">
                {detail.priority}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {COLUMNS.find((c) => c.key === detail.status)?.label ?? detail.status}
              </Badge>
              {getTags(detail.tags).map((t) => (
                <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
              ))}
            </div>
            <h3 className="font-semibold text-sm leading-snug">{detail.title}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {detail.assignedAgent && (
              <span className="text-xl" title={detail.assignedAgent}>
                {AGENT_INFO[detail.assignedAgent]?.emoji ?? "🤖"}
              </span>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        {actions && <div className="mt-2">{actions}</div>}
      </div>

      {/* Scrollable body */}
      <ScrollArea className="flex-1 min-h-0 px-5">
        <div className="space-y-4 py-4">
          {detail.description && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {detail.description}
            </p>
          )}

          {detail.architecture && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 p-3 space-y-1">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                🏗️ Arquitetura (Orion)
              </p>
              <p className="text-sm whitespace-pre-wrap">{detail.architecture}</p>
            </div>
          )}

          {needsApproval && (
            <div className="rounded-lg border-2 border-orange-200 bg-orange-50 dark:bg-orange-950/30 p-3 space-y-2">
              <p className="text-sm font-semibold text-orange-700 flex items-center gap-2">
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
                    <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 h-8 text-xs"
                      onClick={() => doApproval(true)} disabled={loading}>
                      <CheckCircle className="w-3.5 h-3.5 mr-1" /> Aprovar
                    </Button>
                    <Button size="sm" variant="destructive" className="flex-1 h-8 text-xs"
                      onClick={() => doApproval(false)} disabled={loading}>
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Pedir Alterações
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" onClick={() => setShowApproval(false)}>
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

          {detail.reviewCycles > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <GitBranch className="w-3 h-3" />
              {detail.reviewCycles} ciclo(s) de revisão
              {detail.reviewCycles >= 3 && " — máximo atingido"}
            </p>
          )}

          <Separator />

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Timeline
            </p>
            {(!detail.timeline || detail.timeline.length === 0) && (
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

          <div className="space-y-2">
            <Textarea
              placeholder="Adicionar comentário..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="text-sm"
            />
            <Button size="sm" onClick={addComment} disabled={!comment.trim() || loading}>
              Comentar
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Modal principal ──────────────────────────────────────────────────────────

type Props = {
  taskId: string | null;
  onClose: () => void;
  onRefresh: () => void;
};

export function CardDetailModal({ taskId, onClose, onRefresh }: Props) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [subDetail, setSubDetail] = useState<TaskDetail | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showSubCard, setShowSubCard] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

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
    if (!taskId) { setDetail(null); setSelectedSubId(null); setSubDetail(null); return; }
    fetchDetail();
    setSelectedSubId(null);
    setSubDetail(null);
  }, [taskId]);

  useEffect(() => {
    if (!selectedSubId) { setSubDetail(null); return; }
    fetchSubDetail(selectedSubId);
  }, [selectedSubId]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedSubId) { setSelectedSubId(null); setSubDetail(null); }
        else onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedSubId, onClose]);

  if (!taskId || !mounted) return null;

  const hasSub = !!selectedSubId && !!subDetail;

  const cancelCard = async () => {
    if (!detail) return;
    setLoading(true);
    await fetch(`/api/tasks/${detail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled", agentId: "main", comment: "Cancelado por Moniz." }),
    });
    setLoading(false); onRefresh(); onClose();
  };

  const deleteCard = async () => {
    if (!detail) return;
    setLoading(true);
    await fetch(`/api/tasks/${detail.id}`, { method: "DELETE" });
    setLoading(false); onRefresh(); onClose();
  };

  const modal = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={() => {
          if (hasSub) { setSelectedSubId(null); setSubDetail(null); }
          else onClose();
        }}
      />

      {/* Cards container — centrado na tela */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
        style={{ gap: "12px" }}
      >
        {/* ── Card principal ── */}
        <div
          className="pointer-events-auto w-[560px] bg-background rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
          style={{ height: "82vh" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header com acções */}
          <div className="shrink-0 flex items-center gap-2 px-5 pt-4 pb-3 border-b">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                {detail && (
                  <>
                    <Badge variant={PRIORITY_VARIANTS[detail.priority] as any} className="text-xs">
                      {detail.priority}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {COLUMNS.find((c) => c.key === detail.status)?.label ?? detail.status}
                    </Badge>
                    {getTags(detail.tags).map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                    ))}
                  </>
                )}
              </div>
              <h2 className="font-semibold text-base leading-snug truncate pr-2">
                {detail?.title ?? "…"}
              </h2>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {detail?.assignedAgent && (
                <span className="text-xl">{AGENT_INFO[detail.assignedAgent]?.emoji ?? "🤖"}</span>
              )}
              {detail?.status !== "cancelled" && (
                <>
                  <Button variant="outline" size="sm"
                    className="gap-1 text-orange-600 border-orange-200 hover:bg-orange-50 text-xs h-7 px-2"
                    onClick={cancelCard} disabled={loading}>
                    <Ban className="w-3 h-3" /> Cancelar
                  </Button>
                  {!confirmDelete ? (
                    <Button variant="outline" size="sm"
                      className="gap-1 text-red-600 border-red-200 hover:bg-red-50 text-xs h-7 px-2"
                      onClick={() => setConfirmDelete(true)}>
                      <Trash2 className="w-3 h-3" /> Apagar
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-red-600 font-medium">Certeza?</span>
                      <Button size="sm" variant="destructive" className="h-7 text-xs px-2"
                        onClick={deleteCard} disabled={loading}>Sim</Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2"
                        onClick={() => setConfirmDelete(false)}>Não</Button>
                    </div>
                  )}
                </>
              )}
              <button onClick={onClose} className="ml-1 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Corpo scrollável */}
          {detail && (
            <ScrollArea className="flex-1 min-h-0 px-5">
              <div className="space-y-4 py-4">
                {detail.description && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{detail.description}</p>
                )}
                {detail.architecture && (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 p-3">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
                      🏗️ Arquitetura
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{detail.architecture}</p>
                  </div>
                )}
                {detail.reviewCycles > 0 && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <GitBranch className="w-3 h-3" /> {detail.reviewCycles} ciclo(s) de revisão
                  </p>
                )}
                <Separator />
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Timeline</p>
                  {(!detail.timeline || detail.timeline.length === 0) && (
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
                <div className="space-y-2">
                  <Textarea placeholder="Adicionar comentário..." rows={2} className="text-sm"
                    onChange={(e) => e.target.value} />
                  <Button size="sm">Comentar</Button>
                </div>
              </div>
            </ScrollArea>
          )}

          {/* Sub-tarefas — rodapé fixo */}
          <div className="shrink-0 border-t px-5 py-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Sub-tarefas {detail?.subTasks?.length ? `(${detail.subTasks.length})` : ""}
            </p>
            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
              {(!detail?.subTasks || detail.subTasks.length === 0) && (
                <p className="text-xs text-muted-foreground">Nenhuma ainda.</p>
              )}
              {detail?.subTasks?.map((sub) => (
                <button key={sub.id}
                  onClick={() => setSelectedSubId(selectedSubId === sub.id ? null : sub.id)}
                  className={`w-full flex items-center gap-2 text-left rounded-lg border px-3 py-2 transition-all hover:shadow-sm text-xs
                    ${selectedSubId === sub.id
                      ? "border-primary bg-primary/5 font-medium"
                      : "hover:border-primary/30 bg-muted/20"
                    }`}>
                  <span className="shrink-0">{AGENT_INFO[sub.assignedAgent ?? ""]?.emoji ?? "○"}</span>
                  <span className="flex-1 truncate">{sub.title}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0 px-1">
                    {COLUMNS.find((c) => c.key === sub.status)?.label ?? sub.status}
                  </Badge>
                  <ChevronRight className={`w-3 h-3 shrink-0 text-muted-foreground transition-transform ${selectedSubId === sub.id ? "rotate-90 text-primary" : ""}`} />
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" className="w-full text-xs h-7 gap-1"
              onClick={() => setShowSubCard(true)}>
              <Plus className="w-3 h-3" /> Sub-tarefa
            </Button>
          </div>
        </div>

        {/* ── Card de subtarefa (separado) ── */}
        {hasSub && subDetail && (
          <div
            className="pointer-events-auto w-[520px] bg-background rounded-2xl border shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right-4 duration-200"
            style={{ height: "82vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Label "Sub-tarefa" no topo */}
            <div className="shrink-0 px-5 pt-3 pb-0">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                Sub-tarefa
              </p>
            </div>
            <DetailPane
              detail={subDetail}
              onRefresh={() => { fetchDetail(); if (selectedSubId) fetchSubDetail(selectedSubId); onRefresh(); }}
              onClose={() => { setSelectedSubId(null); setSubDetail(null); }}
            />
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {createPortal(modal, document.body)}
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
