"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";

import { apiUrl } from "@/lib/api";
import { useStore } from "@/lib/store";

export default function NodeDetailPanel() {
  // Resolve the selected node directly so the selector returns a stable
  // reference (the node object) or null, never a fresh array.
  const node = useStore((s) => {
    if (!s.selectedNodeId) return null;
    const d = s.diagrams.find((x) => x.id === s.activeDiagramId);
    return d?.nodes.find((n) => n.id === s.selectedNodeId) ?? null;
  });
  const setSelectedNode = useStore((s) => s.setSelectedNode);
  const applyDiagramPatch = useStore((s) => s.applyDiagramPatch);
  const [working, setWorking] = useState<"apply" | "discard" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!node) return null;

  async function applyProposal() {
    if (!node) return;
    setWorking("apply");
    setMessage(null);
    try {
      const r = await fetch(apiUrl("/diagram/apply"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ node_id: node.id }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail ?? "apply failed");
      applyDiagramPatch({
        nodes_update: [{ ...node, proposed: false, status: data.status ?? "RUNNING" }],
      });
      setMessage(data.message ?? "Applied.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "apply failed");
    } finally {
      setWorking(null);
    }
  }

  async function discardProposal() {
    if (!node) return;
    setWorking("discard");
    try {
      await fetch(apiUrl("/diagram/discard"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ node_id: node.id }),
      });
      // Remove the node locally from the currently active diagram.
      const active = useStore.getState().diagrams.find(
        (d) => d.id === useStore.getState().activeDiagramId,
      );
      const remaining = (active?.nodes ?? []).filter((n) => n.id !== node.id);
      applyDiagramPatch({ nodes_replace: remaining });
      setSelectedNode(null);
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="absolute bottom-4 right-4 w-80 bg-canvas-panel border border-canvas-border rounded-xl shadow-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-canvas-border flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-gray-500">{node.kind}</p>
          <p className="font-medium truncate">{node.label}</p>
          {node.subtitle && (
            <p className="text-xs text-gray-400 truncate">{node.subtitle}</p>
          )}
        </div>
        <button
          onClick={() => setSelectedNode(null)}
          className="text-gray-500 hover:text-gray-200 transition"
        >
          <X size={14} />
        </button>
      </div>

      {node.meta && Object.keys(node.meta).length > 0 && (
        <div className="px-4 py-3 text-xs space-y-1.5 border-b border-canvas-border max-h-40 overflow-y-auto">
          {Object.entries(node.meta).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <span className="text-gray-500">{k}</span>
              <span className="text-gray-300 font-mono truncate text-right">
                {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </span>
            </div>
          ))}
        </div>
      )}

      {node.proposed && (
        <div className="p-3 flex gap-2">
          <button
            onClick={applyProposal}
            disabled={working !== null}
            className="flex-1 py-1.5 text-xs rounded-md bg-canvas-accent2 text-white hover:opacity-90 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Check size={12} /> {working === "apply" ? "Applying…" : "Apply"}
          </button>
          <button
            onClick={discardProposal}
            disabled={working !== null}
            className="flex-1 py-1.5 text-xs rounded-md border border-canvas-border text-gray-300 hover:bg-canvas-bg transition disabled:opacity-50"
          >
            {working === "discard" ? "Discarding…" : "Discard"}
          </button>
        </div>
      )}

      {message && (
        <div className="px-4 py-2 text-xs text-gray-400 border-t border-canvas-border">
          {message}
        </div>
      )}
    </div>
  );
}
