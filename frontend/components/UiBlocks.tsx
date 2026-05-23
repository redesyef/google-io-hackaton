"use client";

import {
  AlertTriangle,
  Boxes,
  Database,
  DollarSign,
  HardDrive,
  Layers3,
  Network,
  Rocket,
  Scan,
  Server,
  TrendingDown,
} from "lucide-react";

import type { UiBlock } from "@/lib/types";

export function UiBlockRenderer({ block }: { block: UiBlock }) {
  switch (block.type) {
    case "inventory":
      return <InventoryCard block={block} />;
    case "cost":
      return <CostCard block={block} />;
    case "optimization":
      return <OptimizationCard block={block} />;
    case "proposal":
      return <ProposalCard block={block} />;
    case "architecture":
      return <ArchitectureCard block={block} />;
    case "context":
      return <ContextCard block={block} />;
    default:
      return null;
  }
}

function Card({ children, accent = "#4285F4" }: { children: React.ReactNode; accent?: string }) {
  return (
    <div
      className="rounded-xl border border-canvas-border bg-canvas-bg/40 backdrop-blur-sm overflow-hidden"
      style={{ borderColor: `${accent}33` }}
    >
      {children}
    </div>
  );
}

function CardHeader({ icon, title, accent }: { icon: React.ReactNode; title: string; accent: string }) {
  return (
    <div className="px-3 py-2 flex items-center gap-2 border-b border-canvas-border/60" style={{ background: `${accent}10` }}>
      <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0" style={{ background: `${accent}22`, color: accent }}>
        {icon}
      </div>
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: accent }}>
        {title}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ inventory */

