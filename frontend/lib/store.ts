import { create } from "zustand";
import type {
  AgentName,
  AgentRuntime,
  AgentStatus,
  ChatMessage,
  Diagram,
  DiagramNode,
  DiagramPatch,
  UiBlock,
} from "./types";

const AGENT_NAMES: AgentName[] = ["orchestrator", "inventory", "cost", "deploy"];

function defaultAgents(): Record<AgentName, AgentRuntime> {
  return AGENT_NAMES.reduce(
    (acc, name) => {
      acc[name] = { status: "idle", toolsCalled: 0 };
      return acc;
    },
    {} as Record<AgentName, AgentRuntime>,
  );
}

let _idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${++_idCounter}`;

function emptyDiagram(title: string, opts: { closeable?: boolean; description?: string } = {}): Diagram {
  return {
    id: nextId("d"),
    title,
    description: opts.description,
    closeable: opts.closeable ?? true,
    nodes: [],
    edges: [],
    highlightedIds: [],
    createdAt: Date.now(),
  };
}

type State = {
  messages: ChatMessage[];
  diagrams: Diagram[];
  activeDiagramId: string | null;
  selectedNodeId: string | null;
  streaming: boolean;
  agents: Record<AgentName, AgentRuntime>;
};

type Actions = {
  reset: () => void;

  // chat
  addUserMessage: (content: string) => string;
  addAssistantMessage: (id: string) => void;
  appendToAssistant: (id: string, chunk: string) => void;
  appendTrace: (id: string, entry: NonNullable<ChatMessage["trace"]>[number]) => void;
  appendBlock: (id: string, block: UiBlock) => void;

  // diagrams
  applyDiagramPatch: (patch: DiagramPatch) => void;
  setActiveDiagram: (id: string) => void;
  closeDiagram: (id: string) => void;
  seedInitialDiagram: (title: string, nodes: DiagramNode[], edges: { id: string; source: string; target: string }[]) => void;

  // selection / streaming / agents
  setSelectedNode: (id: string | null) => void;
  setStreaming: (v: boolean) => void;
  resetAgents: () => void;
  setAgentStatus: (name: AgentName, status: AgentStatus) => void;
  recordAgentTool: (name: AgentName, tool: string) => void;
};

export const useStore = create<State & Actions>((set, get) => ({
  messages: [],
  diagrams: [],
  activeDiagramId: null,
  selectedNodeId: null,
  streaming: false,
  agents: defaultAgents(),

  reset: () =>
    set({
      messages: [],
      diagrams: [],
      activeDiagramId: null,
      selectedNodeId: null,
      streaming: false,
      agents: defaultAgents(),
    }),

  // ----------------------------------------------------------------- chat
  addUserMessage: (content) => {
    const id = nextId("u");
    set((s) => ({ messages: [...s.messages, { id, role: "user", content }] }));
    return id;
  },
  addAssistantMessage: (id) => {
    set((s) => ({
      messages: [...s.messages, { id, role: "assistant", content: "", trace: [], blocks: [] }],
    }));
  },
  appendToAssistant: (id, chunk) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, content: m.content + chunk } : m)),
    })),
  appendTrace: (id, entry) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, trace: [...(m.trace ?? []), entry] } : m,
      ),
    })),
  appendBlock: (id, block) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, blocks: [...(m.blocks ?? []), block] } : m,
      ),
    })),

  // ----------------------------------------------------------------- diagrams
  seedInitialDiagram: (title, nodes, edges) => {
    const d = emptyDiagram(title, { closeable: false, description: "Top-level infrastructure" });
    d.nodes = nodes;
    d.edges = edges;
    set({ diagrams: [d], activeDiagramId: d.id });
  },

  applyDiagramPatch: (patch) => {
    const state = get();
    const scope = patch.scope ?? "active";

    // Determine target diagram
    let target: Diagram | undefined;
    let nextDiagrams = state.diagrams;
    let nextActive = state.activeDiagramId;

    if (scope === "new" && patch.diagram_title) {
      // Reuse an existing diagram with the same title; otherwise create one.
      const existing = state.diagrams.find((d) => d.title === patch.diagram_title);
      if (existing) {
        target = existing;
      } else {
        target = emptyDiagram(patch.diagram_title, {
          closeable: patch.closeable ?? true,
          description: patch.diagram_description,
        });
        nextDiagrams = [...state.diagrams, target];
      }
      nextActive = target.id;
    } else {
      target = state.diagrams.find((d) => d.id === state.activeDiagramId) ?? state.diagrams[0];
      if (!target) {
        // No diagrams exist yet — create a default "Untitled" one
        target = emptyDiagram("Untitled");
        nextDiagrams = [target];
        nextActive = target.id;
      }
    }

    // Compute new content for the target
    let nodes = target.nodes;
    let edges = target.edges;
    let highlight = target.highlightedIds;

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
    if (patch.highlight) highlight = patch.highlight;

    const updatedTarget: Diagram = { ...target, nodes, edges, highlightedIds: highlight };

    set({
      diagrams: nextDiagrams.map((d) => (d.id === target!.id ? updatedTarget : d)),
      activeDiagramId: nextActive,
    });
  },

  setActiveDiagram: (id) => set({ activeDiagramId: id, selectedNodeId: null }),

  closeDiagram: (id) => {
    const state = get();
    const filtered = state.diagrams.filter((d) => d.id !== id || !d.closeable);
    let nextActive = state.activeDiagramId;
    if (state.activeDiagramId === id) {
      nextActive = filtered[0]?.id ?? null;
    }
    set({ diagrams: filtered, activeDiagramId: nextActive });
  },

  // ----------------------------------------------------------------- misc
  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setStreaming: (v) => set({ streaming: v }),

  resetAgents: () => set({ agents: defaultAgents() }),

  setAgentStatus: (name, status) =>
    set((s) => ({
      agents: { ...s.agents, [name]: { ...s.agents[name], status } },
    })),

  recordAgentTool: (name, tool) =>
    set((s) => ({
      agents: {
        ...s.agents,
        [name]: {
          ...s.agents[name],
          lastTool: tool,
          toolsCalled: s.agents[name].toolsCalled + 1,
          status: "active",
        },
      },
    })),
}));

export const newMessageId = (prefix: "u" | "a") => nextId(prefix);

// Convenience selectors
export function selectActiveDiagram(state: State): Diagram | undefined {
  return state.diagrams.find((d) => d.id === state.activeDiagramId);
}
