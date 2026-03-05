"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Agent, timeAgo } from "@/lib/types";
import { MessageCircle, Send, AlertTriangle, Zap, Brain } from "lucide-react";

type Log = { id: string; agentId: string; level: string; message: string; createdAt: string };
type ChatMsg = { id: string; agentId: string; direction: "user" | "agent"; content: string; createdAt: string };

const MODELS = [
  { value: "claude-sonnet-4-6",  label: "Sonnet 4.6",  icon: "🧠", desc: "Poderoso — melhor para tarefas complexas" },
  { value: "claude-haiku-4-5",   label: "Haiku 4.5",   icon: "⚡", desc: "Rápido e económico — bom para tarefas simples" },
];

const STATUS_DOT: Record<string, string> = {
  idle: "bg-slate-400",
  working: "bg-green-500 animate-pulse",
  error: "bg-red-500",
  offline: "bg-slate-200",
};
const STATUS_LABELS: Record<string, string> = {
  idle: "Ocioso", working: "Trabalhando", error: "Erro", offline: "Offline",
};
const STATUS_VARIANTS: Record<string, string> = {
  idle: "secondary", working: "default", error: "destructive", offline: "outline",
};
const LEVEL_COLOR: Record<string, string> = {
  info: "text-blue-500", warn: "text-yellow-500", error: "text-red-500", debug: "text-slate-400",
};

// Detecta se um agente haiku está em situação que pede upgrade
function needsUpgradeAlert(agent: Agent, logs: Log[]): string | null {
  if (!agent.model?.includes("haiku")) return null;
  if (agent.status !== "working") return null;
  // Se está working há mais de 20 min (lastSeen muito recente mas currentTask existe)
  const task = agent.currentTask ?? "";
  const isComplex = /arquitetura|design|review|implementar|criar|desenvolver|fluxo|api|componente/i.test(task);
  const errorLogs = logs.filter(l => l.level === "error" || l.level === "warn");
  if (errorLogs.length >= 2) return "Vários erros/avisos — considera upgrade para Sonnet";
  if (isComplex) return "Tarefa complexa com Haiku — pode precisar de Sonnet";
  return null;
}

