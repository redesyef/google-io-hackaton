"""Orchestrator agent.

Receives the user's message, decides which sub-agent(s) to delegate to,
collects their outputs, and streams a synthesized final answer.

Architecture:

    [user msg]
        │
        ▼
   Orchestrator (Gemini 3.5 Flash)
        │  delegate_to_<inventory|cost|deploy>(query)
        ▼
   Sub-agent loop (tools → results)
        │  text summary + tool results + diagram patches
        ▼
   Orchestrator synthesis (streamed)
        │
        ▼
   User
"""
from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from typing import Any

from agents.gemini_backend import GeminiBackend
from agents.sub_agents import AGENT_REGISTRY, SubAgentEvent, SubAgentOutcome, run_sub_agent
from mcp.gcp_client import BaseGcpClient


ORCHESTRATOR_SYSTEM_PROMPT = (
    "You are the CloudCanvas Orchestrator, the lead agent of a multi-agent "
    "system for conversational management of Google Cloud infrastructure. "
    "You coordinate three managed sub-agents:\n"
    "  • inventory — reads the current GCP state (VMs, buckets, SQL, load balancers).\n"
    "  • cost — analyzes billing data and proposes cost optimizations.\n"
    "  • deploy — proposes (never applies) new resources or changes.\n\n"
    "Decision rules:\n"
    "  1. If the user asks 'what do I have / show me my infrastructure / "
    "what's in my project', delegate to inventory.\n"
    "  2. If the user asks about cost, billing, savings, optimization, or "
    "'why is X expensive', delegate to cost.\n"
    "  3. If the user asks to create / add / spin up / deploy / suggest "
    "a new resource, delegate to deploy.\n"
    "  4. For complex requests, you may delegate to several sub-agents in "
    "sequence and synthesize their findings.\n\n"
    "When you have enough information from the sub-agents, write a final "
    "answer in a friendly, executive tone. Reference specific resource "
    "names, dollar amounts, and concrete next steps. Never invent data."
)


DELEGATION_TOOL_SPECS: list[dict[str, Any]] = [
    {
        "name": "delegate_to_inventory",
        "description": "Hand a focused question to the inventory sub-agent. Use when the user wants to know what's currently deployed.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The focused question for the inventory agent."}
            },
            "required": ["query"],
        },
    },
    {
        "name": "delegate_to_cost",
        "description": "Hand a focused question to the cost sub-agent. Use for billing, savings, anomalies, optimization.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The focused question for the cost agent."}
            },
            "required": ["query"],
        },
    },
    {
        "name": "delegate_to_deploy",
        "description": "Hand a high-level deployment intent to the deploy sub-agent. Use when the user wants to create or change a resource.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The deployment intent expressed in plain language."}
            },
            "required": ["query"],
        },
    },
]


def _delegation_to_agent_name(fc_name: str) -> str | None:
    mapping = {
        "delegate_to_inventory": "inventory",
        "delegate_to_cost": "cost",
        "delegate_to_deploy": "deploy",
    }
    return mapping.get(fc_name)


async def run_orchestrator(
    user_message: str,
    gcp: BaseGcpClient,
    gemini: GeminiBackend,
    chat_history: list[dict[str, str]],
) -> AsyncGenerator[dict[str, Any], None]:
    """Yields events as plain dicts: {"event": str, "data": dict}."""

    yield {"event": "status", "data": {"text": "Orchestrator received message…"}}

    history: list[dict[str, Any]] = []
    for turn in chat_history[-6:]:
        history.append({"role": turn["role"], "parts": [{"text": turn["content"]}]})
    history.append({"role": "user", "parts": [{"text": user_message}]})

    sub_agent_summaries: list[str] = []

    for _ in range(4):  # cap delegation rounds
        response = await gemini.generate(
            system_prompt=ORCHESTRATOR_SYSTEM_PROMPT,
            history=history,
            tools=DELEGATION_TOOL_SPECS,
        )

        if not response.function_call:
            break

        fc_name = response.function_call["name"]
        fc_args = response.function_call.get("args") or {}
        agent_name = _delegation_to_agent_name(fc_name)

        if agent_name is None:
            history.append({"role": "model", "parts": [{"function_call": response.function_call}]})
            history.append({
                "role": "user",
                "parts": [{"function_response": {"name": fc_name, "response": {"error": "unknown sub-agent"}}}],
            })
            continue

        spec = AGENT_REGISTRY[agent_name]
        focused_query = fc_args.get("query") or user_message

        yield {"event": "status", "data": {"text": f"Delegating to {agent_name} agent…"}}

        outcome: SubAgentOutcome | None = None
        async for item in run_sub_agent(spec, focused_query, gcp, gemini):
            if isinstance(item, SubAgentEvent):
                yield {"event": item.type, "data": item.payload}
            elif isinstance(item, SubAgentOutcome):
                outcome = item

        if outcome is None:
            outcome = SubAgentOutcome(text="(sub-agent produced no output)", tool_results=[])

        sub_agent_summaries.append(f"[{agent_name}] {outcome.text}")

        history.append({"role": "model", "parts": [{"function_call": response.function_call}]})
        history.append({
            "role": "user",
            "parts": [{
                "function_response": {
                    "name": fc_name,
                    "response": {"summary": outcome.text},
                }
            }],
        })

    # Final synthesis — stream tokens to the client.
    yield {"event": "status", "data": {"text": "Synthesizing answer…"}}

    synthesis_prompt = (
        "Based on the sub-agent outputs in the conversation history, write a "
        "single concise answer to the user. Do not call any more tools. "
        "Use markdown for structure when helpful."
    )
    history.append({"role": "user", "parts": [{"text": synthesis_prompt}]})

    final_text_parts: list[str] = []
    async for chunk in gemini.stream_text(
        system_prompt=ORCHESTRATOR_SYSTEM_PROMPT,
        history=history,
    ):
        final_text_parts.append(chunk)
        yield {"event": "message_chunk", "data": {"text": chunk}}

    full_text = "".join(final_text_parts).strip()
    if not full_text:
        full_text = "\n\n".join(sub_agent_summaries) or "(no answer produced)"
        yield {"event": "message_chunk", "data": {"text": full_text}}

    yield {"event": "done", "data": {"full_text": full_text}}


def serialize_event(evt: dict[str, Any]) -> dict[str, str]:
    return {"event": evt["event"], "data": json.dumps(evt["data"])}
