import type { ChatEvent } from "./types";
import { apiUrl } from "./api";

export type StreamHandlers = {
  onEvent: (evt: ChatEvent) => void;
  onClose?: () => void;
  onError?: (err: unknown) => void;
};

/**
 * Open an SSE stream against /chat/stream.
 * EventSource cannot send custom headers, so the cookie is the only auth
 * surface (set httpOnly + samesite=lax on login). Returns a close() fn.
 */
export function openChatStream(message: string, handlers: StreamHandlers): () => void {
  const url = new URL(apiUrl("/chat/stream"));
  url.searchParams.set("message", message);

  const source = new EventSource(url.toString(), { withCredentials: true });

  const eventTypes: ChatEvent["event"][] = [
    "status",
    "agent_start",
    "agent_end",
    "tool_call",
    "tool_result",
    "diagram_update",
    "message_chunk",
    "done",
    "error",
  ];

  const listeners = new Map<string, (e: MessageEvent) => void>();

  for (const type of eventTypes) {
    const handler = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        handlers.onEvent({ event: type, data } as ChatEvent);
        if (type === "done" || type === "error") {
          source.close();
          handlers.onClose?.();
        }
      } catch (err) {
        handlers.onError?.(err);
      }
    };
    source.addEventListener(type, handler);
    listeners.set(type, handler);
  }

  source.onerror = (err) => {
    handlers.onError?.(err);
    source.close();
    handlers.onClose?.();
  };

  return () => {
    for (const [type, handler] of listeners) {
      source.removeEventListener(type, handler);
    }
    source.close();
  };
}
