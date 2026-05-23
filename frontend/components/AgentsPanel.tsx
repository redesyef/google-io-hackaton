"use client";

import { Boxes, DollarSign, Layers3, Network } from "lucide-react";

import { sendChatMessage } from "@/lib/chat";
import { useStore } from "@/lib/store";
import type { AgentName, AgentRuntime, AgentStatus } from "@/lib/types";

type AgentMeta = {
  name: AgentName;
  label: string;
  description: string;
  icon: typeof Boxes;
  color: string;
  prompt?: string;
  toolsCount: number;
};

const AGENT_META: AgentMeta[] = [
  {
    name: "orchestrator",
    label: "Orchestrator",
    description: "Routes intent",
    icon: Network,
    color: "#4285F4",
    toolsCount: 3,
  },
  {
    name: "inventory",
    label: "Inventory",
    description: "Reads infrastructure",
    icon: Boxes,
    color: "#34A853",
    prompt: "What's currently deployed in this project?",
    toolsCount: 6,
  },
  {
    name: "cost",
    label: "Cost",
    description: "Billing & optimization",
    icon: DollarSign,
    color: "#FBBC04",
    prompt: "Where am I overspending? Suggest concrete optimizations.",
    toolsCount: 2,
  },
];

const ARCHITECTURE_PROMPT =
  "Map the complete architecture. Confirm the layer-1 infrastructure first, " +
  "then expand every resource to show all layers (disks, networks, IAM, " +
  "lifecycle, SSL, WAF, schemas) using the full_architecture_map tool.";

function statusDot(status: AgentStatus, color: string) {
  if (status === "active") {
    return (
      <span
        className="h-1.5 w-1.5 rounded-full animate-pulse"
        style={{ background: color, boxShadow: `0 0 10px ${color}` }}
      />
    );
  }
  if (status === "done") return <span className="h-1.5 w-1.5 rounded-full bg-canvas-accent2" />;
  return <span className="h-1.5 w-1.5 rounded-full bg-gray-700" />;
}

function AgentCard({
  meta,
  runtime,
  onClick,
  streaming,
}: {
  meta: AgentMeta;
  runtime: AgentRuntime;
  onClick?: () => void;
  streaming: boolean;
}) {
  const Icon = meta.icon;
  const active = runtime.status === "active";
  const done = runtime.status === "done";
  const clickable = !!onClick && !streaming;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={[
        "w-full text-left rounded-lg border bg-canvas-panel p-2.5 transition-all group",
        active ? "border-canvas-accent shadow-[0_0_0_2px_rgba(66,133,244,0.18)]" : "border-canvas-border",
        done ? "border-canvas-accent2/40" : "",
        clickable ? "hover:border-canvas-accent/60 hover:bg-canvas-panel/80 cursor-pointer" : "cursor-default",
      ].join(" ")}
    >
      <div className="flex items-center gap-2.5">
        <div
          className={[
            "h-8 w-8 rounded-md flex items-center justify-center shrink-0 transition",
            active ? "animate-pulse" : "",
          ].join(" ")}
          style={{
            background: `${meta.color}22`,
            color: meta.color,
            boxShadow: active ? `0 0 14px ${meta.color}55` : undefined,
          }}
        >
          <Icon size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium truncate">{meta.label}</p>
            {statusDot(runtime.status, meta.color)}
          </div>
          <p className="text-[10px] text-gray-500 leading-tight truncate">
            {active && runtime.lastTool ? (
              <span className="text-canvas-accent font-mono">▶ {runtime.lastTool}</span>
            ) : done ? (
              <span className="text-canvas-accent2/80">
                ✓ {runtime.toolsCalled} {runtime.toolsCalled === 1 ? "call" : "calls"}
              </span>
            ) : (
              meta.description
            )}
          </p>
        </div>
      </div>
      {clickable && meta.prompt && (
        <p className="mt-2 pt-2 border-t border-canvas-border/50 text-[10px] text-gray-500 line-clamp-2 group-hover:text-gray-300 transition">
          {meta.prompt}
        </p>
      )}
    </button>
  );
}

export default function AgentsPanel() {
  const agents = useStore((s) => s.agents);
  const streaming = useStore((s) => s.streaming);
  const anyActive = Object.values(agents).some((a) => a.status === "active");

  function triggerAgent(meta: AgentMeta) {
    if (!meta.prompt) return;
    sendChatMessage(meta.prompt);
  }

  function triggerArchitecture() {
    sendChatMessage(ARCHITECTURE_PROMPT);
  }

  return (
    <aside className="border-r border-canvas-border bg-canvas-bg/60 backdrop-blur w-[200px] hidden lg:flex flex-col h-screen shrink-0">
      <header className="px-3 py-2.5 border-b border-canvas-border shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider">Managed Agents</h3>
          <span
            className={[
              "text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium",
              anyActive
                ? "bg-canvas-accent/15 text-canvas-accent"
                : "border border-canvas-border text-gray-500",
            ].join(" ")}
          >
            {anyActive ? "running" : "idle"}
          </span>
        </div>
        <p className="text-[10px] text-gray-500 mt-1">Click any sub-agent to dispatch.</p>
      </header>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-2 min-h-0">
        {AGENT_META.map((meta) => (
          <AgentCard
            key={meta.name}
            meta={meta}
            runtime={agents[meta.name]}
            streaming={streaming}
            onClick={meta.prompt ? () => triggerAgent(meta) : undefined}
          />
        ))}

        <div className="pt-2 mt-1 border-t border-canvas-border space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 px-0.5">Quick action</p>
          <button
            type="button"
            disabled={streaming}
            onClick={triggerArchitecture}
            className="w-full text-left rounded-lg p-2.5 transition-all group disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-br from-canvas-accent/20 to-canvas-accent2/10 border border-canvas-accent/40 hover:border-canvas-accent hover:from-canvas-accent/30 hover:to-canvas-accent2/20 cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <div
                className="h-8 w-8 rounded-md flex items-center justify-center shrink-0"
                style={{ background: "#4285F433", color: "#4285F4" }}
              >
                <Layers3 size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">Map full architecture</p>
                <p className="text-[10px] text-gray-400 leading-tight truncate">
                  L1 + all sub-layers
                </p>
              </div>
            </div>
            <p className="mt-2 pt-2 border-t border-canvas-accent/20 text-[10px] text-gray-400 line-clamp-2 group-hover:text-gray-200 transition">
              Builds the complete canvas in one shot.
            </p>
          </button>
        </div>
      </div>

      <footer className="px-3 py-2 border-t border-canvas-border text-[9px] text-gray-500 shrink-0">
        Gemini 3.5 Flash · live SSE state
      </footer>
    </aside>
  );
}
