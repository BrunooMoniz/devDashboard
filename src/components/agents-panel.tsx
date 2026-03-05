"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Agent, timeAgo } from "@/lib/types";
import { MessageCircle, Send } from "lucide-react";

type Log = {
  id: string;
  agentId: string;
  level: string;
  message: string;
  createdAt: string;
};

type ChatMsg = {
  id: string;
  agentId: string;
  direction: "user" | "agent";
  content: string;
  createdAt: string;
};

const STATUS_VARIANTS: Record<string, string> = {
  idle: "secondary",
  working: "default",
  error: "destructive",
  offline: "outline",
};

const STATUS_LABELS: Record<string, string> = {
  idle: "Ocioso",
  working: "Trabalhando",
  error: "Erro",
  offline: "Offline",
};

const STATUS_DOT: Record<string, string> = {
  idle: "bg-slate-400",
  working: "bg-green-500 animate-pulse",
  error: "bg-red-500",
  offline: "bg-slate-200",
};

const LEVEL_COLOR: Record<string, string> = {
  info: "text-blue-500",
  warn: "text-yellow-500",
  error: "text-red-500",
  debug: "text-slate-400",
};

export function AgentsPanel() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [logs, setLogs] = useState<Record<string, Log[]>>({});
  const [chatOpen, setChatOpen] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const lastUserMsgTime = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch agents
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch("/api/agents");
        if (res.ok) setAgents(await res.json());
      } catch {}
    };
    fetch_();
    const i = setInterval(fetch_, 5000);
    return () => clearInterval(i);
  }, []);

  // Fetch logs for all agents
  useEffect(() => {
    if (agents.length === 0) return;
    const fetch_ = async () => {
      try {
        const res = await fetch("/api/logs?limit=100");
        if (!res.ok) return;
        const all: Log[] = await res.json();
        const byAgent: Record<string, Log[]> = {};
        for (const log of all) {
          if (!byAgent[log.agentId]) byAgent[log.agentId] = [];
          byAgent[log.agentId].push(log);
        }
        // Keep last 3 per agent
        for (const id of Object.keys(byAgent)) {
          byAgent[id] = byAgent[id].slice(0, 3);
        }
        setLogs(byAgent);
      } catch {}
    };
    fetch_();
    const i = setInterval(fetch_, 8000);
    return () => clearInterval(i);
  }, [agents]);

  // Fetch chat messages when dialog opens
  useEffect(() => {
    if (!chatOpen) return;
    setTyping(false);
    lastUserMsgTime.current = 0;
    const fetch_ = async () => {
      try {
        const res = await fetch(`/api/agents/${chatOpen.id}/messages`);
        if (!res.ok) return;
        const msgs: ChatMsg[] = await res.json();
        setMessages(msgs);
        // Se a última mensagem é do user e ainda não há resposta do agente depois → typing
        if (msgs.length > 0) {
          const last = msgs[msgs.length - 1];
          const lastAgentIdx = [...msgs].reverse().findIndex((m) => m.direction === "agent");
          const lastUserIdx = [...msgs].reverse().findIndex((m) => m.direction === "user");
          if (lastUserIdx !== -1 && (lastAgentIdx === -1 || lastUserIdx < lastAgentIdx)) {
            setTyping(true);
          } else {
            setTyping(false);
          }
        }
      } catch {}
    };
    fetch_();
    const i = setInterval(fetch_, 2500);
    return () => { clearInterval(i); setTyping(false); };
  }, [chatOpen]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !chatOpen || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/agents/${chatOpen.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: input }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages((prev) => [...prev, msg]);
        setInput("");
        setTyping(true); // mostra typing imediatamente após enviar
        lastUserMsgTime.current = Date.now();
      }
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (agents.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Carregando agentes...
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {agents.map((agent) => {
          const agentLogs = logs[agent.id] ?? [];
          return (
            <Card key={agent.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{agent.emoji ?? "🤖"}</span>
                    <div>
                      <p className="font-semibold">{agent.name}</p>
                      <p className="text-xs text-muted-foreground">{agent.role}</p>
                    </div>
                  </div>
                  <span
                    className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${STATUS_DOT[agent.status] ?? "bg-slate-300"}`}
                  />
                </div>

                {/* Status + model */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      variant={STATUS_VARIANTS[agent.status] as any}
                      className="text-xs"
                    >
                      {STATUS_LABELS[agent.status] ?? agent.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {agent.model?.includes("haiku") ? "⚡ Haiku" : "🧠 Sonnet"}
                    </span>
                  </div>

                  {agent.currentTask && (
                    <p className="text-xs bg-muted rounded px-2 py-1 truncate text-muted-foreground">
                      📌 {agent.currentTask}
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Visto {timeAgo(agent.lastSeen)}
                  </p>
                </div>

                {/* Recent logs */}
                {agentLogs.length > 0 && (
                  <div className="border-t pt-2 space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      Logs recentes
                    </p>
                    {agentLogs.map((log) => (
                      <p
                        key={log.id}
                        className={`text-[10px] leading-tight truncate ${LEVEL_COLOR[log.level] ?? "text-muted-foreground"}`}
                      >
                        [{log.level}] {log.message}
                      </p>
                    ))}
                  </div>
                )}

                {/* Chat button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs gap-1.5"
                  onClick={() => {
                    setMessages([]);
                    setChatOpen(agent);
                  }}
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
      <Dialog
        open={!!chatOpen}
        onOpenChange={(open) => {
          if (!open) setChatOpen(null);
        }}
      >
        <DialogContent className="max-w-lg h-[600px] flex flex-col p-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">{chatOpen?.emoji ?? "🤖"}</span>
              <div>
                <p>{chatOpen?.name}</p>
                <p className="text-xs font-normal text-muted-foreground">
                  {chatOpen?.role}
                </p>
              </div>
              <span
                className={`ml-auto w-2.5 h-2.5 rounded-full ${STATUS_DOT[chatOpen?.status ?? "offline"] ?? "bg-slate-300"}`}
              />
            </DialogTitle>
          </DialogHeader>

          {/* Messages */}
          <ScrollArea className="flex-1 px-4 py-3">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Nenhuma mensagem ainda. Diga olá!
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.direction === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                        msg.direction === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      {msg.direction === "agent" && (
                        <p className="text-[10px] font-semibold mb-0.5 opacity-70">
                          {chatOpen?.name}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      <p className="text-[10px] opacity-50 mt-1 text-right">
                        {timeAgo(msg.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
                {/* Typing indicator */}
                {typing && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-xl px-4 py-3 flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground mr-1">
                        {chatOpen?.name} está a pensar
                      </span>
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Input */}
          <div className="px-4 py-3 border-t shrink-0">
            <div className="flex gap-2">
              <Input
                placeholder={`Mensagem para ${chatOpen?.name ?? "agente"}...`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending}
                className="text-sm"
              />
              <Button
                onClick={sendMessage}
                disabled={!input.trim() || sending}
                size="sm"
                className="shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Enter para enviar · mensagens ficam no banco para o agente responder
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
