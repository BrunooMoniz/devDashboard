"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Users } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageRole = "user" | "agent";

interface TeamMessage {
  id: string;
  role: MessageRole;
  agentId?: string;
  name: string;
  emoji: string;
  content: string;
  timestamp: string;
}

interface StreamingAgent {
  agentId: string;
  name: string;
  emoji: string;
}

const STORAGE_KEY = "team_chat_history_v1";
const USER_EMOJI = "👤";
const USER_NAME = "Moniz";

function loadHistory(): TeamMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(messages: TeamMessage[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-200)));
  } catch {}
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TeamChat() {
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [waitingAgents, setWaitingAgents] = useState<StreamingAgent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Carrega histórico
  useEffect(() => {
    setMessages(loadHistory());
  }, []);

  // Auto-scroll directo no container
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, waitingAgents]);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;

    const userMsg: TeamMessage = {
      id: crypto.randomUUID(),
      role: "user",
      name: USER_NAME,
      emoji: USER_EMOJI,
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    saveHistory(newMessages);
    setInput("");
    setSending(true);
    setWaitingAgents([{ agentId: "team", name: "Time", emoji: "⏳" }]); // indicador de "a pensar"

    // Prepara histórico para o API
    const historyForApi = newMessages.slice(-20).map(m => ({
      agentId: m.agentId,
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }));

    try {
      const res = await fetch("/api/chat/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.content, history: historyForApi }),
      });

      if (!res.ok || !res.body) {
        setWaitingAgents([]);
        setSending(false);
        return;
      }

      setWaitingAgents([]); // limpa o "a pensar..."

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const collectedMessages: TeamMessage[] = [...newMessages];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (!parsed.agentId || !parsed.content) continue;

            const agentMsg: TeamMessage = {
              id: crypto.randomUUID(),
              role: "agent",
              agentId: parsed.agentId,
              name: parsed.name,
              emoji: parsed.emoji,
              content: parsed.content,
              timestamp: new Date().toISOString(),
            };

            collectedMessages.push(agentMsg);
            setMessages([...collectedMessages]);
            saveHistory(collectedMessages);
          } catch {}
        }
      }
    } catch (err) {
      console.error("Team chat error:", err);
      setWaitingAgents([]);
    } finally {
      setSending(false);
      setWaitingAgents([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const clearHistory = () => {
    setMessages([]);
    saveHistory([]);
  };

  // Agrupa mensagens consecutivas do mesmo agente
  const isNewSpeaker = (msg: TeamMessage, prev?: TeamMessage) =>
    !prev || prev.agentId !== msg.agentId || prev.role !== msg.role;

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Chat do Time</h2>
          <span className="text-xs text-muted-foreground">— os agentes respondem quando têm algo a acrescentar</span>
        </div>
        <button
          onClick={clearHistory}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Limpar
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-xl border bg-card px-4 py-4 space-y-3"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Users className="w-10 h-10 opacity-30" />
            <div className="text-center">
              <p className="text-sm font-medium">Chat com todo o time</p>
              <p className="text-xs mt-1 opacity-70">
                Envia uma mensagem e os agentes relevantes respondem.<br />
                Ex: "Precisamos redesenhar o kanban" → Pixel e Orion respondem.<br />
                "Há um leak de memória na API" → Forge e Lyra respondem.
              </p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => {
              const prev = messages[idx - 1];
              const showSpeaker = isNewSpeaker(msg, prev);
              const isUser = msg.role === "user";

              return (
                <div key={msg.id} className={`flex flex-col ${isUser ? "items-end" : "items-start"} ${!showSpeaker ? "mt-1" : "mt-3"}`}>
                  {showSpeaker && (
                    <div className={`flex items-center gap-1.5 mb-1 ${isUser ? "flex-row-reverse" : ""}`}>
                      <span className="text-base">{msg.emoji}</span>
                      <span className="text-xs font-medium text-muted-foreground">{msg.name}</span>
                      {!isUser && (
                        <span className="text-[10px] text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded-full">
                          {msg.agentId}
                        </span>
                      )}
                    </div>
                  )}
                  <div className={`max-w-[75%] rounded-xl px-3.5 py-2 text-sm ${
                    isUser
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-muted text-foreground rounded-tl-sm"
                  }`}>
                    <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
                    <p className={`text-[10px] mt-1 ${isUser ? "text-right opacity-60" : "opacity-50"}`}>
                      {new Date(msg.timestamp).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            })}

            {/* Indicador "a pensar..." */}
            {waitingAgents.length > 0 && (
              <div className="flex items-start gap-2 mt-3">
                <span className="text-base">⏳</span>
                <div className="bg-muted rounded-xl rounded-tl-sm px-3.5 py-2">
                  <div className="flex items-center gap-1 py-0.5">
                    {[0, 150, 300].map(delay => (
                      <span
                        key={delay}
                        className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                    <span className="text-xs text-muted-foreground ml-1">time a pensar...</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Divisor agentes que responderam */}
      {messages.length > 0 && (() => {
        const lastUserIdx = [...messages].reverse().findIndex(m => m.role === "user");
        const agentsInLastRound = lastUserIdx >= 0
          ? messages.slice(messages.length - lastUserIdx).filter(m => m.role === "agent")
          : [];
        if (agentsInLastRound.length === 0) return null;
        const uniqueAgents = [...new Map(agentsInLastRound.map(m => [m.agentId, m])).values()];
        return (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
            <span>Responderam:</span>
            {uniqueAgents.map(a => (
              <span key={a.agentId} className="flex items-center gap-0.5">
                <span>{a.emoji}</span>
                <span>{a.name}</span>
              </span>
            ))}
          </div>
        );
      })()}

      {/* Input */}
      <div className="mt-3 flex gap-2">
        <Input
          ref={inputRef}
          placeholder="Mensagem para o time... (Enter para enviar)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage())}
          disabled={sending}
          className="text-sm"
        />
        <Button
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          className="shrink-0"
        >
          <Send className="w-4 h-4 mr-1" />
          Enviar
        </Button>
      </div>
    </div>
  );
}