export function AgentsPanel() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [logs, setLogs] = useState<Record<string, Log[]>>({});
  const [chatOpen, setChatOpen] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [changingModel, setChangingModel] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch agents
  useEffect(() => {
    const load = async () => {
      try { const r = await fetch("/api/agents"); if (r.ok) setAgents(await r.json()); } catch {}
    };
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, []);

  // Fetch logs
  useEffect(() => {
    if (!agents.length) return;
    const load = async () => {
      try {
        const r = await fetch("/api/logs?limit=200");
        if (!r.ok) return;
        const all: Log[] = await r.json();
        const byAgent: Record<string, Log[]> = {};
        for (const l of all) {
          if (!byAgent[l.agentId]) byAgent[l.agentId] = [];
          byAgent[l.agentId].push(l);
        }
        for (const id of Object.keys(byAgent)) byAgent[id] = byAgent[id].slice(0, 4);
        setLogs(byAgent);
      } catch {}
    };
    load();
    const i = setInterval(load, 8000);
    return () => clearInterval(i);
  }, [agents]);

  // Chat polling
  useEffect(() => {
    if (!chatOpen) return;
    setTyping(false);
    const load = async () => {
      try {
        const r = await fetch(`/api/agents/${chatOpen.id}/messages`);
        if (!r.ok) return;
        const msgs: ChatMsg[] = await r.json();
        setMessages(msgs);
        if (msgs.length > 0) {
          const revMsgs = [...msgs].reverse();
          const lastUserIdx = revMsgs.findIndex(m => m.direction === "user");
          const lastAgentIdx = revMsgs.findIndex(m => m.direction === "agent");
          setTyping(lastUserIdx !== -1 && (lastAgentIdx === -1 || lastUserIdx < lastAgentIdx));
        }
      } catch {}
    };
    load();
    const i = setInterval(load, 2500);
    return () => { clearInterval(i); setTyping(false); };
  }, [chatOpen]);

  // Auto-scroll
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, typing]);

  const changeModel = async (agentId: string, model: string) => {
    setChangingModel(agentId);
    try {
      await fetch("/api/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: agentId, model }),
      });
      setAgents(prev => prev.map(a => a.id === agentId ? { ...a, model } : a));
      // Loga
      await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: "main",
          level: "info",
          message: `Modelo de ${agentId} alterado para ${model} por Moniz`,
        }),
      });
    } finally {
      setChangingModel(null);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !chatOpen || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/agents/${chatOpen.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: input }),
      });
      if (r.ok) {
        const msg = await r.json();
        setMessages(prev => [...prev, msg]);
        setInput("");
        setTyping(true);
      }
    } finally { setSending(false); }
  };

  if (!agents.length) {
    return <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">Carregando agentes...</div>;
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {agents.map(agent => {
          const agentLogs = logs[agent.id] ?? [];
          const alert = needsUpgradeAlert(agent, agentLogs);
          const isHaiku = agent.model?.includes("haiku");
          const isSonnet = !isHaiku;

          return (
            <Card key={agent.id} className={`hover:shadow-md transition-shadow ${alert ? "border-yellow-400" : ""}`}>
              <CardContent className="p-4 space-y-3">

                {/* Alerta de upgrade */}
                {alert && (
                  <div className="flex items-center gap-1.5 text-[11px] text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md px-2 py-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-yellow-500" />
                    <span>{alert}</span>
                  </div>
                )}

                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{agent.emoji ?? "🤖"}</span>
                    <div>
                      <p className="font-semibold">{agent.name}</p>
                      <p className="text-xs text-muted-foreground">{agent.role}</p>
                    </div>
                  </div>
                  <span className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${STATUS_DOT[agent.status] ?? "bg-slate-300"}`} />
                </div>

                {/* Status */}
                <div className="space-y-1.5">
                  <Badge variant={STATUS_VARIANTS[agent.status] as any} className="text-xs">
                    {STATUS_LABELS[agent.status] ?? agent.status}
                  </Badge>
                  {agent.currentTask && (
                    <p className="text-xs bg-muted rounded px-2 py-1 line-clamp-2 text-muted-foreground">
                      📌 {agent.currentTask}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">Visto {timeAgo(agent.lastSeen)}</p>
                </div>

                {/* Seletor de modelo */}
                <div className="space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Modelo</p>
                  <Select
                    value={agent.model ?? "claude-haiku-4-5"}
                    onValueChange={val => changeModel(agent.id, val)}
                    disabled={changingModel === agent.id}
                  >
                    <SelectTrigger className={`h-7 text-xs gap-1.5 ${alert ? "border-yellow-400 bg-yellow-50" : ""}`}>
                      <SelectValue>
                        <span className="flex items-center gap-1.5">
                          {isHaiku
                            ? <><Zap className="w-3 h-3 text-yellow-500" /> Haiku 4.5</>
                            : <><Brain className="w-3 h-3 text-violet-500" /> Sonnet 4.6</>
                          }
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {MODELS.map(m => (
                        <SelectItem key={m.value} value={m.value}>
                          <div className="flex flex-col py-0.5">
                            <span className="text-xs font-medium">{m.icon} {m.label}</span>
                            <span className="text-[10px] text-muted-foreground">{m.desc}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {changingModel === agent.id && (
                    <p className="text-[10px] text-muted-foreground animate-pulse">A actualizar modelo...</p>
                  )}
                </div>

                {/* Logs recentes */}
                {agentLogs.length > 0 && (
                  <div className="border-t pt-2 space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Logs recentes</p>
                    {agentLogs.map(log => (
                      <p key={log.id} className={`text-[10px] leading-tight truncate ${LEVEL_COLOR[log.level] ?? "text-muted-foreground"}`}>
                        [{log.level}] {log.message}
                      </p>
                    ))}
                  </div>
                )}

                {/* Chat */}
                <Button
                  variant="outline" size="sm"
                  className="w-full text-xs gap-1.5"
                  onClick={() => { setMessages([]); setChatOpen(agent); }}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Chat com {agent.name}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Chat dialog */}
      <Dialog open={!!chatOpen} onOpenChange={open => { if (!open) setChatOpen(null); }}>
        <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden">
          <div className="flex flex-col h-[580px]">
            <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <span className="text-2xl">{chatOpen?.emoji ?? "🤖"}</span>
                <div>
                  <p>{chatOpen?.name}</p>
                  <p className="text-xs font-normal text-muted-foreground">{chatOpen?.role}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {chatOpen?.model?.includes("haiku") ? "⚡ Haiku" : "🧠 Sonnet"}
                  </span>
                  <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[chatOpen?.status ?? "offline"]}`} />
                </div>
              </DialogTitle>
            </DialogHeader>

            <ScrollArea className="flex-1 px-4 py-3">
              {messages.length === 0 && !typing ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  Nenhuma mensagem. Diz olá!
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.direction === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${msg.direction === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                        {msg.direction === "agent" && (
                          <p className="text-[10px] font-semibold mb-0.5 opacity-70">{chatOpen?.name}</p>
                        )}
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        <p className="text-[10px] opacity-50 mt-1 text-right">{timeAgo(msg.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                  {typing && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-xl px-4 py-3 flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground mr-1">{chatOpen?.name} está a pensar</span>
                        {[0, 150, 300].map(delay => (
                          <span key={delay} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                        ))}
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            <div className="px-4 py-3 border-t shrink-0">
              <div className="flex gap-2">
                <Input
                  placeholder={`Mensagem para ${chatOpen?.name ?? "agente"}...`}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage())}
                  disabled={sending}
                  className="text-sm"
                />
                <Button onClick={sendMessage} disabled={!input.trim() || sending} size="sm" className="shrink-0">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">Enter para enviar</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
