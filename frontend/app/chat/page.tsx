"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";

type GcpStatus = {
  configured: boolean;
  mode: "demo" | "real" | null;
  project_id: string | null;
  region: string;
};

export default function ChatPage() {
  const router = useRouter();
  const [status, setStatus] = useState<GcpStatus | null>(null);

  useEffect(() => {
    fetch(apiUrl("/gcp/status"), { credentials: "include" })
      .then(async (r) => {
        if (r.status === 401) {
          router.push("/login");
          return null;
        }
        return r.json();
      })
      .then((data: GcpStatus | null) => {
        if (!data) return;
        if (!data.configured) {
          router.push("/setup");
          return;
        }
        setStatus(data);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  if (!status) {
    return (
      <main className="min-h-screen flex items-center justify-center text-gray-400">
        Loading…
      </main>
    );
  }

  return (
    <main className="min-h-screen grid grid-cols-1 lg:grid-cols-[420px_1fr]">
      <aside className="border-r border-canvas-border bg-canvas-panel p-6 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Chat</h2>
          <span className="text-xs px-2 py-0.5 rounded-full border border-canvas-border text-gray-400">
            {status.mode} · {status.project_id}
          </span>
        </div>
        <div className="flex-1 rounded-lg border border-canvas-border bg-canvas-bg p-4 text-sm text-gray-400">
          Chat will be wired up in Phase 2. Scaffolding complete.
        </div>
      </aside>

      <section className="bg-canvas-bg flex items-center justify-center text-gray-500">
        <div className="text-center space-y-2">
          <p className="text-sm uppercase tracking-widest text-gray-600">
            Live diagram
          </p>
          <p>React Flow canvas — Phase 4.</p>
        </div>
      </section>
    </main>
  );
}
