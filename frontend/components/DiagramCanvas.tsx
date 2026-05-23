"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  Edge,
  Handle,
  MiniMap,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import { Cloud, Database, HardDrive, Network, Server } from "lucide-react";

import { useStore } from "@/lib/store";
import type { DiagramNode } from "@/lib/types";

type RFNode = Node<{ raw: DiagramNode; highlighted: boolean; selected: boolean }>;

const KIND_META: Record<
  string,
  { icon: typeof Server; color: string; layer: number }
> = {
  load_balancer: { icon: Network, color: "#4285F4", layer: 0 },
  compute: { icon: Server, color: "#34A853", layer: 1 },
  storage: { icon: HardDrive, color: "#FBBC04", layer: 3 },
  sql: { icon: Database, color: "#EA4335", layer: 2 },
};

function fallbackMeta(kind: string) {
  return { icon: Cloud, color: "#9aa0a6", layer: 2, ...(KIND_META[kind] ?? {}) };
}

function ResourceNode({ data, selected }: NodeProps<RFNode>) {
  const raw = data.raw;
  const meta = fallbackMeta(raw.kind);
  const Icon = meta.icon;
  const ghost = !!raw.proposed;
  const highlighted = data.highlighted;

  return (
    <div
      className={[
        "min-w-[180px] rounded-xl border bg-canvas-panel text-white shadow-lg transition-all",
        ghost ? "border-dashed opacity-80" : "border-canvas-border",
        highlighted ? "ring-2 ring-canvas-warn animate-pulse" : "",
        selected ? "outline outline-2 outline-canvas-accent" : "",
      ].join(" ")}
      style={{ borderColor: highlighted ? "#FBBC04" : undefined }}
    >
      <Handle type="target" position={Position.Top} className="!bg-canvas-border" />
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div
          className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${meta.color}22`, color: meta.color }}
        >
          <Icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{raw.label}</div>
          {raw.subtitle ? (
            <div className="text-xs text-gray-400 truncate">{raw.subtitle}</div>
          ) : null}
        </div>
        {raw.status ? (
          <span
            className={[
              "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded",
              raw.status === "RUNNING" || raw.status === "RUNNABLE"
                ? "bg-canvas-accent2/20 text-canvas-accent2"
                : raw.status === "PROPOSED"
                ? "bg-canvas-warn/20 text-canvas-warn"
                : "bg-gray-500/20 text-gray-300",
            ].join(" ")}
          >
            {raw.status}
          </span>
        ) : null}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-canvas-border" />
    </div>
  );
}

const nodeTypes = { resource: ResourceNode };

function layoutNodes(nodes: DiagramNode[], highlightedIds: string[], selectedId: string | null): RFNode[] {
  const layers = new Map<number, DiagramNode[]>();
  for (const n of nodes) {
    const layer = fallbackMeta(n.kind).layer;
    if (!layers.has(layer)) layers.set(layer, []);
    layers.get(layer)!.push(n);
  }

  const out: RFNode[] = [];
  const X_SPACING = 240;
  const Y_SPACING = 140;

  const sortedLayers = [...layers.keys()].sort((a, b) => a - b);
  sortedLayers.forEach((layer) => {
    const items = layers.get(layer)!;
    const offset = (items.length - 1) / 2;
    items.forEach((n, idx) => {
      out.push({
        id: n.id,
        type: "resource",
        position: { x: (idx - offset) * X_SPACING, y: layer * Y_SPACING },
        data: {
          raw: n,
          highlighted: highlightedIds.includes(n.id) || highlightedIds.includes(n.label),
          selected: n.id === selectedId,
        },
      });
    });
  });
  return out;
}

function Inner() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const highlightedIds = useStore((s) => s.highlightedIds);
  const selectedId = useStore((s) => s.selectedNodeId);
  const setSelectedNode = useStore((s) => s.setSelectedNode);

  const rfNodes = useMemo(
    () => layoutNodes(nodes, highlightedIds, selectedId),
    [nodes, highlightedIds, selectedId],
  );
  const rfEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        animated: false,
        style: { stroke: "#374151", strokeWidth: 1.5 },
      })),
    [edges],
  );

  if (nodes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <div className="text-center space-y-2">
          <p className="text-sm uppercase tracking-widest text-gray-600">Live diagram</p>
          <p>Ask the orchestrator to inspect your infrastructure to populate this canvas.</p>
        </div>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, n) => setSelectedNode(n.id === selectedId ? null : n.id)}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1f2937" />
      <Controls className="!bg-canvas-panel !border-canvas-border [&_button]:!bg-canvas-panel [&_button]:!border-canvas-border [&_button]:!text-white" />
      <MiniMap
        nodeColor={(n) => fallbackMeta((n.data as RFNode["data"]).raw.kind).color}
        maskColor="rgba(11, 15, 23, 0.85)"
        className="!bg-canvas-panel !border !border-canvas-border"
      />
    </ReactFlow>
  );
}

export default function DiagramCanvas() {
  return (
    <ReactFlowProvider>
      <Inner />
    </ReactFlowProvider>
  );
}
