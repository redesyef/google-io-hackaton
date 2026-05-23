"use client";

import { newMessageId, useStore } from "./store";
import { openChatStream } from "./stream";
import type { AgentName } from "./types";

/**
 * Single entry point for sending a chat message. Used by ChatPanel,
 * AgentsPanel, and any quick-action button. Wires SSE events to the
 * Zustand store so the entire UI stays in sync.
 */
export function sendChatMessage(rawText: string) {
  const s = useStore.getState();
  if (s.streaming) return;
  const trimmed = rawText.trim();
  if (!trimmed) return;

  const selectedNode = s.nodes.find((n) => n.id === s.selectedNodeId) ?? null;
  const decorated = selectedNode
    ? `[Context: user has selected the resource "${selectedNode.label}".] ${trimmed}`
    : trimmed;

  s.addUserMessage(trimmed);
  const assistantId = newMessageId("a");
  s.addAssistantMessage(assistantId);
  s.setStreaming(true);
  s.resetAgents();
  s.setAgentStatus("orchestrator", "active");

  openChatStream(decorated, {
    onEvent: (evt) => {
      const store = useStore.getState();
      switch (evt.event) {
        case "status":
          store.appendTrace(assistantId, { kind: "status", text: evt.data.text });
          break;
        case "agent_start": {
          const a = evt.data.agent as AgentName;
          store.setAgentStatus(a, "active");
          store.appendTrace(assistantId, { kind: "agent_start", agent: evt.data.agent });
          break;
        }
        case "agent_end": {
          const a = evt.data.agent as AgentName;
          store.setAgentStatus(a, "done");
          store.appendTrace(assistantId, {
            kind: "agent_end",
            agent: evt.data.agent,
            summary: evt.data.summary,
          });
          break;
        }
        case "tool_call": {
          const a = evt.data.agent as AgentName;
          store.recordAgentTool(a, evt.data.tool);
          store.appendTrace(assistantId, {
            kind: "tool_call",
            agent: evt.data.agent,
            tool: evt.data.tool,
            args: evt.data.args,
          });
          break;
        }
        case "tool_result":
          store.appendTrace(assistantId, {
            kind: "tool_result",
            agent: evt.data.agent,
            tool: evt.data.tool,
            summary: evt.data.summary,
          });
          break;
        case "diagram_update":
          store.applyDiagramPatch(evt.data);
          break;
        case "message_chunk":
          store.appendToAssistant(assistantId, evt.data.text);
          break;
        case "done":
          store.setAgentStatus("orchestrator", "done");
          store.setStreaming(false);
          break;
        case "error":
          store.setAgentStatus("orchestrator", "done");
          store.appendTrace(assistantId, { kind: "error", message: evt.data.message });
          store.appendToAssistant(assistantId, `\n\nError: ${evt.data.message}`);
          store.setStreaming(false);
          break;
      }
    },
    onClose: () => useStore.getState().setStreaming(false),
    onError: () => useStore.getState().setStreaming(false),
  });
}
