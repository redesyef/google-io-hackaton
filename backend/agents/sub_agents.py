"""Sub-agents invoked by the orchestrator.

Each sub-agent is a thin loop:
  1. Receive a focused query from the orchestrator
  2. Plan via Gemini 3.5 Flash with its own (narrow) tool set
  3. Execute tool calls against the live GcpClient
  4. Return a final structured result back to the orchestrator

Each agent yields SSE-shaped events while it runs so the chat UI can show
"inventory agent is calling list_compute_instances..." in real time.
"""
from __future__ import annotations

from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Any

from agents.gemini_backend import (
    make_user_function_response,
    make_user_text,
    model_turn_for_history,
)
from agents.tools import COST_TOOLS, DEPLOY_TOOLS, INVENTORY_TOOLS, ToolResult
from mcp.gcp_client import BaseGcpClient


# ---------------------------------------------------------------------------
# Agent specification
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AgentSpec:
    name: str
    system_prompt: str
    tools: dict[str, Any]


INVENTORY_AGENT = AgentSpec(
    name="inventory",
    system_prompt=(
        "You are the Inventory sub-agent for the CloudCanvas platform. "
        "Your job is to read the current GCP infrastructure and produce "
        "concise factual summaries. Use the available tools to gather data. "
        "Never invent resources.\n\n"
        "Tool selection:\n"
        "  • full_snapshot — for broad 'what do I have' questions.\n"
        "  • list_compute_instances / list_buckets / list_sql_instances — "
        "for focused list-one-thing questions.\n"
        "  • get_resource_context — when the user asks for the 'context', "
        "'details', 'full view', 'expansion', or 'everything about' a "
        "specific named resource. Pass the resource name (e.g. 'api-backend-1') "
        "or the canvas node id (e.g. 'vm:api-backend-1') as resource_id.\n"
        "  • full_architecture_map — when the user asks for the 'complete' / "
        "'full' / 'all layers' / 'whole architecture'. Returns layer-1 plus "
        "every sub-component in one shot.\n\n"
        "When you have enough information, respond with a short paragraph "
        "(≤4 sentences). Do not give opinions or recommendations."
    ),
    tools=INVENTORY_TOOLS,
)


COST_AGENT = AgentSpec(
    name="cost",
    system_prompt=(
        "You are the Cost sub-agent for the CloudCanvas platform. "
        "You analyze billing data and propose optimizations. "
        "First call get_billing_summary; if anomalies exist, call "
        "suggest_optimization. Be specific with dollar amounts and resource "
        "names. Output a 1-paragraph executive summary followed by a "
        "bulleted action list with severity tags [HIGH]/[MED]/[LOW]."
    ),
    tools=COST_TOOLS,
)


DEPLOY_AGENT = AgentSpec(
    name="deploy",
    system_prompt=(
        "You are the Deploy sub-agent for the CloudCanvas platform. "
        "You translate a high-level user request into a concrete resource "
        "proposal using the propose_deploy tool. NEVER apply changes "
        "directly — only PROPOSE. The user must confirm before anything is "
        "actually deployed. Output the proposal as a short summary."
    ),
    tools=DEPLOY_TOOLS,
)


AGENT_REGISTRY: dict[str, AgentSpec] = {
    INVENTORY_AGENT.name: INVENTORY_AGENT,
    COST_AGENT.name: COST_AGENT,
    DEPLOY_AGENT.name: DEPLOY_AGENT,
}


# ---------------------------------------------------------------------------
# Sub-agent runner
# ---------------------------------------------------------------------------


@dataclass
class SubAgentEvent:
    type: str
    payload: dict[str, Any]


@dataclass
class SubAgentOutcome:
    text: str
    tool_results: list[ToolResult]


