import { create } from "zustand";
import type { ChatMessage, DiagramEdge, DiagramNode, DiagramPatch } from "./types";

type State = {
  messages: ChatMessage[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  highlightedIds: string[];
  selectedNodeId: string | null;
  streaming: boolean;
};

type Actions = {
  reset: () => void;
  addUserMessage: (content: string) => string;
  addAssistantMessage: (id: string) => void;
  appendToAssistant: (id: string, chunk: string) => void;
  appendTrace: (id: string, entry: NonNullable<ChatMessage["trace"]>[number]) => void;
  applyDiagramPatch: (patch: DiagramPatch) => void;
  setSelectedNode: (id: string | null) => void;
  setStreaming: (v: boolean) => void;
};

let _idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${++_idCounter}`;

export const useStore = create<State & Actions>((set, get) => ({
  messages: [],
  nodes: [],
  edges: [],
  highlightedIds: [],
  selectedNodeId: null,
  streaming: false,

  reset: () =>
    set({
      messages: [],
      nodes: [],
      edges: [],
      highlightedIds: [],
      selectedNodeId: null,
      streaming: false,
    }),

  addUserMessage: (content) => {
    const id = nextId("u");
    set((s) => ({ messages: [...s.messages, { id, role: "user", content }] }));
    return id;
  },

  addAssistantMessage: (id) => {
    set((s) => ({
      messages: [...s.messages, { id, role: "assistant", content: "", trace: [] }],
    }));
  },

  appendToAssistant: (id, chunk) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + chunk } : m,
      ),
    }));
  },

  appendTrace: (id, entry) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, trace: [...(m.trace ?? []), entry] } : m,
      ),
    }));
  },

  applyDiagramPatch: (patch) => {
    const state = get();
    let nodes = state.nodes;
    let edges = state.edges;
    let highlight = state.highlightedIds;

    if (patch.nodes_replace) nodes = patch.nodes_replace;
    if (patch.edges_replace) edges = patch.edges_replace;

    if (patch.nodes_add) {
      const existingIds = new Set(nodes.map((n) => n.id));
      const incoming = patch.nodes_add.filter((n) => !existingIds.has(n.id));
      nodes = [...nodes, ...incoming];
    }
    if (patch.nodes_update) {
      const updates = new Map(patch.nodes_update.map((n) => [n.id, n]));
      nodes = nodes.map((n) => (updates.has(n.id) ? { ...n, ...updates.get(n.id)! } : n));
    }
    if (patch.edges_add) {
      const existingIds = new Set(edges.map((e) => e.id));
      const incoming = patch.edges_add.filter((e) => !existingIds.has(e.id));
      edges = [...edges, ...incoming];
    }

    if (patch.highlight) {
      highlight = patch.highlight;
    }

    set({ nodes, edges, highlightedIds: highlight });
  },

  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setStreaming: (v) => set({ streaming: v }),
}));

export const newMessageId = (prefix: "u" | "a") => nextId(prefix);
