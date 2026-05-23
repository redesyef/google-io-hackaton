#!/usr/bin/env bash
# Run both backend and frontend in dev mode.
# Requires: python 3.11+, node 20+
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------- backend ----------
cd "$ROOT/backend"
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q -r requirements.txt
if [ ! -f .env ]; then
  cp "$ROOT/.env.example" .env
  echo "→ Created backend/.env from template. Edit GEMINI_API_KEY before chatting."
fi
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
echo "→ backend pid=$BACKEND_PID on :8000"

# ---------- frontend ----------
cd "$ROOT/frontend"
if [ ! -d node_modules ]; then
  npm install
fi
if [ ! -f .env.local ]; then
  echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
fi
trap "kill $BACKEND_PID 2>/dev/null || true" EXIT
npm run dev
