"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import ChatPanel from "@/components/ChatPanel";
import DiagramCanvas from "@/components/DiagramCanvas";
import NodeDetailPanel from "@/components/NodeDetailPanel";
import { apiUrl } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { GcpStatus } from "@/lib/types";

export default function ChatPage() {
  const router = useRouter();
  const [status, setStatus] = useState<GcpStatus | null>(null);
  const applyDiagramPatch = useStore((s) => s.applyDiagramPatch);
  const reset = useStore((s) => s.reset);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const r = await fetch(apiUrl("/gcp/status"), { credentials: "include" });
      if (r.status === 401) {
        router.push("/login");
        return;
      }
      const data = (await r.json()) as GcpStatus;
      if (cancelled) return;
      if (!data.configured) {
        router.push("/setup");
        return;
      }
      setStatus(data);
      // Seed the diagram with the current snapshot.
      const snap = await fetch(apiUrl("/gcp/snapshot"), { credentials: "include" });
      if (!snap.ok) return;
      const snapshot = await snap.json();
      const nodes = [
        ...(snapshot.load_balancers ?? []).map((lb: { name: string; ip_address?: string }) => ({
          id: `lb:${lb.name}`,
          kind: "load_balancer" as const,
          label: lb.name,
          subtitle: lb.ip_address ?? "",
        })),
        ...(snapshot.compute ?? []).map((vm: { name: string; machine_type?: string; status?: string }) => ({
          id: `vm:${vm.name}`,
          kind: "compute" as const,
          label: vm.name,
          subtitle: vm.machine_type,
          status: vm.status,
        })),
        ...(snapshot.sql ?? []).map((s: { name: string; tier?: string }) => ({
          id: `sql:${s.name}`,
          kind: "sql" as const,
          label: s.name,
          subtitle: s.tier ?? "",
        })),
        ...(snapshot.storage ?? []).map((b: { name: string; storage_class?: string }) => ({
          id: `bucket:${b.name}`,
          kind: "storage" as const,
          label: b.name,
          subtitle: b.storage_class ?? "",
        })),
      ];
      const edges: { id: string; source: string; target: string }[] = [];
      const lbs = snapshot.load_balancers ?? [];
      const vms = snapshot.compute ?? [];
      const sqls = snapshot.sql ?? [];
      const buckets = snapshot.storage ?? [];
      const web = vms.filter((v: { name: string }) =>
        /web|frontend/i.test(v.name),
      );
      const api = vms.filter((v: { name: string }) => /api|backend/i.test(v.name));
      const webList = web.length ? web : vms;
      for (const lb of lbs) {
        for (const vm of webList) {
          edges.push({ id: `e:${lb.name}->${vm.name}`, source: `lb:${lb.name}`, target: `vm:${vm.name}` });
        }
      }
      for (const vm of webList) {
        for (const av of api) {
          edges.push({ id: `e:${vm.name}->${av.name}`, source: `vm:${vm.name}`, target: `vm:${av.name}` });
        }
        for (const b of buckets) {
          edges.push({ id: `e:${vm.name}->${b.name}`, source: `vm:${vm.name}`, target: `bucket:${b.name}` });
        }
      }
      for (const av of api) {
        for (const s of sqls) {
          edges.push({ id: `e:${av.name}->${s.name}`, source: `vm:${av.name}`, target: `sql:${s.name}` });
        }
      }
      reset();
      applyDiagramPatch({ nodes_replace: nodes, edges_replace: edges });
    }
    load().catch(() => router.push("/login"));
    return () => {
      cancelled = true;
    };
  }, [router, applyDiagramPatch, reset]);

  async function logout() {
    await fetch(apiUrl("/auth/logout"), { method: "POST", credentials: "include" });
    reset();
    router.push("/login");
  }

  async function switchProject() {
    await fetch(apiUrl("/gcp/disconnect"), { method: "POST", credentials: "include" });
    reset();
    router.push("/setup");
  }

  if (!status) {
    return (
      <main className="min-h-screen flex items-center justify-center text-gray-400">
        Loading…
      </main>
    );
  }

  return (
    <main className="h-screen grid grid-cols-1 lg:grid-cols-[440px_1fr] overflow-hidden">
      <aside className="border-r border-canvas-border bg-canvas-panel flex flex-col h-screen">
        <ChatPanel projectId={status.project_id ?? "—"} />
        <div className="flex border-t border-canvas-border text-xs text-gray-500">
          <button
            onClick={switchProject}
            className="flex-1 py-2 hover:text-canvas-accent hover:bg-canvas-bg transition"
            title="Disconnect this project and connect a different one"
          >
            Switch project
          </button>
          <div className="w-px bg-canvas-border" />
          <button
            onClick={logout}
            className="flex-1 py-2 hover:text-gray-300 transition"
          >
            Sign out
          </button>
        </div>
      </aside>
      <section className="bg-canvas-bg h-screen relative">
        <DiagramCanvas />
        <NodeDetailPanel />
        <div className="absolute top-3 right-3 text-[10px] uppercase tracking-wider text-gray-500">
          {status.mode} · {status.project_id} · {status.region}
        </div>
      </section>
    </main>
  );
}
