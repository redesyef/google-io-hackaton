"use client";

import { Boxes, DollarSign, Network, Rocket } from "lucide-react";

import { useStore } from "@/lib/store";
import type { AgentName, AgentRuntime, AgentStatus } from "@/lib/types";

type AgentMeta = {
  name: AgentName;
  label: string;
  description: string;
  icon: typeof Boxes;
  color: string;
  tools: string[];
};

const AGENT_META: AgentMeta[] = [
  {
    name: "orchestrator",
    label: "Orchestrator",
    description: "Routes intent to sub-agents",
    icon: Network,
    color: "#4285F4",
    tools: ["delegate_to_inventory", "delegate_to_cost", "delegate_to_deploy"],
  },
  {
    name: "inventory",
    label: "Inventory",
    description: "Reads GCP infrastructure",
    icon: Boxes,
    color: "#34A853",
    tools: ["full_snapshot", "list_compute_instances", "list_buckets", "list_sql_instances", "get_resource_context"],
  },
  {
    name: "cost",
    label: "Cost",
    description: "Billing & optimization",
    icon: DollarSign,
    color: "#FBBC04",
    tools: ["get_billing_summary", "suggest_optimization"],
  },
  {
    name: "deploy",
    label: "Deploy",
    description: "Proposes (never applies)",
    icon: Rocket,
    color: "#EA4335",
    tools: ["propose_deploy"],
  },
];

function statusDot(status: AgentStatus) {
  switch (status) {
    case "active":
      return <span className="h-2 w-2 rounded-full bg-canvas-accent animate-pulse" />;
    case "done":
      return <span className="h-2 w-2 rounded-full bg-canvas-accent2" />;
    default:
      return <span className="h-2 w-2 rounded-full bg-gray-700" />;
  }
}

function AgentCard({ meta, runtime }: { meta: AgentMeta; runtime: AgentRuntime }) {
  const Icon = meta.icon;
  const active = runtime.status === "active";
  const done = runtime.status === "done";

  return (
    <div
      className={[
        "rounded-xl border bg-canvas-panel p-3 transition-all",
        active ? "border-canvas-accent shadow-[0_0_0_3px_rgba(66,133,244,0.18)]" : "border-canvas-border",
        done ? "border-canvas-accent2/40" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={[
            "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 transition",
            active ? "animate-pulse" : "",
          ].join(" ")}
          style={{
            background: `${meta.color}22`,
            color: meta.color,
            boxShadow: active ? `0 0 18px ${meta.color}55` : undefined,
          }}
        >
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{meta.label}</p>
            {statusDot(runtime.status)}
          </div>
          <p className="text-[11px] text-gray-500 leading-tight mt-0.5 truncate">
            {meta.description}
          </p>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-canvas-border text-[10px] text-gray-500 space-y-0.5">
        {active && runtime.lastTool ? (
          <div className="text-canvas-accent font-mono truncate">▶ {runtime.lastTool}</div>
        ) : done ? (
          <div className="text-canvas-accent2/80">
            ✓ {runtime.toolsCalled} {runtime.toolsCalled === 1 ? "tool" : "tools"} called
          </div>
        ) : (
          <div>{meta.tools.length} tools available</div>
        )}
      </div>
    </div>
  );
}

export default function AgentsPanel() {
  const agents = useStore((s) => s.agents);
  const anyActive = Object.values(agents).some((a) => a.status === "active");

  return (
    <aside className="border-r border-canvas-border bg-canvas-bg/60 backdrop-blur w-[230px] hidden xl:flex flex-col h-screen">
      <header className="px-4 py-3 border-b border-canvas-border">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Managed Agents</h3>
          <span
            className={[
              "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded",
              anyActive
                ? "bg-canvas-accent/15 text-canvas-accent"
                : "border border-canvas-border text-gray-500",
            ].join(" ")}
          >
            {anyActive ? "running" : "idle"}
          </span>
        </div>
        <p className="text-[11px] text-gray-500 mt-1">
          Gemini 3.5 Flash · orchestrator + 3 sub-agents
        </p>
      </header>
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {AGENT_META.map((meta) => (
          <AgentCard key={meta.name} meta={meta} runtime={agents[meta.name]} />
        ))}
      </div>
      <footer className="px-4 py-2.5 border-t border-canvas-border text-[10px] text-gray-500">
        State live-updated from the SSE event stream.
      </footer>
    </aside>
  );
}
