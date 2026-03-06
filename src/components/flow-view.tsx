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
  getBezierPath,
  getSmoothStepPath,
  type EdgeProps,
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

// ─── Layout — vertical top-down hierárquico ───────────────────────────────────
//
//          Atlas         x:500  y:0
//          Iris (PM)     x:500  y:200
//          Orion         x:500  y:380
//   Pixel  x:250  y:560      Forge  x:750  y:560
// Reviewer x:150  y:740  QA x:500  y:740  DevOps x:850  y:740

const AGENT_POSITIONS: Record<string, { x: number; y: number }> = {
  //  Layout top-down linear com paralelos lado a lado:
  //
  //          👤 Moniz       x:600  y:0
  //          🧠 Atlas       x:600  y:220
  //    📋 Iris  x:370       🏗 Orion  x:830   y:440
  //  🎨Pixel x:260          ⚙️Forge x:700     y:660
  //          👁️ Argus       x:600  y:880
  //          🔍 Lyra        x:600  y:1100
  //          🚀 Vega        x:600  y:1320
  //
  moniz:     { x: 600, y:    0 }, // Moniz — topo centro
  main:      { x: 600, y:  220 }, // Atlas — centro
  pm:        { x: 370, y:  440 }, // Iris — esquerda
  architect: { x: 830, y:  440 }, // Orion — direita
  frontend:  { x: 260, y:  660 }, // Pixel — esquerda
  backend:   { x: 700, y:  660 }, // Forge — direita
  reviewer:  { x: 600, y:  880 }, // Argus — centro
  qa:        { x: 600, y: 1100 }, // Lyra — centro
  devops:    { x: 600, y: 1320 }, // Vega — centro
};

function getPosition(id: string, index: number): { x: number; y: number } {
  if (AGENT_POSITIONS[id]) return AGENT_POSITIONS[id];
  return { x: 100 + index * 220, y: 900 };
}

// ─── Edge type resolution ─────────────────────────────────────────────────────

function resolveEdgeType(e: FlowEdgeData): "active" | "recent" | "planned" {
  if (e.type === "active" || e.type === "recent" || e.type === "planned") return e.type;
  if (e.status === "in_progress") return "active";
  if (e.status === "done") return "recent";
  return "planned";
}

// ─── Edge label — só mostra se for 1–2 palavras ───────────────────────────────

function shortLabel(label: string, priority?: string): string | undefined {
  if (priority === "critical") return "🔴 critical";
  if (!label) return undefined;
  const words = label.trim().split(/\s+/);
  if (words.length <= 2) return label;
  return undefined;
}

// ─── Model pill ───────────────────────────────────────────────────────────────

function modelLabel(model?: string): string {
  if (!model) return "";
  if (model.includes("haiku")) return "⚡ Haiku";
  if (model.includes("sonnet")) return "🧠 Sonnet";
  if (model.includes("opus")) return "💎 Opus";
  return model.split("-")[0];
}

// ─── Custom Node ──────────────────────────────────────────────────────────────

interface AgentNodeData extends FlowAgent {
  activity?: AgentActivity | null;
}

