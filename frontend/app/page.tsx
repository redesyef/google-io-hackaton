import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-2xl text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-canvas-border text-xs text-canvas-accent">
          <span className="h-2 w-2 rounded-full bg-canvas-accent animate-pulse" />
          Built with Gemini 3.5 Flash · Managed Agents
        </div>
        <h1 className="text-5xl font-semibold tracking-tight">
          CloudCanvas
        </h1>
        <p className="text-lg text-gray-400">
          A bidirectional canvas for your Google Cloud. Click a node, talk to
          your infrastructure. Three managed sub-agents — inventory, cost,
          deploy — read, reason, and act on what you see.
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <Link
            href="/login"
            className="px-5 py-2.5 rounded-lg bg-canvas-accent text-white font-medium hover:opacity-90 transition"
          >
            Sign in
          </Link>
          <a
            href="https://github.com/redesyef/google-io-hackaton"
            target="_blank"
            rel="noreferrer"
            className="px-5 py-2.5 rounded-lg border border-canvas-border hover:bg-canvas-panel transition"
          >
            View repo
          </a>
        </div>
      </div>
    </main>
  );
}
