export type GcpStatus = {
  configured: boolean;
  mode: "demo" | "real" | null;
  project_id: string | null;
  region: string;
};

export type DiagramNode = {
  id: string;
  kind:
    | "compute"
    | "storage"
    | "sql"
    | "load_balancer"
    | "disk"
    | "network"
    | "iam"
    | "firewall"
    | "backup"
    | "database"
    | "lifecycle"
    | "cdn"
    | "ssl"
    | "service"
    | "policy"
    | "cache"
    | string;
  label: string;
  subtitle?: string;
  status?: string;
  meta?: Record<string, unknown>;
  proposed?: boolean;
  parent_id?: string;
};

export type AgentName = "orchestrator" | "inventory" | "cost" | "deploy";
export type AgentStatus = "idle" | "active" | "done";

export type AgentRuntime = {
  status: AgentStatus;
  lastTool?: string;
  toolsCalled: number;
};

export type DiagramEdge = {
  id: string;
  source: string;
  target: string;
  sub?: boolean;
};

export type DiagramPatch = {
  nodes_replace?: DiagramNode[];
  edges_replace?: DiagramEdge[];
  nodes_add?: DiagramNode[];
  nodes_update?: DiagramNode[];
  edges_add?: DiagramEdge[];
  highlight?: string[];
  highlight_reason?: string;
};

export type ChatEvent =
  | { event: "status"; data: { text: string } }
  | { event: "agent_start"; data: { agent: string } }
  | { event: "agent_end"; data: { agent: string; summary?: string } }
  | { event: "tool_call"; data: { agent: string; tool: string; args: Record<string, unknown> } }
  | { event: "tool_result"; data: { agent: string; tool: string; summary: string } }
  | { event: "diagram_update"; data: DiagramPatch }
  | { event: "message_chunk"; data: { text: string } }
  | { event: "done"; data: { full_text: string } }
  | { event: "error"; data: { message: string } };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: TraceEntry[];
};

export type TraceEntry =
  | { kind: "status"; text: string }
  | { kind: "agent_start"; agent: string }
  | { kind: "agent_end"; agent: string; summary?: string }
  | { kind: "tool_call"; agent: string; tool: string; args: Record<string, unknown> }
  | { kind: "tool_result"; agent: string; tool: string; summary: string }
  | { kind: "error"; message: string };