function AgentNode({ data }: NodeProps) {
  const d = data as unknown as AgentNodeData;
  const isMoniz = d.id === "moniz";
  const isWorking = d.status === "working";
  const isError   = d.status === "error";
  const isOffline = d.status === "offline";

  // Status dot colour
  const dotClass = isMoniz
    ? "bg-green-500"
    : isWorking
    ? "bg-emerald-500 animate-pulse"
    : isError
    ? "bg-red-500"
    : isOffline
    ? "bg-slate-400"
    : "bg-slate-400";

  const statusText = isMoniz ? "Active" : isWorking ? "Working" : isError ? "Error" : isOffline ? "Offline" : "Idle";

  // Border accent
  const borderStyle = isMoniz
    ? "border-amber-400"
    : isWorking
    ? "border-emerald-300"
    : isError
    ? "border-red-300"
    : "border-slate-300";

  const bgColor = isMoniz ? "#fffbeb" : "#f8fafc";

  return (
    <div
      style={{
        width: 220,
        minHeight: 120,
        background: bgColor,
        borderRadius: 12,
        border: `1.5px solid`,
        boxShadow: isMoniz
          ? "0 2px 12px rgba(245,158,11,0.15), 0 1px 3px rgba(0,0,0,0.08)"
          : "0 2px 12px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.08)",
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        color: "#1e293b",
        position: "relative",
      }}
      className={borderStyle}
    >
      {/* Handles — top (target), bottom (source), left/right (rejeição) */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "#94a3b8", width: 8, height: 8, border: "2px solid #f8fafc" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: "#94a3b8", width: 8, height: 8, border: "2px solid #f8fafc" }}
      />
      <Handle
        id="left"
        type="source"
        position={Position.Left}
        style={{ background: "#ef4444", width: 7, height: 7, border: "2px solid #f8fafc" }}
      />
      <Handle
        id="left"
        type="target"
        position={Position.Left}
        style={{ background: "#ef4444", width: 7, height: 7, border: "2px solid #f8fafc" }}
      />

      {/* Header: emoji + name */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 28, lineHeight: 1, userSelect: "none" }}>{d.emoji ?? "🤖"}</span>
        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "#1e293b",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 130,
          }}
        >
          {d.label}
        </span>
      </div>

      {/* Role */}
      <span style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.2 }}>{d.role}</span>

      {/* Status badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
        <span
          className={dotClass}
          style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, display: "inline-block" }}
        />
        <span style={{ fontSize: 11, color: "#475569" }}>{statusText}</span>
      </div>

      {/* Current task */}
      {d.currentTask && (
        <div
          style={{
            fontSize: 11,
            color: "#64748b",
            lineHeight: 1.3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginTop: 1,
          }}
          title={d.currentTask}
        >
          📌 {d.currentTask}
        </div>
      )}

      {/* Model */}
      {d.model && (
        <span style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>
          {modelLabel(d.model)}
        </span>
      )}
    </div>
  );
}

// ─── Custom Edges ─────────────────────────────────────────────────────────────

function ActiveEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, markerEnd, data, style } = props;
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: 0.4 });
  const eData = data as unknown as FlowEdgeData | undefined;
  const displayLabel = label ? shortLabel(label as string, eData?.priority) : undefined;
  const customColor = (style as any)?.stroke ?? "#6366f1";
  const customWidth = (style as any)?.strokeWidth ?? 4;

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: customColor,
          strokeWidth: customWidth,
          filter: `drop-shadow(0 0 4px ${customColor}80)`,
        }}
      />
      {displayLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              position: "absolute",
              pointerEvents: "none",
              padding: "2px 6px",
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600,
              background: "rgba(238,240,255,0.95)",
              color: "#4338ca",
              border: "1px solid #a5b4fc",
            }}
            className="nodrag nopan"
          >
            {displayLabel}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function RecentEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd } = props;
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: 0.4 });

  return (
    <BaseEdge
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        stroke: "#22c55e",
        strokeWidth: 2,
        strokeDasharray: "6,3",
      }}
    />
  );
}

function PlannedEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, label, style } = props;
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: 0.4 });
  const customColor = (style as any)?.stroke ?? "#94a3b8";
  const customWidth = (style as any)?.strokeWidth ?? 1.5;
  const displayLabel = label ? shortLabel(label as string, undefined) : undefined;

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: customColor,
          strokeWidth: customWidth,
          strokeDasharray: "8,5",
          opacity: 0.7,
        }}
      />
      {displayLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              position: "absolute",
              pointerEvents: "none",
              padding: "2px 6px",
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600,
              background: "rgba(255,251,235,0.95)",
              color: "#92400e",
              border: "1px solid #fcd34d",
            }}
            className="nodrag nopan"
          >
            {displayLabel}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// ─── Static Idle Edges ────────────────────────────────────────────────────────
// Mostrados quando a API retorna 0 edges (sistema idle)

