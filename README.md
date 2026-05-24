# Cloudy — Conversational Infrastructure for GCP

> Google I/O Hackathon 2026 · Built with Gemini 3.5 Flash + Managed Agents

Cloudy is a **bidirectional canvas** for your Google Cloud
infrastructure: a live diagram you can click, plus a multi-agent chat that
reads, reasons about, and acts on what you see. Not a chatbot with tools —
a coordinated system of **managed sub-agents** (inventory · cost · deploy)
orchestrated by Gemini 3.5 Flash.

## What makes it different

1. **Multi-agent, not single-agent.** The Orchestrator routes intent to
   one of three Gemini sub-agents via function calling. Each sub-agent
   has its own system prompt and a narrow tool catalog.
2. **The diagram is bidirectional.** Click a node and the chat already has
   context. The agent proposes a change and a ghost node appears on the
   canvas. You confirm and it becomes real.
3. **Full agent transparency.** Every assistant message carries a
   collapsible trace: which sub-agent ran, which tool it called, what
   it returned. No black box.

## Architecture

```
┌─────────────────────────────┐         ┌──────────────────────────────────┐
│  Next.js 14 (frontend)      │         │  FastAPI (backend)               │
│  - Login / GCP setup        │ ◀─SSE─▶ │  ┌──────────────────────────┐    │
│  - Zustand store            │         │  │ Orchestrator             │    │
│  - React Flow live canvas   │         │  │  (Gemini 3.5 Flash)      │    │
│  - Per-message agent trace  │         │  │  delegates →             │    │
│  - Node detail + apply/     │         │  │   inventory · cost · deploy   │
│    discard                  │         │  └──────────────────────────┘    │
└─────────────────────────────┘         │  + MCP-style GCP tool catalog    │
                                        └──────────────────────────────────┘
                                                       │
                                                       ▼
                                          ┌──────────────────────────┐
                                          │  Google Cloud APIs        │
                                          │  Compute · Storage · SQL  │
                                          │  Billing · ResourceMgr    │
                                          └──────────────────────────┘
```

## Quick start

```bash
./dev.sh
```

Or step-by-step:

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env  # edit GEMINI_API_KEY
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

Open `http://localhost:3000`. Login: `admin / hackathon2026`.

On the GCP setup screen, either paste a Service Account JSON (with
`viewer` + `billing.viewer` roles) **or** click **Use demo project** —
demo mode loads a synthetic *ShopFlow* project with 3 VMs, 2 buckets,
a Cloud SQL instance, and seeded billing anomalies so the canvas is
explorable without granting any cloud access.

## Try these prompts

- *"What's currently deployed in this project?"* → orchestrator delegates
  to the **inventory** agent; the diagram populates as tool results stream.
- *"Where am I overspending? Suggest optimizations."* → **cost** agent
  highlights anomalous resources in pulsing yellow.
- *"Propose a Redis cache in front of the orders database."* → **deploy**
  agent surfaces a ghost node on the canvas; click it and hit *Apply*.

## Project layout

```
backend/
├── api/             # FastAPI routers: auth, gcp, chat (SSE), diagram
├── agents/          # Orchestrator, sub-agents, Gemini SDK wrapper, tools
├── mcp/             # GCP client abstraction (Real + Demo)
└── core/            # Settings, JWT, in-memory session store

frontend/
├── app/             # /, /login, /setup, /chat (Next 14 App Router)
├── components/      # ChatPanel, DiagramCanvas, NodeDetailPanel
└── lib/             # api, store (zustand), stream (SSE), types
```

## Security notes

- Service Account JSON is held **in process memory only**, scoped to the
  JWT subject. Never written to disk, never logged, cleared on logout.
- JWT lives in an httpOnly + samesite=lax cookie.
- `.gitignore` excludes `.env`, `*-key.json`, `service-account*.json`.
- The deploy agent only *proposes*; nothing is applied to your cloud
  without an explicit "Apply" click in the UI.

## Hackathon scope

Built in ~4 hours at Shack15, SF for the Google I/O Hackathon 2026.
Every line of code in this repo was written during the event.

Targeted prize: **Best Use of Managed Agents** ($5K).
