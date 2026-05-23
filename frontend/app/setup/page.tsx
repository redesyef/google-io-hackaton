"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiUrl } from "@/lib/api";

export default function SetupPage() {
  const router = useRouter();
  const [json, setJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"real" | "demo" | null>(null);

  async function submit(demoMode: boolean) {
    setError(null);
    setLoading(demoMode ? "demo" : "real");
    try {
      let parsed: unknown = null;
      if (!demoMode) {
        try {
          parsed = JSON.parse(json);
        } catch {
          throw new Error("invalid JSON");
        }
      }
      const res = await fetch(apiUrl("/gcp/credentials"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          demo_mode: demoMode,
          service_account_json: demoMode ? null : parsed,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? "failed to set credentials");
      }
      router.push("/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-2xl bg-canvas-panel border border-canvas-border rounded-2xl p-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Connect Google Cloud</h1>
          <p className="text-sm text-gray-400">
            Paste a Service Account JSON with{" "}
            <code className="text-canvas-accent">viewer</code> +{" "}
            <code className="text-canvas-accent">billing.viewer</code> roles.
            Credentials stay in memory and are never written to disk.
          </p>
        </div>

        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder='{"type": "service_account", "project_id": "...", "private_key": "...", "client_email": "..."}'
          rows={10}
          className="w-full bg-canvas-bg border border-canvas-border rounded-lg p-3 font-mono text-xs outline-none focus:border-canvas-accent"
        />

        {error && <p className="text-sm text-canvas-danger">{error}</p>}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => submit(false)}
            disabled={loading !== null || !json.trim()}
            className="flex-1 py-2.5 rounded-lg bg-canvas-accent text-white font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {loading === "real" ? "Connecting…" : "Connect with credentials"}
          </button>
          <button
            onClick={() => submit(true)}
            disabled={loading !== null}
            className="flex-1 py-2.5 rounded-lg border border-canvas-border hover:bg-canvas-bg transition disabled:opacity-50"
          >
            {loading === "demo" ? "Loading…" : "Use demo project"}
          </button>
        </div>

        <p className="text-xs text-gray-500">
          Demo mode loads a synthetic ShopFlow project with 3 VMs, 2 buckets,
          a Cloud SQL instance, and seeded billing anomalies — useful when you
          want to explore the canvas without granting real cloud access.
        </p>
      </div>
    </main>
  );
}