const STATIC_IDLE_EDGES: Edge[] = [
  // Moniz → Atlas (active, amber)
  {
    id: "idle-moniz-main",
    source: "moniz",
    target: "main",
    label: "delega",
    type: "active",
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#f59e0b", width: 18, height: 18 },
    style: { stroke: "#f59e0b", strokeWidth: 3 },
    data: {} as Record<string, unknown>,
  },
  // Atlas → Iris (planned, cinza)
  {
    id: "idle-main-pm",
    source: "main",
    target: "pm",
    type: "planned",
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8", width: 18, height: 18 },
    data: {} as Record<string, unknown>,
  },
  // Atlas → Orion (planned, cinza)
  {
    id: "idle-main-architect",
    source: "main",
    target: "architect",
    type: "planned",
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8", width: 18, height: 18 },
    data: {} as Record<string, unknown>,
  },
  // Iris → Pixel (planned, cinza)
  {
    id: "idle-pm-frontend",
    source: "pm",
    target: "frontend",
    type: "planned",
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8", width: 18, height: 18 },
    data: {} as Record<string, unknown>,
  },
  // Iris → Forge (planned, cinza)
  {
    id: "idle-pm-backend",
    source: "pm",
    target: "backend",
    type: "planned",
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8", width: 18, height: 18 },
    data: {} as Record<string, unknown>,
  },
  // Orion → Pixel (planned, cinza)
  {
    id: "idle-architect-frontend",
    source: "architect",
    target: "frontend",
    type: "planned",
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8", width: 18, height: 18 },
    data: {} as Record<string, unknown>,
  },
  // Orion → Forge (planned, cinza)
  {
    id: "idle-architect-backend",
    source: "architect",
    target: "backend",
    type: "planned",
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8", width: 18, height: 18 },
    data: {} as Record<string, unknown>,
  },
  // Pixel → Argus (planned, cinza)
  {
    id: "idle-frontend-reviewer",
    source: "frontend",
    target: "reviewer",
    type: "planned",
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8", width: 18, height: 18 },
    data: {} as Record<string, unknown>,
  },
  // Forge → Argus (planned, cinza)
  {
    id: "idle-backend-reviewer",
    source: "backend",
    target: "reviewer",
    type: "planned",
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8", width: 18, height: 18 },
    data: {} as Record<string, unknown>,
  },
  // Argus → Lyra (planned, cinza)
  {
    id: "idle-reviewer-qa",
    source: "reviewer",
    target: "qa",
    type: "planned",
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8", width: 18, height: 18 },
    data: {} as Record<string, unknown>,
  },
  // Lyra → Vega (planned, cinza)
  {
    id: "idle-qa-devops",
    source: "qa",
    target: "devops",
    type: "planned",
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8", width: 18, height: 18 },
    data: {} as Record<string, unknown>,
  },
];

// ─── Rejection Edges (lateral esquerda) ──────────────────────────────────────
// Overlay estático sempre visível: Argus→Pixel e Lyra→Pixel pela lateral

const REJECTION_OVERLAY_EDGES: Edge[] = [
  // Argus → Pixel (rejeição, vermelho)
  {
    id: "reject-reviewer-frontend",
    source: "reviewer",
    target: "frontend",
    sourceHandle: "left",
    targetHandle: "left",
    label: "🔴 rejeição",
    type: "rejection",
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#ef4444", width: 16, height: 16 },
    data: { color: "#ef4444", dash: "8,4" } as Record<string, unknown>,
  },
  // Lyra → Pixel (re-test, laranja)
  {
    id: "retest-qa-frontend",
    source: "qa",
    target: "frontend",
    sourceHandle: "left",
    targetHandle: "left",
    label: "🟠 re-test",
    type: "rejection",
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#f97316", width: 16, height: 16 },
    data: { color: "#f97316", dash: "8,4" } as Record<string, unknown>,
  },
];

// ─── Rejection Edge Component ─────────────────────────────────────────────────

function RejectionEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, markerEnd, data } = props;
  const eData = data as { color?: string; dash?: string } | undefined;
  const color = eData?.color ?? "#ef4444";
  const dash = eData?.dash ?? "8,4";

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 20,
    offset: 80,
  });

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth: 2,
          strokeDasharray: dash,
          opacity: 0.85,
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              position: "absolute",
              pointerEvents: "none",
              padding: "2px 7px",
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600,
              background: "rgba(255,255,255,0.95)",
              color,
              border: `1px solid ${color}60`,
              whiteSpace: "nowrap",
            }}
            className="nodrag nopan"
          >
            {label as string}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { agent: AgentNode };
const edgeTypes = { active: ActiveEdge, recent: RecentEdge, planned: PlannedEdge, rejection: RejectionEdge };

// ─── Converters ───────────────────────────────────────────────────────────────

function toRFNodes(agents: FlowAgent[], activity: Record<string, AgentActivity> = {}): Node[] {
  const nodeList = agents.map((a, i) => ({
    id: a.id,
    type: "agent",
    position: getPosition(a.id, i),
    data: { ...a, activity: activity[a.id] ?? null },
    draggable: true,
  }));

  // Inject Moniz node if not already in API data
  if (!agents.find((a) => a.id === "moniz")) {
    nodeList.unshift({
      id: "moniz",
      type: "agent",
      position: AGENT_POSITIONS.moniz,
      data: {
        id: "moniz",
        label: "Moniz",
        role: "Product Owner",
        emoji: "👤",
        status: "idle" as const,
        model: undefined,
        currentTask: undefined,
        lastSeen: new Date().toISOString(),
        activity: null,
      } as any,
      draggable: true,
    });
  }

  return nodeList;
}

function toRFEdges(rawEdges: FlowEdgeData[]): Edge[] {
  return rawEdges.map((e) => {
    const edgeType = resolveEdgeType(e);
    const isActive = edgeType === "active";
    const markerColor =
      edgeType === "active" ? "#6366f1" :
      edgeType === "recent" ? "#22c55e" :
      "#94a3b8";

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
        width: 18,
        height: 18,
      },
      data: e as unknown as Record<string, unknown>,
    };
  });
}

// ─── Legend ────────────────────────────────────────────────────────────────────

