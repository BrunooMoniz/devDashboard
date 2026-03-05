"use client";

import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { AGENT_INFO } from "@/lib/types";

type Log = {
  id: string;
  agentId: string;
  level: string;
  message: string;
  metadata: string | null;
  createdAt: string;
};

const LEVEL_VARIANTS: Record<string, string> = {
  info: "secondary",
  warn: "default",
  error: "destructive",
  debug: "outline",
};

const LEVEL_COLORS: Record<string, string> = {
  info: "text-blue-500",
  warn: "text-yellow-500",
  error: "text-red-500",
  debug: "text-slate-400",
};

export function LogsPanel() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [filter, setFilter] = useState("all");

  const agents = ["all", "main", "pm", "architect", "frontend", "backend", "devops", "qa", "reviewer"];

  useEffect(() => {
    const fetch_ = async () => {
      const url = filter !== "all" ? `/api/logs?agentId=${filter}&limit=300` : "/api/logs?limit=300";
      const res = await fetch(url);
      setLogs(await res.json());
    };
    fetch_();
    const i = setInterval(fetch_, 3000);
    return () => clearInterval(i);
  }, [filter]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {agents.map((a) => (
          <button
            key={a}
            onClick={() => setFilter(a)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all font-medium ${
              filter === a
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background border-border hover:bg-muted"
            }`}
          >
            {a === "all" ? "Todos" : `${AGENT_INFO[a]?.emoji ?? ""} ${a}`}
          </button>
        ))}
      </div>

      <ScrollArea className="h-[calc(100vh-300px)] rounded-xl border bg-slate-950">
        <div className="p-4 space-y-0.5 font-mono text-xs">
          {logs.length === 0 && (
            <p className="text-slate-500 py-4 text-center">Nenhum log ainda.</p>
          )}
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 py-0.5 hover:bg-white/5 rounded px-1">
              <span className="text-slate-500 shrink-0 tabular-nums">
                {new Date(log.createdAt).toLocaleTimeString("pt-BR")}
              </span>
              <span className="shrink-0">
                {AGENT_INFO[log.agentId]?.emoji ?? "❓"}
              </span>
              <span className="shrink-0 text-slate-400 w-16">{log.agentId}</span>
              <span className={`shrink-0 font-bold uppercase text-[10px] w-8 ${LEVEL_COLORS[log.level] ?? "text-slate-400"}`}>
                {log.level}
              </span>
              <span className="text-slate-200 leading-relaxed">{log.message}</span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
