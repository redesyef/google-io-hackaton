"""Map tool results to generative-UI blocks streamed via SSE.

Each block is a JSON-serializable dict the frontend renders as a card.
Returning None means 'no block for this tool' — chat falls back to text.
"""
from __future__ import annotations

from typing import Any


def ui_block_for(tool_name: str, data: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(data, dict):
        return None

    if tool_name == "full_snapshot":
        return {
            "type": "inventory",
            "project_id": data.get("project_id", ""),
            "counts": {
                "compute": len(data.get("compute") or []),
                "storage": len(data.get("storage") or []),
                "sql": len(data.get("sql") or []),
                "load_balancer": len(data.get("load_balancers") or []),
            },
        }

    if tool_name == "get_billing_summary":
        if data.get("status") == "unavailable":
            return None
        return {
            "type": "cost",
            "monthly_estimate_usd": data.get("monthly_estimate_usd") or 0,
            "by_service": data.get("by_service") or {},
            "anomaly_count": len(data.get("anomalies") or []),
        }

    if tool_name == "suggest_optimization":
        suggestions = data.get("suggestions") or []
        if not suggestions:
            return None
        return {"type": "optimization", "suggestions": suggestions}

    if tool_name == "propose_deploy":
        proposed = data.get("proposed") or {}
        return {
            "type": "proposal",
            "resource_kind": proposed.get("kind", ""),
            "name": proposed.get("label", "").replace(" (proposed)", ""),
            "spec": proposed.get("meta") or {},
            "node_id": proposed.get("id", ""),
        }

    if tool_name == "full_architecture_map":
        return {
            "type": "architecture",
            "primary_count": data.get("primary_count", 0),
            "sub_count": data.get("sub_count", 0),
            "layers": data.get("layers") or {"edge": [], "compute": [], "data": [], "attached": []},
            "diagram_title": data.get("diagram_title", "Full Architecture"),
        }

    if tool_name == "get_resource_context":
        resource = data.get("resource") or {}
        return {
            "type": "context",
            "resource_kind": data.get("kind", ""),
            "name": resource.get("name", ""),
            "context_items": data.get("context_items", 0),
            "diagram_title": data.get("diagram_title", "Context"),
        }

    return None
