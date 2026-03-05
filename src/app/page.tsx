"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KanbanBoard } from "@/components/kanban-board";
import { AgentsPanel } from "@/components/agents-panel";
import { LogsPanel } from "@/components/logs-panel";
import { FlowView } from "@/components/flow-view";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";

export default function Home() {
  const [pendingCount, setPendingCount] = useState(0);
  const [filterApproval, setFilterApproval] = useState(false);
  const [activeTab, setActiveTab] = useState("kanban");

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

  const handlePendingClick = () => {
    setActiveTab("kanban");
    setFilterApproval((prev) => !prev);
  };

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
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <button
                onClick={handlePendingClick}
                className={`flex items-center gap-2 border rounded-lg px-3 py-2 transition-all cursor-pointer hover:shadow-sm ${
                  filterApproval
                    ? "bg-yellow-100 border-yellow-400 dark:bg-yellow-900/50"
                    : "bg-orange-50 dark:bg-orange-950/50 border-orange-200 hover:border-orange-400"
                }`}
              >
                <AlertCircle className="w-4 h-4 text-orange-500" />
                <span className={`text-sm font-medium ${filterApproval ? "text-yellow-800 dark:text-yellow-300" : "text-orange-700 dark:text-orange-400"}`}>
                  ⏳ {pendingCount} pendente{pendingCount > 1 ? "s" : ""} de aprovação
                </span>
                <Badge variant="destructive" className="text-xs h-5 px-1.5">
                  {pendingCount}
                </Badge>
                {filterApproval && (
                  <span className="text-[10px] text-yellow-700 font-semibold">· filtrado</span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-6 py-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
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
            <TabsTrigger value="fluxo">🔀 Fluxo</TabsTrigger>
          </TabsList>

          <TabsContent value="kanban">
            <KanbanBoard filterStatus={filterApproval ? "waiting_approval" : undefined} />
          </TabsContent>

          <TabsContent value="agents">
            <AgentsPanel />
          </TabsContent>

          <TabsContent value="logs">
            <LogsPanel />
          </TabsContent>

          <TabsContent value="fluxo">
            <FlowView />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
