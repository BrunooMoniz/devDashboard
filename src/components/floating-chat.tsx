"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, X, Minus } from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string; timestamp: string };

const AGENT_ID = "main";
const STORAGE_KEY = `chat_history_${AGENT_ID}`;
const AGENT_EMOJI = "🧠";
const AGENT_NAME = "Atlas";

function loadHistory(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(messages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-100)));
  } catch {}
}

export function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load history when opened
  useEffect(() => {
    if (open) {
      setMessages(loadHistory());
      setStreamingContent(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Auto-scroll — scroll directo no container, não scrollIntoView
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamingContent]);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setSending(true);
    setStreamingContent("");
    saveHistory(newMessages);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(`/api/chat/${AGENT_ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.content, history: messages }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.text().catch(() => "Erro desconhecido");
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: `Erro ${res.status}: ${err}`,
          timestamp: new Date().toISOString(),
        };
        const final = [...newMessages, assistantMsg];
        setMessages(final);
        saveHistory(final);
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
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const text =
                parsed.choices?.[0]?.delta?.content ??
                parsed.delta?.text ??
                parsed.content ??
                parsed.text ??
                "";
              if (typeof text === "string") accumulated += text;
            } catch {
              if (data) accumulated += data;
            }
          } else if (line.trim() && !line.startsWith(":") && !line.startsWith("event:")) {
            // Plain text fallback
            if (!chunk.includes("data: ")) accumulated += line;
          }
        }

        setStreamingContent(accumulated || chunk);
      }

      const finalContent = accumulated || "[sem resposta]";
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: finalContent,
        timestamp: new Date().toISOString(),
      };
      const final = [...newMessages, assistantMsg];
      setMessages(final);
      saveHistory(final);
      setStreamingContent(null);
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: `Erro de conexão: ${err?.message ?? "desconhecido"}`,
        timestamp: new Date().toISOString(),
      };
      const final = [...newMessages, assistantMsg];
      setMessages(final);
      saveHistory(final);
      setStreamingContent(null);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center text-2xl"
          title="Chat com Atlas"
          aria-label="Abrir chat com Atlas"
        >
          {AGENT_EMOJI}
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-6 right-6 z-50 w-[320px] h-[420px] bg-background border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-primary text-primary-foreground shrink-0">
            <span className="text-xl">{AGENT_EMOJI}</span>
            <div className="flex-1">
              <p className="font-semibold text-sm leading-none">{AGENT_NAME}</p>
              <p className="text-[11px] opacity-80 mt-0.5">Orquestrador</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-white/20 transition-colors"
                title="Minimizar"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  abortRef.current?.abort();
                  setOpen(false);
                }}
                className="p-1 rounded hover:bg-white/20 transition-colors"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3 py-2">
            {messages.length === 0 && streamingContent === null ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                <span className="text-3xl">{AGENT_EMOJI}</span>
                <p className="text-xs text-center">Olá! Sou o Atlas.<br />Como posso ajudar?</p>
              </div>
            ) : (
              <div className="space-y-2">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} gap-1.5`}>
                    {msg.role === "assistant" && (
                      <span className="text-base shrink-0 mt-0.5">{AGENT_EMOJI}</span>
                    )}
                    <div
                      className={`max-w-[82%] rounded-xl px-3 py-1.5 text-xs ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
                      <p className="text-[9px] opacity-50 mt-0.5 text-right">
                        {new Date(msg.timestamp).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Streaming indicator */}
                {streamingContent !== null && (
                  <div className="flex justify-start gap-1.5">
                    <span className="text-base shrink-0 mt-0.5">{AGENT_EMOJI}</span>
                    <div className="max-w-[82%] bg-muted rounded-xl px-3 py-1.5 text-xs text-foreground">
                      {streamingContent === "" ? (
                        <div className="flex items-center gap-1 py-0.5">
                          {[0, 150, 300].map(delay => (
                            <span
                              key={delay}
                              className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
                              style={{ animationDelay: `${delay}ms` }}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{streamingContent}</p>
                      )}
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-3 py-2.5 border-t shrink-0">
            <div className="flex gap-1.5">
              <Input
                ref={inputRef}
                placeholder="Mensagem..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage())}
                disabled={sending}
                className="text-xs h-8"
              />
              <Button
                onClick={sendMessage}
                disabled={!input.trim() || sending}
                size="sm"
                className="h-8 w-8 p-0 shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
