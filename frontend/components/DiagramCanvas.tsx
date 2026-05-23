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

import { iconMetaFor } from "@/components/GcpIcons";
import { useStore } from "@/lib/store";
import type { DiagramEdge as DiagramEdgeT, DiagramNode } from "@/lib/types";

type RFNode = Node<{ raw: DiagramNode; highlighted: boolean; selected: boolean }>;

function ResourceNode({ data, selected }: NodeProps<RFNode>) {
  const raw = data.raw;
  const meta = iconMetaFor(raw.kind);
  const Icon = meta.icon;
  const ghost = !!raw.proposed;
  const highlighted = data.highlighted;
  const isSub = !!raw.parent_id;

  return (
    <div
      className={[
        "rounded-xl border bg-canvas-panel text-white shadow-lg transition-all",
        isSub ? "min-w-[150px]" : "min-w-[200px]",
        ghost ? "border-dashed opacity-80" : "border-canvas-border",
        highlighted ? "ring-2 ring-canvas-warn animate-pulse" : "",
        selected ? "outline outline-2 outline-canvas-accent" : "",
      ].join(" ")}
      style={{ borderColor: highlighted ? "#FBBC04" : undefined }}
    >
      <Handle type="target" position={Position.Top} className="!bg-canvas-border" />
      <div className={["flex items-center gap-2.5", isSub ? "px-2 py-1.5" : "px-3 py-2.5"].join(" ")}>
        <div className="shrink-0">
          <Icon size={isSub ? 22 : 28} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={["font-medium truncate", isSub ? "text-xs" : "text-sm"].join(" ")}>{raw.label}</div>
          {raw.subtitle ? (
            <div className={["text-gray-400 truncate", isSub ? "text-[10px]" : "text-xs"].join(" ")}>
              {raw.subtitle}
            </div>
          ) : null}
        </div>
        {raw.status && !isSub ? (
          <span
            className={[
              "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0",
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

const X_SPACING = 250;
const Y_SPACING = 140;
const SUB_RADIUS_X = 220;
const SUB_RADIUS_Y = 80;

function layoutNodes(
  nodes: DiagramNode[],
  highlightedIds: string[],
  selectedId: string | null,
): RFNode[] {
  // Phase 1: primary (non-sub) nodes laid out in horizontal layers by kind.
  const primaries = nodes.filter((n) => !n.parent_id);
  const subs = nodes.filter((n) => n.parent_id);

  const layers = new Map<number, DiagramNode[]>();
  for (const n of primaries) {
    const layer = iconMetaFor(n.kind).layer;
    if (!layers.has(layer)) layers.set(layer, []);
    layers.get(layer)!.push(n);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const out: RFNode[] = [];
  const sortedLayers = [...layers.keys()].sort((a, b) => a - b);
  sortedLayers.forEach((layer, layerIdx) => {
    const items = layers.get(layer)!;
    const offset = (items.length - 1) / 2;
    items.forEach((n, idx) => {
      const pos = { x: (idx - offset) * X_SPACING, y: layerIdx * Y_SPACING };
      positions.set(n.id, pos);
      out.push({
        id: n.id,
        type: "resource",
        position: pos,
        data: {
          raw: n,
          highlighted: highlightedIds.includes(n.id) || highlightedIds.includes(n.label),
          selected: n.id === selectedId,
        },
      });
    });
  });

  // Phase 2: sub-nodes orbit their parent (top-right arc), grouped per parent.
  const subsByParent = new Map<string, DiagramNode[]>();
  for (const s of subs) {
    const arr = subsByParent.get(s.parent_id!) ?? [];
    arr.push(s);
    subsByParent.set(s.parent_id!, arr);
  }
  for (const [parentId, siblings] of subsByParent) {
    const parentPos = positions.get(parentId);
    if (!parentPos) {
      // Parent not in primaries — fall back to laying these out below their group.
      siblings.forEach((s, i) => {
        out.push({
          id: s.id,
          type: "resource",
          position: { x: i * 180, y: 600 },
          data: { raw: s, highlighted: highlightedIds.includes(s.id), selected: s.id === selectedId },
        });
      });
      continue;
    }
    siblings.forEach((s, i) => {
      const col = i % 2;          // 0 = right column, 1 = far right column
      const row = Math.floor(i / 2);
      const pos = {
        x: parentPos.x + SUB_RADIUS_X + col * 170,
        y: parentPos.y - SUB_RADIUS_Y + row * 70,
      };
      out.push({
        id: s.id,
        type: "resource",
        position: pos,
        data: {
          raw: s,
          highlighted: highlightedIds.includes(s.id) || highlightedIds.includes(s.label),
          selected: s.id === selectedId,
        },
      });
    });
  }

  return out;
}

const EMPTY_NODES: DiagramNode[] = [];
const EMPTY_EDGES: DiagramEdgeT[] = [];
const EMPTY_IDS: string[] = [];

function Inner() {
  // Each selector returns a stable reference: either the array stored on the
  // active Diagram, or one of the module-level EMPTY_* constants. This
  // prevents fresh `?? []` allocations from triggering re-render loops.
  const nodes = useStore((s) => {
    const d = s.diagrams.find((x) => x.id === s.activeDiagramId);
    return d?.nodes ?? EMPTY_NODES;
  });
  const edges = useStore((s) => {
    const d = s.diagrams.find((x) => x.id === s.activeDiagramId);
    return d?.edges ?? EMPTY_EDGES;
  });
  const highlightedIds = useStore((s) => {
    const d = s.diagrams.find((x) => x.id === s.activeDiagramId);
    return d?.highlightedIds ?? EMPTY_IDS;
  });
  const selectedId = useStore((s) => s.selectedNodeId);
  const setSelectedNode = useStore((s) => s.setSelectedNode);

  const rfNodes = useMemo(
    () => layoutNodes(nodes, highlightedIds, selectedId),
    [nodes, highlightedIds, selectedId],
  );
  const rfEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => {
        const isSubEdge = Boolean((e as { sub?: boolean }).sub);
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          animated: false,
          style: {
            stroke: isSubEdge ? "#4b5563" : "#374151",
            strokeWidth: 1.5,
            strokeDasharray: isSubEdge ? "4 3" : undefined,
          },
        };
      }),
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
        nodeColor={(n) => iconMetaFor((n.data as RFNode["data"]).raw.kind).color}
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