async def run_sub_agent(
    spec: AgentSpec,
    query: str,
    gcp: BaseGcpClient,
    gemini: Any,  # GeminiBackend
) -> AsyncGenerator[SubAgentEvent | SubAgentOutcome, None]:
    """Drive a sub-agent until it produces a final text answer.

    Yields SubAgentEvent items as it works, then a single SubAgentOutcome
    at the end. Caller is expected to inspect events and surface them to SSE.
    """
    yield SubAgentEvent("agent_start", {"agent": spec.name})

    tool_specs = _tool_specs_for(spec)
    history: list[Any] = [make_user_text(query)]
    collected: list[ToolResult] = []

    for _ in range(4):  # safety cap on tool-call turns
        response = await gemini.generate(
            system_prompt=spec.system_prompt,
            history=history,
            tools=tool_specs,
        )

        if response.function_call:
            fc_name = response.function_call["name"]
            fc_args = response.function_call.get("args") or {}
            yield SubAgentEvent("tool_call", {"agent": spec.name, "tool": fc_name, "args": fc_args})

            if fc_name not in spec.tools:
                history.append(model_turn_for_history(response))
                history.append(make_user_function_response(fc_name, {"error": "tool not available"}))
                continue

            try:
                result = spec.tools[fc_name](gcp, **fc_args) if fc_args else spec.tools[fc_name](gcp)
            except TypeError:
                result = spec.tools[fc_name](gcp)
            except Exception as exc:
                result = ToolResult(data={"error": str(exc)}, summary=f"Tool {fc_name} failed: {exc}")

            collected.append(result)
            yield SubAgentEvent("tool_result", {"agent": spec.name, "tool": fc_name, "summary": result.summary})
            if result.diagram_patch:
                yield SubAgentEvent("diagram_update", result.diagram_patch)

            history.append(model_turn_for_history(response))
            history.append(make_user_function_response(fc_name, result.data))
            continue

        text = response.text or "(no answer)"
        yield SubAgentEvent("agent_end", {"agent": spec.name, "summary": text[:160]})
        yield SubAgentOutcome(text=text, tool_results=collected)
        return

    fallback = "Sub-agent exceeded the tool-call budget without producing a final answer."
    yield SubAgentEvent("agent_end", {"agent": spec.name, "summary": fallback})
    yield SubAgentOutcome(text=fallback, tool_results=collected)


# ---------------------------------------------------------------------------
# Tool spec → Gemini function declarations
# ---------------------------------------------------------------------------


_TOOL_SCHEMAS: dict[str, dict[str, Any]] = {
    "full_snapshot": {
        "description": "Return the complete inventory of resources in the current project: VMs, buckets, SQL, load balancers, plus billing summary.",
        "parameters": {"type": "object", "properties": {}},
    },
    "list_compute_instances": {
        "description": "List all Compute Engine VMs in the current project.",
        "parameters": {"type": "object", "properties": {}},
    },
    "list_buckets": {
        "description": "List all Cloud Storage buckets in the current project.",
        "parameters": {"type": "object", "properties": {}},
    },
    "list_sql_instances": {
        "description": "List all Cloud SQL instances in the current project.",
        "parameters": {"type": "object", "properties": {}},
    },
    "get_resource_context": {
        "description": (
            "Return the expanded context of a single named resource: its "
            "attached components (disks, networks, IAM, lifecycle rules, "
            "etc). The new sub-nodes appear on the canvas anchored to the "
            "original node without touching the rest of the diagram."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "resource_id": {
                    "type": "string",
                    "description": "Resource name (e.g. 'api-backend-1') or canvas node id (e.g. 'vm:api-backend-1').",
                },
            },
            "required": ["resource_id"],
        },
    },
    "full_architecture_map": {
        "description": (
            "Build the complete multi-layer architecture map in one shot: "
            "primary resources (LB, VMs, SQL, buckets) PLUS the expanded "
            "sub-graph (disks, networks, IAM, lifecycle, SSL, WAF, etc.) "
            "for every one of them. Use this when the user asks for the "
            "full / complete / all-layers architecture."
        ),
        "parameters": {"type": "object", "properties": {}},
    },
    "get_billing_summary": {
        "description": "Return the monthly cost estimate, per-service breakdown, and any detected anomalies for the current project.",
        "parameters": {"type": "object", "properties": {}},
    },
    "suggest_optimization": {
        "description": "Generate cost-optimization suggestions based on billing anomalies. Highlights the affected resources on the live diagram.",
        "parameters": {"type": "object", "properties": {}},
    },
    "propose_deploy": {
        "description": (
            "Propose creating a new GCP resource. Does NOT apply changes — "
            "surfaces a ghost node on the diagram pending user confirmation."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "resource_kind": {
                    "type": "string",
                    "enum": ["compute", "storage", "sql", "load_balancer"],
                    "description": "Type of GCP resource to propose.",
                },
                "name": {"type": "string", "description": "Resource name (must be unique)."},
                "spec": {
                    "type": "object",
                    "description": "Free-form spec dict (machine_type, storage_class, region, etc.).",
                },
            },
            "required": ["resource_kind", "name", "spec"],
        },
    },
}


def _tool_specs_for(spec: AgentSpec) -> list[dict[str, Any]]:
    return [
        {"name": tool_name, **_TOOL_SCHEMAS[tool_name]}
        for tool_name in spec.tools
        if tool_name in _TOOL_SCHEMAS
    ]
