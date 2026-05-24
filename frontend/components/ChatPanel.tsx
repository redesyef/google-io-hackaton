"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Sparkles, Zap } from "lucide-react";

import { UiBlockRenderer } from "@/components/UiBlocks";
import { sendChatMessage } from "@/lib/chat";
import { useStore } from "@/lib/store";
import type { ChatMessage } from "@/lib/types";

export default function ChatPanel({ projectId }: { projectId: string }) {
  const [input, setInput] = useState("");
  const messages = useStore((s) => s.messages);
  const streaming = useStore((s) => s.streaming);
  // Use a value-based selector so it returns the same string across renders
  // when nothing relevant changed — otherwise the ?? [] fallback would mint a
  // fresh array reference and trigger a re-render loop.
  const selectedLabel = useStore((s) => {
    if (!s.selectedNodeId) return null;
    const d = s.diagrams.find((x) => x.id === s.activeDiagramId);
    return d?.nodes.find((n) => n.id === s.selectedNodeId)?.label ?? null;
  });

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function submit() {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;
    setInput("");
    sendChatMessage(trimmed);
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-4 py-3 border-b border-canvas-border flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={15} className="text-canvas-accent shrink-0" />
          <h2 className="font-medium text-sm truncate">Cloudy</h2>
        </div>
        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-canvas-border text-gray-400 truncate max-w-[140px]">
          {projectId}
        </span>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5">
        {messages.length === 0 && (
          <div className="text-sm text-gray-400 space-y-3 mt-6">
            <div className="flex items-center gap-2 text-canvas-accent text-xs">
              <ArrowLeft size={12} />
              <span>Click any agent on the right to start.</span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Each agent specializes in one job. The orchestrator routes your
              intent and the canvas updates live as the sub-agents work.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>

      <div className="border-t border-canvas-border p-3 space-y-2">
        {selectedLabel && (
          <div className="text-[11px] px-2 py-1 rounded-full border border-canvas-accent text-canvas-accent inline-flex items-center gap-1">
            <Zap size={10} />
            <span className="font-mono truncate max-w-[200px]">{selectedLabel}</span>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask anything…"
            rows={1}
            className="flex-1 resize-none bg-canvas-bg border border-canvas-border rounded-lg px-3 py-2 text-sm outline-none focus:border-canvas-accent max-h-32"
          />
          <button
            type="button"
            onClick={submit}
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
        <div className="max-w-[90%] rounded-2xl rounded-br-sm bg-canvas-accent text-white px-3 py-1.5 text-sm whitespace-pre-wrap leading-snug">
          {message.content}
        </div>
      </div>
    );
  }

  const blocks = message.blocks ?? [];
  return (
    <div className="space-y-1.5">
      {(message.trace ?? []).length > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-300 select-none">
            agent trace · {message.trace!.length} events
          </summary>
          <ul className="mt-1.5 space-y-0.5 pl-2 border-l border-canvas-border">
            {message.trace!.map((t, i) => (
              <li key={i} className="text-gray-400">
                <TraceLine entry={t} />
              </li>
            ))}
          </ul>
        </details>
      )}

      {blocks.length > 0 && (
        <div className="space-y-2">
          {blocks.map((b, i) => (
            <UiBlockRenderer key={i} block={b} />
          ))}
        </div>
      )}

      {message.content ? (
        <div className="rounded-2xl rounded-bl-sm bg-canvas-panel border border-canvas-border px-3 py-2 text-[13px] leading-snug">
          {message.content}
        </div>
      ) : blocks.length === 0 ? (
        <div className="rounded-2xl rounded-bl-sm bg-canvas-panel border border-canvas-border px-3 py-2 text-[13px] leading-snug">
          <span className="text-gray-500 italic">thinking…</span>
        </div>
      ) : null}
    </div>
  );
}

function TraceLine({ entry }: { entry: NonNullable<ChatMessage["trace"]>[number] }) {
  switch (entry.kind) {
    case "status":
      return <span>· {entry.text}</span>;
    case "agent_start":
      return <span className="text-canvas-accent">▶ {entry.agent} started</span>;
    case "agent_end":
      return <span className="text-canvas-accent2">◼ {entry.agent} done</span>;
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
