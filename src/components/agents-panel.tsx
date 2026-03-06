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
type ChatMessage = { role: "user" | "assistant"; content: string; timestamp: string };

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

function needsUpgradeAlert(agent: Agent, logs: Log[]): string | null {
  if (!agent.model?.includes("haiku")) return null;
  if (agent.status !== "working") return null;
  const task = agent.currentTask ?? "";
  const isComplex = /arquitetura|design|review|implementar|criar|desenvolver|fluxo|api|componente/i.test(task);
  const errorLogs = logs.filter(l => l.level === "error" || l.level === "warn");
  if (errorLogs.length >= 2) return "Vários erros/avisos — considera upgrade para Sonnet";
  if (isComplex) return "Tarefa complexa com Haiku — pode precisar de Sonnet";
  return null;
}

function getStorageKey(agentId: string) {
  return `chat_history_${agentId}`;
}

function loadHistory(agentId: string): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getStorageKey(agentId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(agentId: string, messages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    // Keep last 100 messages
    const trimmed = messages.slice(-100);
    localStorage.setItem(getStorageKey(agentId), JSON.stringify(trimmed));
  } catch {}
}

export function AgentsPanel() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [logs, setLogs] = useState<Record<string, Log[]>>({});
  const [chatOpen, setChatOpen] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [changingModel, setChangingModel] = useState<string | null>(null);
  const [monizCreated, setMonizCreated] = useState(0);
  const [monizApprovals, setMonizApprovals] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch agents
  useEffect(() => {
    const load = async () => {
      try { const r = await fetch("/api/agents"); if (r.ok) setAgents(await r.json()); } catch {}
    };
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, []);

  // Fetch Moniz stats
  useEffect(() => {
    const loadMonizStats = async () => {
      try {
        const r = await fetch("/api/tasks");
        if (!r.ok) return;
        const all = await r.json();
        setMonizCreated(all.filter((t: any) => t.assignedAgent === "moniz").length);
        setMonizApprovals(all.filter((t: any) => t.approvedBy === "moniz").length);
      } catch {}
    };
    loadMonizStats();
    const i = setInterval(loadMonizStats, 10000);
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

  // Load chat history from localStorage when dialog opens
  useEffect(() => {
    if (chatOpen) {
      const history = loadHistory(chatOpen.id);
      setMessages(history);
      setStreamingContent(null);
      setInput("");
    } else {
      // Abort any ongoing stream
      abortRef.current?.abort();
      setStreamingContent(null);
    }
  }, [chatOpen?.id]);

  // Auto-scroll — usa o container directamente (ScrollArea usa viewport interno)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streamingContent]);

  const changeModel = async (agentId: string, model: string) => {
    setChangingModel(agentId);
    try {
      await fetch("/api/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: agentId, model }),
      });
      setAgents(prev => prev.map(a => a.id === agentId ? { ...a, model } : a));
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
    const userMsg: ChatMessage = { role: "user", content: input.trim(), timestamp: new Date().toISOString() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setSending(true);
    setStreamingContent(""); // Show typing indicator immediately

    // Save user message
    saveHistory(chatOpen.id, newMessages);

    // Abort previous request if any
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(`/api/chat/${chatOpen.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.content, history: messages }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        const errorText = await res.text().catch(() => "Erro desconhecido");
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: `Erro: ${res.status} — ${errorText}`,
          timestamp: new Date().toISOString(),
        };
        const finalMessages = [...newMessages, assistantMsg];
        setMessages(finalMessages);
        saveHistory(chatOpen.id, finalMessages);
        setStreamingContent(null);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        // Handle SSE format (data: ...) or plain text
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              // Try JSON SSE
              const parsed = JSON.parse(data);
              const text = parsed.choices?.[0]?.delta?.content
                ?? parsed.delta?.text
                ?? parsed.content
                ?? parsed.text
                ?? parsed;
              if (typeof text === "string") accumulated += text;
            } catch {
              // Raw SSE text
              if (data !== "") accumulated += data;
            }
          } else if (line.trim() && !line.startsWith(":")) {
            // Plain text stream
            accumulated += line;
          }
        }

        // If no SSE prefix found, use chunk directly
        if (!chunk.includes("data: ") && !chunk.startsWith("{")) {
          accumulated = accumulated || chunk;
          // Try plain chunk
          if (accumulated === "") accumulated = chunk;
        }

        setStreamingContent(accumulated || chunk);
      }

      const finalContent = accumulated || "[sem resposta]";
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: finalContent,
        timestamp: new Date().toISOString(),
      };
      const finalMessages = [...newMessages, assistantMsg];
      setMessages(finalMessages);
      saveHistory(chatOpen.id, finalMessages);
      setStreamingContent(null);

    } catch (err: any) {
      if (err?.name === "AbortError") return;
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: `Erro de conexão: ${err?.message ?? "desconhecido"}`,
        timestamp: new Date().toISOString(),
      };
      const finalMessages = [...newMessages, assistantMsg];
      setMessages(finalMessages);
      saveHistory(chatOpen.id, finalMessages);
      setStreamingContent(null);
    } finally {
      setSending(false);
    }
  };

  if (!agents.length) {
    return <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">Carregando agentes...</div>;
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {/* ── Moniz card (special, always first) ── */}
        <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 hover:shadow-md transition-shadow">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">👤</span>
                <div>
                  <p className="font-semibold">Moniz</p>
                  <p className="text-xs text-muted-foreground">Product Owner</p>
                </div>
              </div>
              <span className="w-2.5 h-2.5 rounded-full mt-1 shrink-0 bg-green-500" />
            </div>
            <div className="space-y-1.5">
              <Badge className="text-xs bg-green-500 hover:bg-green-500">Ativo</Badge>
              <p className="text-xs text-muted-foreground">
                {monizCreated} cards criados | {monizApprovals} aprovações
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs gap-1.5 border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 cursor-default"
              disabled
            >
              👤 Tu és este
            </Button>
          </CardContent>
        </Card>

        {/* ── Filter out moniz from API agents — card already shown above ── */}
        {agents.filter(agent => agent.id !== "moniz").map(agent => {
          const agentLogs = logs[agent.id] ?? [];
          const alert = needsUpgradeAlert(agent, agentLogs);
          const isHaiku = agent.model?.includes("haiku");

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
                  onClick={() => setChatOpen(agent)}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Chat com {agent.name}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Chat dialog ── */}
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

            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-3">
              {messages.length === 0 && streamingContent === null ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  Nenhuma mensagem. Diz olá!
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      {msg.role === "assistant" && (
                        <span className="text-xl mr-2 mt-1 shrink-0">{chatOpen?.emoji ?? "🤖"}</span>
                      )}
                      <div className={`max-w-[78%] rounded-xl px-3 py-2 text-sm ${msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                      }`}>
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        <p className="text-[10px] opacity-50 mt-1 text-right">
                          {new Date(msg.timestamp).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}

                  {/* Streaming / typing indicator */}
                  {streamingContent !== null && (
                    <div className="flex justify-start">
                      <span className="text-xl mr-2 mt-1 shrink-0">{chatOpen?.emoji ?? "🤖"}</span>
                      <div className="max-w-[78%] bg-muted rounded-xl px-3 py-2 text-sm text-foreground">
                        {streamingContent === "" ? (
                          // Typing animation
                          <div className="flex items-center gap-1 py-1">
                            {[0, 150, 300].map(delay => (
                              <span
                                key={delay}
                                className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce"
                                style={{ animationDelay: `${delay}ms` }}
                              />
                            ))}
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap break-words">{streamingContent}</p>
                        )}
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

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
              <p className="text-[10px] text-muted-foreground mt-1.5">Enter para enviar · histórico local</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
