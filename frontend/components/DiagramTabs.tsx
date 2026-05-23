"use client";

import { Lock, X } from "lucide-react";

import { useStore } from "@/lib/store";

export default function DiagramTabs() {
  const diagrams = useStore((s) => s.diagrams);
  const activeId = useStore((s) => s.activeDiagramId);
  const setActive = useStore((s) => s.setActiveDiagram);
  const close = useStore((s) => s.closeDiagram);

  if (diagrams.length === 0) return null;

  return (
    <div className="flex items-stretch gap-1 px-3 py-2 border-b border-canvas-border bg-canvas-bg/80 backdrop-blur overflow-x-auto">
      {diagrams.map((d) => {
        const active = d.id === activeId;
        return (
          <div
            key={d.id}
            className={[
              "group flex items-center gap-1.5 rounded-md text-xs cursor-pointer transition shrink-0",
              active
                ? "bg-canvas-panel border border-canvas-accent text-white shadow-[0_0_0_1px_rgba(66,133,244,0.18)]"
                : "border border-canvas-border text-gray-400 hover:text-white hover:border-canvas-accent/60",
            ].join(" ")}
            onClick={() => setActive(d.id)}
          >
            <div className="flex items-center gap-1.5 px-2.5 py-1.5">
              {!d.closeable && <Lock size={9} className="text-gray-500" />}
              <span className="truncate max-w-[200px]">{d.title}</span>
              <span
                className={[
                  "text-[9px] px-1 py-0 rounded",
                  active ? "bg-canvas-accent/20 text-canvas-accent" : "bg-canvas-border/50 text-gray-500",
                ].join(" ")}
              >
                {d.nodes.length}
              </span>
            </div>
            {d.closeable && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  close(d.id);
                }}
                className="px-1.5 py-1.5 text-gray-600 hover:text-canvas-danger transition opacity-0 group-hover:opacity-100"
                title="Close"
              >
                <X size={11} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
