"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KanbanBoard } from "@/components/kanban-board";
import { AgentsPanel } from "@/components/agents-panel";
import { LogsPanel } from "@/components/logs-panel";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";

export default function Home() {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const fetch_ = async () => {
      const res = await fetch("/api/pending");
      const data = await res.json();
      setPendingCount(data.count ?? 0);
    };
    fetch_();
    const i = setInterval(fetch_, 5000);
    return () => clearInterval(i);
  }, []);

  return (
    <main className="min-h-screen bg-background">
      <div className="border-b bg-card px-6 py-4">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              🧠 Dev Dashboard
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Multi-agent software development · Moniz
            </p>
          </div>
          {pendingCount > 0 && (
            <div className="flex items-center gap-2 bg-orange-50 dark:bg-orange-950/50 border border-orange-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-medium text-orange-700 dark:text-orange-400">
                {pendingCount} aprovação{pendingCount > 1 ? "ões" : ""} pendente{pendingCount > 1 ? "s" : ""}
              </span>
              <Badge variant="destructive" className="text-xs h-5 px-1.5">
                {pendingCount}
              </Badge>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-6 py-4">
        <Tabs defaultValue="kanban">
          <TabsList className="mb-4">
            <TabsTrigger value="kanban" className="relative">
              Kanban
              {pendingCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] bg-orange-500 text-white rounded-full font-bold">
                  {pendingCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="agents">Agentes</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="kanban">
            <KanbanBoard />
          </TabsContent>

          <TabsContent value="agents">
            <AgentsPanel />
          </TabsContent>

          <TabsContent value="logs">
            <LogsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
