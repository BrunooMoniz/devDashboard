"use client";

import { useEffect, useCallback, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  MarkerType,
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  type EdgeProps,
  getBezierPath,
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
  currentTask?: string;
  lastSeen?: string;
}

interface FlowEdgeData {
  id: string;
  source: string;
  target: string;
  label: string;
  type?: "active" | "recent" | "planned";
  priority?: "low" | "medium" | "high" | "critical";
  completedAt?: string;
  // legacy support
  status?: "pending" | "in_progress" | "done" | "blocked";
}

interface AgentActivity {
  level: "info" | "warn" | "error";
  message: string;
  time: string;
}

interface FlowStats {
  active: number;
  recent: number;
  planned: number;
}

interface FlowData {
  nodes: FlowAgent[];
  edges: FlowEdgeData[];
  agentActivity?: Record<string, AgentActivity>;
  stats?: FlowStats;
}

// ─── Layout ───────────────────────────────────────────────────────────────────

const AGENT_POSITIONS: Record<string, { x: number; y: number }> = {
  main:      { x: 420, y: 230 },
  pm:        { x: 140, y:  50 },
  architect: { x: 700, y:  50 },
  frontend:  { x:  50, y: 270 },
  backend:   { x: 790, y: 270 },
  devops:    { x: 140, y: 450 },
  qa:        { x: 700, y: 450 },
  reviewer:  { x: 420, y: 490 },
};

function getPosition(id: string, index: number, total: number) {
  if (AGENT_POSITIONS[id]) return AGENT_POSITIONS[id];
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  return {
    x: 420 + Math.cos(angle) * 320,
    y: 260 + Math.sin(angle) * 210,
  };
}

// ─── Edge type resolution ─────────────────────────────────────────────────────

function resolveEdgeType(e: FlowEdgeData): "active" | "recent" | "planned" {
  if (e.type === "active" || e.type === "recent" || e.type === "planned") return e.type;
  // Legacy mapping
  if (e.status === "in_progress") return "active";
  if (e.status === "done") return "recent";
  return "planned";
}

// ─── Custom Node ──────────────────────────────────────────────────────────────

interface AgentNodeData extends FlowAgent {
  activity?: AgentActivity;
}

const modelLabel = (model?: string): string => {
  if (!model) return "";
  if (model.includes("haiku")) return "⚡ Haiku";
  if (model.includes("sonnet")) return "🧠 Sonnet";
  if (model.includes("opus")) return "💎 Opus";
  return model.split("-")[0];
};

const activityColor: Record<string, string> = {
  info:  "text-blue-400",
  warn:  "text-yellow-400",
  error: "text-red-400",
};

