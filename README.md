# CloudCanvas — Conversational Infrastructure for GCP

> Google I/O Hackathon 2026 · Built with Gemini 3.5 Flash + Managed Agents

CloudCanvas is a **bidirectional canvas** for your Google Cloud infrastructure: a live diagram you can click, plus a multi-agent chat that reads, reasons about, and acts on what you see. Not a chatbot with tools — a coordinated system of **managed sub-agents** (inventory · cost · deploy) orchestrated by Gemini 3.5 Flash.

## Architecture

```
┌─────────────────────────┐         ┌──────────────────────────────┐
│  Next.js 14 (frontend)  │         │  FastAPI (backend)           │
│  - Login                │ ◀─SSE─▶ │  - Managed Agents Orchestrator│
│  - GCP creds setup      │         │  - Sub-agents (inventory,    │
│  - Chat + React Flow    │         │    cost, deploy)             │
│    live diagram         │         │  - MCP-style GCP tools       │
└─────────────────────────┘         └──────────────────────────────┘
                                                 │
                                                 ▼
                                    ┌──────────────────────────┐
                                    │  Google Cloud APIs       │
                                    │  Compute · Storage · SQL │
                                    │  Billing · ResourceMgr   │
                                    └──────────────────────────┘
```

## Quick start

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

## Hackathon scope

Built in ~4 hours at Shack15, SF. All code in this repo was written during the event.
