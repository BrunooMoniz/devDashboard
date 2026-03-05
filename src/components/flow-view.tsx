"use client";

import { useEffect, useCallback, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlowAgent {
  id: string;
  label: string;
  role: string;
  emoji: string;
  status: "idle" | "working" | "error" | "offline";
  model?: string;
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  status: "pending" | "in_progress" | "done" | "blocked";
  priority?: "low" | "medium" | "high" | "critical";
}

interface FlowData {
  nodes: FlowAgent[];
  edges: FlowEdge[];
}

// ─── Fixed layout positions ────────────────────────────────────────────────────
// Arranged in a hub-and-spoke: orchestrator at center, agents around it

const AGENT_POSITIONS: Record<string, { x: number; y: number }> = {
  main:       { x: 480, y: 240 },
  pm:         { x: 200, y:  60 },
  architect:  { x: 760, y:  60 },
  frontend:   { x: 100, y: 280 },
  backend:    { x: 860, y: 280 },
  devops:     { x: 200, y: 460 },
  qa:         { x: 760, y: 460 },
  reviewer:   { x: 480, y: 500 },
};

function getPosition(id: string, index: number) {
  if (AGENT_POSITIONS[id]) return AGENT_POSITIONS[id];
  // Fallback: distribute in a circle
  const angle = (index / 8) * 2 * Math.PI;
  return {
    x: 480 + Math.cos(angle) * 320,
    y: 260 + Math.sin(angle) * 200,
  };
}

// ─── Status helpers ────────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  working:  "bg-emerald-500",
  idle:     "bg-slate-400",
  error:    "bg-red-500",
  offline:  "bg-slate-600",
};

const statusRing: Record<string, string> = {
  working: "ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-900",
  error:   "ring-2 ring-red-400 ring-offset-2 ring-offset-slate-900",
  idle:    "",
  offline: "",
};

const edgeStatusColor: Record<string, string> = {
  in_progress: "#10b981",
  pending:     "#f59e0b",
  done:        "#64748b",
  blocked:     "#ef4444",
};

const priorityStroke: Record<string, string> = {
  critical: "8 2",
  high:     "6 3",
  medium:   "4 4",
  low:      "2 6",
};

// ─── Custom Node ──────────────────────────────────────────────────────────────

function AgentNode({ data }: NodeProps) {
  const d = data as unknown as FlowAgent;
  const isWorking = d.status === "working";

  return (
    <div
      className={`
        relative flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl
        bg-slate-800 border border-slate-700 shadow-lg min-w-[120px]
        ${statusRing[d.status] ?? ""}
        transition-all duration-300
      `}
    >
      <Handle type="target" position={Position.Top}    style={{ opacity: 0.4 }} />
      <Handle type="target" position={Position.Left}   style={{ opacity: 0.4 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0.4 }} />
      <Handle type="source" position={Position.Right}  style={{ opacity: 0.4 }} />

      {/* Emoji */}
      <span className="text-2xl leading-none select-none">{d.emoji || "🤖"}</span>

      {/* Name + badge */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-sm font-semibold text-white leading-tight">{d.label}</span>
        <span className="text-[10px] text-slate-400">{d.role}</span>
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-1.5 mt-0.5">
        <span
          className={`w-2 h-2 rounded-full ${statusColors[d.status] ?? "bg-slate-400"} ${
            isWorking ? "animate-pulse" : ""
          }`}
        />
        <span className="text-[10px] capitalize text-slate-300">{d.status}</span>
      </div>
    </div>
  );
}

const nodeTypes = { agent: AgentNode };

// ─── Converters ───────────────────────────────────────────────────────────────

function toRFNodes(agents: FlowAgent[]): Node[] {
  return agents.map((a, i) => ({
    id: a.id,
    type: "agent",
    position: getPosition(a.id, i),
    data: { ...a },
  }));
}

function toRFEdges(edges: FlowEdge[]): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: e.status === "in_progress",
    style: {
      stroke: edgeStatusColor[e.status] ?? "#64748b",
      strokeWidth: e.priority === "critical" || e.priority === "high" ? 2.5 : 1.5,
      strokeDasharray: priorityStroke[e.priority ?? "medium"],
    },
    labelStyle: {
      fill: "#e2e8f0",
      fontWeight: 500,
      fontSize: 11,
    },
    labelBgStyle: {
      fill: "#1e293b",
      fillOpacity: 0.9,
      rx: 4,
      ry: 4,
    },
    labelBgPadding: [6, 4] as [number, number],
    markerEnd: { type: MarkerType.ArrowClosed, color: edgeStatusColor[e.status] ?? "#64748b" },
  }));
}

// ─── Main component ────────────────────────────────────────────────────────────

export function FlowView() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchFlow = useCallback(async () => {
    try {
      const res = await fetch("/api/flow");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: FlowData = await res.json();
      setNodes(toRFNodes(data.nodes ?? []));
      setEdges(toRFEdges(data.edges ?? []));
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar fluxo");
    }
  }, [setNodes, setEdges]);

  useEffect(() => {
    fetchFlow();
    const interval = setInterval(fetchFlow, 5000);
    return () => clearInterval(interval);
  }, [fetchFlow]);

  const onConnect = useCallback(
    (params: Parameters<typeof addEdge>[0]) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  return (
    <div className="w-full h-[calc(100vh-200px)] rounded-xl overflow-hidden border border-slate-700 bg-slate-900 relative">
      {error && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-red-900/80 text-red-200 text-xs px-3 py-1.5 rounded-full border border-red-700">
          ⚠ {error} — aguardando endpoint /api/flow
        </div>
      )}

      {lastUpdated && (
        <div className="absolute bottom-3 right-14 z-10 text-[10px] text-slate-500 bg-slate-900/80 px-2 py-1 rounded">
          Actualizado {lastUpdated.toLocaleTimeString()}
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        colorMode="dark"
        defaultEdgeOptions={{
          animated: false,
        }}
      >
        <Background color="#334155" gap={20} size={1} />
        <Controls className="bg-slate-800 border-slate-700 [&>button]:border-slate-700 [&>button]:bg-slate-800 [&>button]:text-slate-300" />
        <MiniMap
          nodeColor={(n) => {
            const s = (n.data as unknown as FlowAgent).status;
            return s === "working" ? "#10b981" : s === "error" ? "#ef4444" : "#475569";
          }}
          maskColor="rgba(15,23,42,0.7)"
          className="bg-slate-800 border border-slate-700 rounded-lg"
        />
      </ReactFlow>

      {nodes.length === 0 && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-slate-500 text-sm animate-pulse">A carregar agentes…</span>
        </div>
      )}
    </div>
  );
}