function AgentNode({ data }: NodeProps) {
  const d = data as unknown as AgentNodeData;
  const isWorking = d.status === "working";
  const isError   = d.status === "error";

  const ringClass =
    isWorking ? "ring-2 ring-emerald-400/70 ring-offset-1 ring-offset-slate-900" :
    isError   ? "ring-2 ring-red-400/70 ring-offset-1 ring-offset-slate-900" :
    "";

  const statusDot =
    isWorking ? "bg-emerald-400 animate-pulse" :
    isError   ? "bg-red-400" :
    d.status === "offline" ? "bg-slate-600" :
    "bg-slate-400";

  const activity = d.activity;
  const logColor = activity ? (activityColor[activity.level] ?? "text-slate-400") : "text-slate-400";

  return (
    <div
      className={`
        relative flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl
        bg-slate-800 dark:bg-slate-800 border border-slate-700
        shadow-lg min-w-[130px] max-w-[160px]
        ${ringClass}
        transition-all duration-300
      `}
    >
      {/* Handles — all four sides */}
      <Handle type="target" position={Position.Top}    style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left}   style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right}  style={{ opacity: 0 }} />

      {/* Emoji */}
      <span className="text-[2rem] leading-none select-none">{d.emoji ?? "🤖"}</span>

      {/* Name + Role */}
      <div className="flex flex-col items-center gap-0.5 text-center">
        <span className="text-sm font-semibold text-white leading-tight">{d.label}</span>
        <span className="text-[10px] text-slate-400 leading-tight">{d.role}</span>
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot}`} />
        <span className="text-[10px] capitalize text-slate-300">{d.status}</span>
      </div>

      {/* Model indicator */}
      {d.model && (
        <span className="text-[9px] text-slate-500 leading-none">
          {modelLabel(d.model)}
        </span>
      )}

      {/* Current task */}
      {d.currentTask && (
        <div className="w-full mt-1 px-1.5 py-1 bg-slate-700/60 rounded text-[9px] text-slate-300 truncate border border-slate-600/50">
          {d.currentTask}
        </div>
      )}

      {/* Last activity log */}
      {activity && (
        <div className={`w-full mt-0.5 text-[9px] leading-tight ${logColor} line-clamp-2 text-center`}>
          {activity.message}
        </div>
      )}
    </div>
  );
}

// ─── Custom Edges ─────────────────────────────────────────────────────────────

function ActiveEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, markerEnd } = props;
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: "url(#activeGradient)",
          strokeWidth: 3,
          filter: "drop-shadow(0 0 4px rgba(99,102,241,0.6))",
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
            className="absolute pointer-events-none px-1.5 py-0.5 bg-indigo-950/90 border border-indigo-600/60 rounded text-[9px] text-indigo-200 font-medium max-w-[120px] truncate nodrag nopan"
          >
            {label as string}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function RecentEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, markerEnd } = props;
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: "#22c55e",
          strokeWidth: 1.5,
          strokeDasharray: "5,3",
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
            className="absolute pointer-events-none px-1.5 py-0.5 bg-emerald-950/90 border border-emerald-700/50 rounded text-[9px] text-emerald-300 max-w-[120px] truncate nodrag nopan"
          >
            {label as string}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function PlannedEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, markerEnd } = props;
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: "#64748b",
          strokeWidth: 1.5,
          strokeDasharray: "6,4",
          opacity: 0.5,
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, opacity: 0.6 }}
            className="absolute pointer-events-none px-1.5 py-0.5 bg-slate-900/80 border border-slate-600/40 rounded text-[9px] text-slate-400 max-w-[120px] truncate nodrag nopan"
          >
            {label as string}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { agent: AgentNode };
const edgeTypes = { active: ActiveEdge, recent: RecentEdge, planned: PlannedEdge };

// ─── Converters ───────────────────────────────────────────────────────────────

function toRFNodes(
  agents: FlowAgent[],
  activity: Record<string, AgentActivity> = {}
): Node[] {
  return agents.map((a, i) => ({
    id: a.id,
    type: "agent",
    position: getPosition(a.id, i, agents.length),
    data: { ...a, activity: activity[a.id] ?? null },
    draggable: true,
  }));
}

function toRFEdges(edges: FlowEdgeData[]): Edge[] {
  return edges.map((e) => {
    const edgeType = resolveEdgeType(e);
    const isActive = edgeType === "active";
    const markerColor =
      edgeType === "active" ? "#818cf8" :
      edgeType === "recent" ? "#22c55e" :
      "#64748b";

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: edgeType,
      animated: isActive,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: markerColor,
        width: 16,
        height: 16,
      },
      data: e as unknown as Record<string, unknown>,
    };
  });
}

// ─── Legend ────────────────────────────────────────────────────────────────────

function FlowLegend() {
  return (
    <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-1.5 bg-slate-900/90 dark:bg-slate-900/90 backdrop-blur border border-slate-700 rounded-lg px-3 py-2.5 text-[11px] pointer-events-none">
      <div className="flex items-center gap-2 text-slate-300">
        <span className="w-6 h-0.5 rounded bg-gradient-to-r from-indigo-500 to-violet-500 shadow shadow-indigo-500/50 flex-shrink-0" />
        <span>A acontecer agora</span>
      </div>
      <div className="flex items-center gap-2 text-slate-300">
        <span className="w-6 h-0 border-t border-dashed border-emerald-500 flex-shrink-0" style={{ borderSpacing: "3px" }} />
        <span>Concluído recentemente</span>
      </div>
      <div className="flex items-center gap-2 text-slate-400 opacity-60">
        <span className="w-6 h-0 border-t border-dashed border-slate-500 flex-shrink-0" />
        <span>Planeado</span>
      </div>
    </div>
  );
}

// ─── Stats counter ────────────────────────────────────────────────────────────

function StatsCounter({ stats }: { stats: FlowStats }) {
  return (
    <div className="absolute top-4 right-4 z-10 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-lg px-3 py-1.5 text-[11px] text-slate-300 pointer-events-none flex gap-2">
      <span className="text-indigo-400 font-semibold">{stats.active}</span>
      <span className="text-slate-500">activos</span>
      <span className="text-slate-600">·</span>
      <span className="text-emerald-400 font-semibold">{stats.recent}</span>
      <span className="text-slate-500">recentes</span>
      <span className="text-slate-600">·</span>
      <span className="text-slate-400 font-semibold">{stats.planned}</span>
      <span className="text-slate-500">planeados</span>
    </div>
  );
}

// ─── SVG Gradient defs ────────────────────────────────────────────────────────

function SvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }}>
      <defs>
        <linearGradient id="activeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function FlowView() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [stats, setStats] = useState<FlowStats>({ active: 0, recent: 0, planned: 0 });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchFlow = useCallback(async () => {
    try {
      const res = await fetch("/api/flow");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: FlowData = await res.json();

      setNodes(toRFNodes(data.nodes ?? [], data.agentActivity ?? {}));
      setEdges(toRFEdges(data.edges ?? []));

      if (data.stats) {
        setStats(data.stats);
      } else {
        // Compute from edges if stats not provided
        const edges = data.edges ?? [];
        setStats({
          active:  edges.filter(e => resolveEdgeType(e) === "active").length,
          recent:  edges.filter(e => resolveEdgeType(e) === "recent").length,
          planned: edges.filter(e => resolveEdgeType(e) === "planned").length,
        });
      }

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

  return (
    <div className="w-full h-[calc(100vh-180px)] min-h-[500px] rounded-xl overflow-hidden border border-slate-700 bg-slate-950 relative">
      <SvgDefs />

      {/* Error banner */}
      {error && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-red-950/90 text-red-300 text-xs px-3 py-1.5 rounded-full border border-red-800 backdrop-blur">
          ⚠ {error}
        </div>
      )}

      {/* Stats counter — top right */}
      <StatsCounter stats={stats} />

      {/* Last updated — bottom right */}
      {lastUpdated && (
        <div className="absolute bottom-4 right-4 z-10 text-[10px] text-slate-600 pointer-events-none">
          ↻ {lastUpdated.toLocaleTimeString()}
        </div>
      )}

      {/* Legend — bottom left */}
      <FlowLegend />

      {/* Loading */}
      {nodes.length === 0 && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <span className="text-slate-500 text-sm animate-pulse">A carregar agentes…</span>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }}
        colorMode="dark"
        minZoom={0.3}
        maxZoom={2}
        defaultEdgeOptions={{ animated: false }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          color="#1e293b"
          gap={24}
          size={1}
          style={{ backgroundColor: "#020617" }}
        />
        <Controls
          className="bg-slate-800/80 border-slate-700 [&>button]:border-slate-700 [&>button]:bg-slate-800 [&>button]:text-slate-300 [&>button:hover]:bg-slate-700"
          showInteractive={false}
        />
      </ReactFlow>
    </div>
  );
}