function InventoryCard({ block }: { block: Extract<UiBlock, { type: "inventory" }> }) {
  const accent = "#34A853";
  const tiles: { label: string; value: number; icon: React.ReactNode }[] = [
    { label: "VMs", value: block.counts.compute, icon: <Server size={13} /> },
    { label: "Buckets", value: block.counts.storage, icon: <HardDrive size={13} /> },
    { label: "SQL", value: block.counts.sql, icon: <Database size={13} /> },
    { label: "LBs", value: block.counts.load_balancer, icon: <Network size={13} /> },
  ];
  return (
    <Card accent={accent}>
      <CardHeader icon={<Boxes size={13} />} title="Inventory snapshot" accent={accent} />
      <div className="px-3 py-2.5">
        <p className="text-[10px] text-gray-500 mb-2">
          Project <span className="text-gray-300 font-mono">{block.project_id}</span>
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-md bg-canvas-panel border border-canvas-border px-2 py-1.5 text-center">
              <div className="text-gray-500 flex items-center justify-center mb-0.5">{t.icon}</div>
              <div className="text-base font-semibold leading-none">{t.value}</div>
              <div className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5">{t.label}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ cost */

function CostCard({ block }: { block: Extract<UiBlock, { type: "cost" }> }) {
  const accent = "#FBBC04";
  const total = block.monthly_estimate_usd;
  const services = Object.entries(block.by_service)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const max = Math.max(...services.map(([, v]) => v), 1);
  return (
    <Card accent={accent}>
      <CardHeader icon={<DollarSign size={13} />} title="Monthly cost" accent={accent} />
      <div className="px-3 py-2.5 space-y-2.5">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-2xl font-semibold" style={{ color: accent }}>
              ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">estimated this month</div>
          </div>
          {block.anomaly_count > 0 && (
            <div className="flex items-center gap-1 text-canvas-warn text-[11px]">
              <AlertTriangle size={11} />
              {block.anomaly_count} anomal{block.anomaly_count === 1 ? "y" : "ies"}
            </div>
          )}
        </div>
        <div className="space-y-1">
          {services.map(([name, value]) => (
            <div key={name} className="text-[11px]">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-gray-400 truncate">{name}</span>
                <span className="text-gray-200 font-mono">${value.toFixed(2)}</span>
              </div>
              <div className="h-1 rounded-full bg-canvas-panel overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(value / max) * 100}%`, background: accent }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ optimization */

function OptimizationCard({ block }: { block: Extract<UiBlock, { type: "optimization" }> }) {
  const accent = "#FBBC04";
  if (!block.suggestions.length) return null;
  return (
    <Card accent={accent}>
      <CardHeader icon={<TrendingDown size={13} />} title={`${block.suggestions.length} optimization${block.suggestions.length === 1 ? "" : "s"}`} accent={accent} />
      <div className="px-3 py-2 space-y-2">
        {block.suggestions.map((s, i) => {
          const sevColor =
            s.severity === "high" ? "#EA4335" : s.severity === "medium" ? "#FBBC04" : "#9AA0A6";
          return (
            <div key={i} className="text-[11px] space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ background: `${sevColor}22`, color: sevColor }}
                >
                  {s.severity}
                </span>
                <span className="font-mono text-gray-300 truncate">{s.target}</span>
              </div>
              <p className="text-gray-400 leading-relaxed pl-1">{s.action}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ proposal */

function ProposalCard({ block }: { block: Extract<UiBlock, { type: "proposal" }> }) {
  const accent = "#EA4335";
  return (
    <Card accent={accent}>
      <CardHeader icon={<Rocket size={13} />} title="Deploy proposal" accent={accent} />
      <div className="px-3 py-2.5 space-y-1.5 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-gray-500">resource</span>
          <span className="font-mono text-gray-200">{block.resource_kind}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500">name</span>
          <span className="font-mono text-gray-200">{block.name}</span>
        </div>
        {Object.entries(block.spec).slice(0, 3).map(([k, v]) => (
          <div key={k} className="flex items-center justify-between">
            <span className="text-gray-500">{k}</span>
            <span className="font-mono text-gray-300 truncate ml-2 max-w-[160px]">
              {typeof v === "object" ? JSON.stringify(v) : String(v)}
            </span>
          </div>
        ))}
        <p className="text-[10px] text-gray-500 pt-1.5 border-t border-canvas-border/60 mt-2">
          Ghost node added to canvas — click it to Apply or Discard.
        </p>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ architecture */

function ArchitectureCard({ block }: { block: Extract<UiBlock, { type: "architecture" }> }) {
  const accent = "#4285F4";
  const layers = [
    { name: "Edge", color: "#4285F4", items: block.layers.edge },
    { name: "Compute", color: "#34A853", items: block.layers.compute },
    { name: "Data", color: "#FBBC04", items: block.layers.data },
    { name: "Attached", color: "#A142F4", items: block.layers.attached },
  ];
  return (
    <Card accent={accent}>
      <CardHeader icon={<Layers3 size={13} />} title="Architecture map" accent={accent} />
      <div className="px-3 py-2.5 space-y-2">
        <p className="text-[11px] text-gray-400">
          <span className="font-semibold text-gray-200">{block.primary_count}</span> primary +{" "}
          <span className="font-semibold text-gray-200">{block.sub_count}</span> attached components rendered in the{" "}
          <span className="font-mono text-canvas-accent">{block.diagram_title}</span> tab.
        </p>
        <div className="space-y-1">
          {layers.map((l) => (
            <div key={l.name} className="flex items-center gap-2 text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: l.color }} />
              <span className="text-gray-400 w-16 shrink-0">{l.name}</span>
              <span className="font-mono text-gray-300">{l.items.length}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ context */

function ContextCard({ block }: { block: Extract<UiBlock, { type: "context" }> }) {
  const accent = "#A142F4";
  return (
    <Card accent={accent}>
      <CardHeader icon={<Scan size={13} />} title="Resource context" accent={accent} />
      <div className="px-3 py-2.5 space-y-1 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-gray-500">{block.resource_kind}</span>
          <span className="font-mono text-gray-200">{block.name}</span>
        </div>
        <p className="text-gray-400">
          <span className="font-semibold text-gray-200">{block.context_items}</span> attached
          components rendered in the{" "}
          <span className="font-mono text-canvas-accent">{block.diagram_title}</span> tab.
        </p>
      </div>
    </Card>
  );
}