function FlowLegend() {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: 16,
        zIndex: 10,
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(6px)",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 7,
        pointerEvents: "none",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      {/* Active */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <svg width={28} height={4}>
          <line x1={0} y1={2} x2={28} y2={2} stroke="#6366f1" strokeWidth={4} />
        </svg>
        <span style={{ fontSize: 11, color: "#475569" }}>A acontecer agora</span>
      </div>
      {/* Recent */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <svg width={28} height={4}>
          <line x1={0} y1={2} x2={28} y2={2} stroke="#22c55e" strokeWidth={2} strokeDasharray="6,3" />
        </svg>
        <span style={{ fontSize: 11, color: "#475569" }}>Concluído recentemente</span>
      </div>
      {/* Planned */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <svg width={28} height={4}>
          <line x1={0} y1={2} x2={28} y2={2} stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="8,5" opacity={0.6} />
        </svg>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>Planeado</span>
      </div>
    </div>
  );
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function StatsCounter({ stats }: { stats: FlowStats }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        zIndex: 10,
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(6px)",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: "8px 14px",
        display: "flex",
        alignItems: "center",
        gap: 6,
        pointerEvents: "none",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        fontSize: 12,
        color: "#64748b",
      }}
    >
      <span style={{ color: "#6366f1", fontWeight: 700 }}>{stats.active}</span>
      <span>activos</span>
      <span style={{ color: "#cbd5e1" }}>·</span>
      <span style={{ color: "#22c55e", fontWeight: 700 }}>{stats.recent}</span>
      <span>recentes</span>
      <span style={{ color: "#cbd5e1" }}>·</span>
      <span style={{ color: "#94a3b8", fontWeight: 700 }}>{stats.planned}</span>
      <span>planeados</span>
    </div>
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

      const rfNodes = toRFNodes(data.nodes ?? [], data.agentActivity ?? {});
      const rawEdges = data.edges ?? [];

      // Feature 1: se não há edges reais (sistema idle), usa estrutura estática
      let rfEdges: Edge[];
      if (rawEdges.length === 0) {
        rfEdges = [...STATIC_IDLE_EDGES];
      } else {
        rfEdges = toRFEdges(rawEdges);

        // Inject Moniz ↔ Atlas edges if not already present (só com edges reais)
        const hasMonizAtlas = rfEdges.find((e) => e.source === "moniz" && e.target === "main");
        const hasAtlasMoniz = rfEdges.find((e) => e.source === "main" && e.target === "moniz");

        if (!hasMonizAtlas) {
          rfEdges.push({
            id: "moniz-to-main",
            source: "moniz",
            target: "main",
            label: "delega",
            type: "active",
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, color: "#f59e0b", width: 18, height: 18 },
            style: { stroke: "#f59e0b", strokeWidth: 3 },
            data: {} as Record<string, unknown>,
          });
        }
        if (!hasAtlasMoniz) {
          rfEdges.push({
            id: "main-to-moniz",
            source: "main",
            target: "moniz",
            label: "aprovação",
            type: "planned",
            animated: false,
            markerEnd: { type: MarkerType.ArrowClosed, color: "#f59e0b", width: 18, height: 18 },
            style: { stroke: "#f59e0b", strokeWidth: 2, strokeDasharray: "8,5" },
            data: {} as Record<string, unknown>,
          });
        }
      }

      // Feature 2: adiciona edges de rejeição pela lateral (overlay estático sempre)
      // Remove duplicates antes de adicionar
      const rejectionIds = REJECTION_OVERLAY_EDGES.map((e) => e.id);
      const filteredEdges = rfEdges.filter((e) => !rejectionIds.includes(e.id));
      rfEdges = [...filteredEdges, ...REJECTION_OVERLAY_EDGES];

      setNodes(rfNodes);
      setEdges(rfEdges);

      if (data.stats) {
        setStats(data.stats);
      } else {
        setStats({
          active:  rawEdges.filter((e) => resolveEdgeType(e) === "active").length,
          recent:  rawEdges.filter((e) => resolveEdgeType(e) === "recent").length,
          planned: rawEdges.filter((e) => resolveEdgeType(e) === "planned").length,
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
    const interval = setInterval(fetchFlow, 2000);
    return () => clearInterval(interval);
  }, [fetchFlow]);

  return (
    <div
      style={{
        width: "100%",
        height: "calc(100vh - 180px)",
        minHeight: 500,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #e2e8f0",
        background: "#f1f5f9",
        position: "relative",
      }}
    >
      {/* Error banner */}
      {error && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 20,
            background: "rgba(254,242,242,0.95)",
            color: "#dc2626",
            fontSize: 12,
            padding: "6px 14px",
            borderRadius: 999,
            border: "1px solid #fca5a5",
          }}
        >
          ⚠ {error}
        </div>
      )}

      {/* Stats — top right */}
      <StatsCounter stats={stats} />

      {/* Last updated — bottom right */}
      {lastUpdated && (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            right: 16,
            zIndex: 10,
            fontSize: 10,
            color: "#94a3b8",
            pointerEvents: "none",
          }}
        >
          ↻ {lastUpdated.toLocaleTimeString()}
        </div>
      )}

      {/* Legend — bottom left */}
      <FlowLegend />

      {/* Loading */}
      {nodes.length === 0 && !error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          <span style={{ color: "#94a3b8", fontSize: 14 }} className="animate-pulse">
            A carregar agentes…
          </span>
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
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={true}
        zoomOnScroll={true}
        minZoom={0.2}
        maxZoom={2}
        defaultEdgeOptions={{ animated: false }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          color="#cbd5e1"
          gap={24}
          size={1}
          style={{ backgroundColor: "#f1f5f9" }}
        />
        <Controls
          showInteractive={false}
        />
      </ReactFlow>
    </div>
  );
}
