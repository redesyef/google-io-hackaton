"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Wrench, Zap } from "lucide-react";

import { apiUrl } from "@/lib/api";
import { useStore, newMessageId } from "@/lib/store";
import { openChatStream } from "@/lib/stream";
import type { ChatMessage } from "@/lib/types";

export default function ChatPanel({ projectId }: { projectId: string }) {
  const [input, setInput] = useState("");
  const messages = useStore((s) => s.messages);
  const streaming = useStore((s) => s.streaming);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const nodes = useStore((s) => s.nodes);
  const addUserMessage = useStore((s) => s.addUserMessage);
  const addAssistantMessage = useStore((s) => s.addAssistantMessage);
  const appendToAssistant = useStore((s) => s.appendToAssistant);
  const appendTrace = useStore((s) => s.appendTrace);
  const applyDiagramPatch = useStore((s) => s.applyDiagramPatch);
  const setStreaming = useStore((s) => s.setStreaming);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function selectedNodeLabel(): string | null {
    if (!selectedNodeId) return null;
    const n = nodes.find((x) => x.id === selectedNodeId);
    return n ? n.label : null;
  }

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    const selectedLabel = selectedNodeLabel();
    const decorated = selectedLabel
      ? `[Context: user has selected the resource "${selectedLabel}".] ${trimmed}`
      : trimmed;

    setInput("");
    addUserMessage(trimmed);
    const assistantId = newMessageId("a");
    addAssistantMessage(assistantId);
    setStreaming(true);

    openChatStream(decorated, {
      onEvent: (evt) => {
        switch (evt.event) {
          case "status":
            appendTrace(assistantId, { kind: "status", text: evt.data.text });
            break;
          case "agent_start":
            appendTrace(assistantId, { kind: "agent_start", agent: evt.data.agent });
            break;
          case "agent_end":
            appendTrace(assistantId, { kind: "agent_end", agent: evt.data.agent, summary: evt.data.summary });
            break;
          case "tool_call":
            appendTrace(assistantId, {
              kind: "tool_call",
              agent: evt.data.agent,
              tool: evt.data.tool,
              args: evt.data.args,
            });
            break;
          case "tool_result":
            appendTrace(assistantId, {
              kind: "tool_result",
              agent: evt.data.agent,
              tool: evt.data.tool,
              summary: evt.data.summary,
            });
            break;
          case "diagram_update":
            applyDiagramPatch(evt.data);
            break;
          case "message_chunk":
            appendToAssistant(assistantId, evt.data.text);
            break;
          case "done":
            setStreaming(false);
            break;
          case "error":
            appendTrace(assistantId, { kind: "error", message: evt.data.message });
            appendToAssistant(assistantId, `\n\nError: ${evt.data.message}`);
            setStreaming(false);
            break;
        }
      },
      onClose: () => setStreaming(false),
      onError: () => setStreaming(false),
    });
  }

  async function refreshInventory() {
    if (streaming) return;
    const r = await fetch(apiUrl("/gcp/snapshot"), { credentials: "include" });
    if (!r.ok) return;
    const snapshot = await r.json();
    // Build nodes/edges client-side mirroring the backend's snapshot_to_diagram.
    const nodes = [
      ...(snapshot.load_balancers ?? []).map((lb: { name: string; ip_address?: string }) => ({
        id: `lb:${lb.name}`,
        kind: "load_balancer",
        label: lb.name,
        subtitle: lb.ip_address ?? "",
      })),
      ...(snapshot.compute ?? []).map((vm: { name: string; machine_type?: string; status?: string }) => ({
        id: `vm:${vm.name}`,
        kind: "compute",
        label: vm.name,
        subtitle: vm.machine_type,
        status: vm.status,
      })),
      ...(snapshot.sql ?? []).map((s: { name: string; tier?: string }) => ({
        id: `sql:${s.name}`,
        kind: "sql",
        label: s.name,
        subtitle: s.tier ?? "",
      })),
      ...(snapshot.storage ?? []).map((b: { name: string; storage_class?: string }) => ({
        id: `bucket:${b.name}`,
        kind: "storage",
        label: b.name,
        subtitle: b.storage_class ?? "",
      })),
    ];
    applyDiagramPatch({ nodes_replace: nodes });
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-5 py-3 border-b border-canvas-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-canvas-accent" />
          <h2 className="font-medium">CloudCanvas</h2>
        </div>
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-canvas-border text-gray-400">
          {projectId}
        </span>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-400">
              Ask the orchestrator anything about your cloud. Try:
            </p>
            <div className="grid gap-2">
              {[
                "What's currently deployed in this project?",
                "Where am I overspending? Suggest optimizations.",
                "Propose a Redis cache in front of the orders database.",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="text-left text-sm px-3 py-2 rounded-lg border border-canvas-border hover:bg-canvas-panel transition"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>

      <div className="border-t border-canvas-border p-3 space-y-2">
        {selectedNodeLabel() && (
          <div className="text-xs px-2.5 py-1 rounded-full border border-canvas-accent text-canvas-accent inline-flex items-center gap-1">
            <Zap size={10} />
            Context: <span className="font-mono">{selectedNodeLabel()}</span>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <button
            type="button"
            onClick={refreshInventory}
            disabled={streaming}
            className="px-2.5 py-2 rounded-lg border border-canvas-border hover:bg-canvas-panel text-gray-300 transition disabled:opacity-50"
            title="Refresh inventory diagram"
          >
            <Wrench size={14} />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask about your infrastructure…"
            rows={1}
            className="flex-1 resize-none bg-canvas-bg border border-canvas-border rounded-lg px-3 py-2 text-sm outline-none focus:border-canvas-accent max-h-32"
          />
          <button
            type="button"
            onClick={send}
            disabled={streaming || !input.trim()}
            className="px-3 py-2 rounded-lg bg-canvas-accent text-white hover:opacity-90 transition disabled:opacity-50"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-canvas-accent text-white px-3.5 py-2 text-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {(message.trace ?? []).length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-300 select-none">
            agent trace ({message.trace!.length} events)
          </summary>
          <ul className="mt-2 space-y-1 pl-2 border-l border-canvas-border">
            {message.trace!.map((t, i) => (
              <li key={i} className="text-gray-400">
                <TraceLine entry={t} />
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="max-w-[95%] rounded-2xl rounded-bl-sm bg-canvas-panel border border-canvas-border px-3.5 py-2 text-sm whitespace-pre-wrap leading-relaxed">
        {message.content || <span className="text-gray-500 italic">thinking…</span>}
      </div>
    </div>
  );
}

function TraceLine({ entry }: { entry: NonNullable<ChatMessage["trace"]>[number] }) {
  switch (entry.kind) {
    case "status":
      return <span>· {entry.text}</span>;
    case "agent_start":
      return <span className="text-canvas-accent">▶ {entry.agent} agent started</span>;
    case "agent_end":
      return <span className="text-canvas-accent2">◼ {entry.agent} agent done</span>;
    case "tool_call":
      return (
        <span>
          [{entry.agent}] → <span className="font-mono text-gray-300">{entry.tool}</span>
        </span>
      );
    case "tool_result":
      return (
        <span>
          [{entry.agent}] ← <span className="font-mono text-gray-300">{entry.tool}</span>:{" "}
          <span className="text-gray-300">{entry.summary}</span>
        </span>
      );
    case "error":
      return <span className="text-canvas-danger">✗ {entry.message}</span>;
  }
}
