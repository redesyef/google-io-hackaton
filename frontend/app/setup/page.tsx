"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, FileJson, Info, Loader2, Upload } from "lucide-react";

const GCP_CONSOLE_KEYS_URL = "https://console.cloud.google.com/iam-admin/serviceaccounts";

import { apiUrl } from "@/lib/api";

type ParsedSA = {
  project_id?: string;
  client_email?: string;
  private_key_id?: string;
} | null;

const GCLOUD_SETUP_CMD = `# 1. Create a service account
gcloud iam service-accounts create cloudy-reader \\
  --display-name="Cloudy Reader"

# 2. Grant read-only roles on your project
PROJECT_ID=$(gcloud config get-value project)
SA_EMAIL="cloudy-reader@\${PROJECT_ID}.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID \\
  --member="serviceAccount:$SA_EMAIL" --role="roles/viewer"

gcloud projects add-iam-policy-binding $PROJECT_ID \\
  --member="serviceAccount:$SA_EMAIL" --role="roles/billing.viewer"

# 3. Download a JSON key
gcloud iam service-accounts keys create ~/cloudy-key.json \\
  --iam-account="$SA_EMAIL"`;

export default function SetupPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [json, setJson] = useState("");
  const [parsed, setParsed] = useState<ParsedSA>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"real" | "demo" | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!json.trim()) {
      setParsed(null);
      return;
    }
    try {
      const obj = JSON.parse(json);
      setParsed({
        project_id: obj.project_id,
        client_email: obj.client_email,
        private_key_id: obj.private_key_id,
      });
      setError(null);
    } catch {
      setParsed(null);
    }
  }, [json]);

  function readFile(file: File) {
    if (!file.name.endsWith(".json")) {
      setError("Please choose a .json key file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setJson(String(reader.result ?? ""));
      setFilename(file.name);
      setError(null);
    };
    reader.onerror = () => setError("Could not read the file.");
    reader.readAsText(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  }

  async function submit(demoMode: boolean) {
    setError(null);
    setLoading(demoMode ? "demo" : "real");
    try {
      let payload: unknown = null;
      if (!demoMode) {
        try {
          payload = JSON.parse(json);
        } catch {
          throw new Error("The JSON could not be parsed.");
        }
      }
      const res = await fetch(apiUrl("/gcp/credentials"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          demo_mode: demoMode,
          service_account_json: demoMode ? null : payload,
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

  function copyCmd() {
    navigator.clipboard.writeText(GCLOUD_SETUP_CMD);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-3xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Connect Google Cloud</h1>
          <p className="text-sm text-gray-400">
            Upload a <strong>Service Account JSON key</strong> — GCP's standard
            method for programmatic access. Credentials stay in memory and
            are never written to disk.
          </p>
          <a
            href={GCP_CONSOLE_KEYS_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-canvas-accent hover:underline"
          >
            Open Service Accounts in Google Cloud Console
            <ExternalLink size={12} />
          </a>
        </div>

        {/* Primary: file upload + paste */}
        <div className="bg-canvas-panel border border-canvas-border rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileJson size={18} className="text-canvas-accent" />
              <h2 className="font-medium">Service Account Key</h2>
            </div>
            <button
              onClick={() => setShowHelp((s) => !s)}
              className="text-xs text-gray-400 hover:text-canvas-accent flex items-center gap-1"
            >
              <Info size={12} />
              {showHelp ? "Hide" : "How do I get one?"}
            </button>
          </div>

          {showHelp && (
            <div className="rounded-lg bg-canvas-bg border border-canvas-border p-4 space-y-3">
              <div className="text-xs text-gray-300 space-y-1">
                <p className="font-medium text-white">Option A — gcloud CLI (fastest):</p>
                <div className="relative">
                  <pre className="text-[11px] font-mono text-gray-300 bg-black/30 rounded p-3 overflow-x-auto whitespace-pre">
{GCLOUD_SETUP_CMD}
                  </pre>
                  <button
                    onClick={copyCmd}
                    className="absolute top-2 right-2 text-[10px] px-2 py-1 rounded border border-canvas-border bg-canvas-panel hover:bg-canvas-border flex items-center gap-1"
                  >
                    {copied ? <Check size={10} /> : <Copy size={10} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
              <div className="text-xs text-gray-300 space-y-1 pt-2 border-t border-canvas-border">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-white">Option B — Cloud Console:</p>
                  <a
                    href={GCP_CONSOLE_KEYS_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-canvas-accent hover:underline inline-flex items-center gap-1 text-[11px]"
                  >
                    Open console <ExternalLink size={10} />
                  </a>
                </div>
                <ol className="list-decimal pl-4 space-y-0.5 text-gray-400">
                  <li>
                    <a href={GCP_CONSOLE_KEYS_URL} target="_blank" rel="noreferrer" className="text-canvas-accent hover:underline">
                      IAM & Admin → Service Accounts
                    </a>
                    {" "}→ Create
                  </li>
                  <li>Grant roles: <code className="text-canvas-accent">Viewer</code> + <code className="text-canvas-accent">Billing Account Viewer</code></li>
                  <li>Open the SA → Keys → Add Key → Create new key → JSON</li>
                  <li>Drop the downloaded file below</li>
                </ol>
              </div>
            </div>
          )}

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={[
              "rounded-xl border-2 border-dashed cursor-pointer p-6 text-center transition",
              dragOver ? "border-canvas-accent bg-canvas-accent/5" : "border-canvas-border hover:border-canvas-accent/60",
            ].join(" ")}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }}
            />
            <Upload size={20} className="mx-auto text-gray-500 mb-2" />
            <p className="text-sm">
              <span className="text-canvas-accent font-medium">Click to upload</span>
              {" "}or drop your <code className="text-canvas-accent">.json</code> key file here
            </p>
            {filename && (
              <p className="text-xs text-canvas-accent2 mt-2 inline-flex items-center gap-1">
                <Check size={12} /> {filename}
              </p>
            )}
          </div>

          {/* Parsed preview */}
          {parsed && parsed.project_id && (
            <div className="rounded-lg bg-canvas-accent2/5 border border-canvas-accent2/30 p-3 text-xs space-y-1">
              <div className="flex items-center gap-2 text-canvas-accent2 font-medium">
                <Check size={12} /> Looks like a valid Service Account key
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-gray-300 pt-1">
                <span className="text-gray-500">project</span>
                <span className="font-mono">{parsed.project_id}</span>
                <span className="text-gray-500">client</span>
                <span className="font-mono truncate">{parsed.client_email}</span>
                {parsed.private_key_id && (
                  <>
                    <span className="text-gray-500">key id</span>
                    <span className="font-mono truncate">{parsed.private_key_id.slice(0, 16)}…</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Paste fallback (collapsible) */}
          <details className="text-xs">
            <summary className="cursor-pointer text-gray-500 hover:text-gray-300 select-none">
              Or paste the JSON manually
            </summary>
            <textarea
              value={json}
              onChange={(e) => { setJson(e.target.value); setFilename(null); }}
              placeholder='{"type": "service_account", "project_id": "...", "private_key": "...", "client_email": "..."}'
              rows={6}
              className="mt-2 w-full bg-canvas-bg border border-canvas-border rounded-lg p-3 font-mono text-xs outline-none focus:border-canvas-accent"
            />
          </details>

          {error && (
            <p className="text-sm text-canvas-danger flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-canvas-danger" /> {error}
            </p>
          )}

          <button
            onClick={() => submit(false)}
            disabled={loading !== null || !parsed}
            className="w-full py-3 rounded-lg bg-canvas-accent text-white font-medium hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading === "real" && <Loader2 size={14} className="animate-spin" />}
            {loading === "real" ? "Authenticating with GCP…" : "Connect"}
          </button>
        </div>

        {/* Or demo */}
        <div className="flex items-center gap-3 text-gray-500 text-xs">
          <div className="flex-1 h-px bg-canvas-border" />
          <span>or</span>
          <div className="flex-1 h-px bg-canvas-border" />
        </div>

        <button
          onClick={() => submit(true)}
          disabled={loading !== null}
          className="w-full py-2.5 rounded-lg border border-canvas-border hover:bg-canvas-panel transition disabled:opacity-50 text-sm"
        >
          {loading === "demo" ? "Loading demo…" : "Skip — explore with a synthetic demo project"}
        </button>
        <p className="text-[11px] text-gray-500 text-center -mt-3">
          Demo mode loads a synthetic <span className="font-mono">ShopFlow</span> project
          (3 VMs, 2 buckets, Cloud SQL, seeded billing anomalies). Useful when you don't
          want to grant real cloud access.
        </p>
      </div>
    </main>
  );
}
