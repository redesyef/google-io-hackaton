"""Tool catalog exposed to the sub-agents.

Each tool is a thin wrapper around the GcpClient that:
1. Performs the GCP read/write
2. Returns a JSON-serializable result for the LLM
3. Optionally yields a `diagram_update` patch so the frontend canvas
   reflects what the agent learned/changed in real time
"""
from __future__ import annotations

from typing import Any

from mcp.gcp_client import BaseGcpClient


# ---------------------------------------------------------------------------
# Diagram patch helpers
# ---------------------------------------------------------------------------


def _vm_node(vm: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": f"vm:{vm['name']}",
        "kind": "compute",
        "label": vm["name"],
        "subtitle": vm.get("machine_type", ""),
        "status": vm.get("status", "UNKNOWN"),
        "meta": vm,
    }


def _bucket_node(b: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": f"bucket:{b['name']}",
        "kind": "storage",
        "label": b["name"],
        "subtitle": b.get("storage_class", ""),
        "meta": b,
    }


def _sql_node(s: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": f"sql:{s['name']}",
        "kind": "sql",
        "label": s["name"],
        "subtitle": s.get("tier", ""),
        "meta": s,
    }


def _lb_node(lb: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": f"lb:{lb['name']}",
        "kind": "load_balancer",
        "label": lb["name"],
        "subtitle": lb.get("ip_address", ""),
        "meta": lb,
    }


def snapshot_to_diagram(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Build a complete diagram patch from a fresh inventory snapshot."""
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []

    lbs = snapshot.get("load_balancers", [])
    vms = snapshot.get("compute", [])
    sqls = snapshot.get("sql", [])
    buckets = snapshot.get("storage", [])

    for lb in lbs:
        nodes.append(_lb_node(lb))
    for vm in vms:
        nodes.append(_vm_node(vm))
    for s in sqls:
        nodes.append(_sql_node(s))
    for b in buckets:
        nodes.append(_bucket_node(b))

    # Heuristic wiring for the demo: LB → web VMs → API VMs → SQL; web VMs → buckets.
    web_vms = [vm for vm in vms if "web" in vm["name"].lower() or "frontend" in vm["name"].lower()]
    api_vms = [vm for vm in vms if "api" in vm["name"].lower() or "backend" in vm["name"].lower()]
    if not web_vms and not api_vms:
        web_vms = vms

    for lb in lbs:
        for vm in web_vms:
            edges.append({"id": f"e:{lb['name']}->{vm['name']}", "source": f"lb:{lb['name']}", "target": f"vm:{vm['name']}"})
    for vm in web_vms:
        for av in api_vms:
            edges.append({"id": f"e:{vm['name']}->{av['name']}", "source": f"vm:{vm['name']}", "target": f"vm:{av['name']}"})
        for b in buckets:
            edges.append({"id": f"e:{vm['name']}->{b['name']}", "source": f"vm:{vm['name']}", "target": f"bucket:{b['name']}"})
    for av in api_vms:
        for s in sqls:
            edges.append({"id": f"e:{av['name']}->{s['name']}", "source": f"vm:{av['name']}", "target": f"sql:{s['name']}"})

    return {"nodes_replace": nodes, "edges_replace": edges}


# ---------------------------------------------------------------------------
# Tool result type
# ---------------------------------------------------------------------------


class ToolResult:
    __slots__ = ("data", "summary", "diagram_patch")

    def __init__(
        self,
        data: Any,
        summary: str,
        diagram_patch: dict[str, Any] | None = None,
    ) -> None:
        self.data = data
        self.summary = summary
        self.diagram_patch = diagram_patch


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------


def tool_full_snapshot(client: BaseGcpClient) -> ToolResult:
    snap = client.snapshot()
    return ToolResult(
        data=snap,
        summary=(
            f"Inventory: {len(snap['compute'])} VMs, "
            f"{len(snap['storage'])} buckets, "
            f"{len(snap['sql'])} SQL instances, "
            f"{len(snap['load_balancers'])} load balancers in {snap['project_id']}."
        ),
        diagram_patch=snapshot_to_diagram(snap),
    )


def tool_list_compute_instances(client: BaseGcpClient) -> ToolResult:
    vms = client.list_compute_instances()
    return ToolResult(
        data={"instances": vms},
        summary=f"Found {len(vms)} compute instance(s).",
    )


def tool_list_buckets(client: BaseGcpClient) -> ToolResult:
    buckets = client.list_buckets()
    return ToolResult(data={"buckets": buckets}, summary=f"Found {len(buckets)} bucket(s).")


def tool_list_sql(client: BaseGcpClient) -> ToolResult:
    sqls = client.list_sql_instances()
    return ToolResult(data={"instances": sqls}, summary=f"Found {len(sqls)} SQL instance(s).")


def tool_get_billing(client: BaseGcpClient) -> ToolResult:
    bill = client.get_billing_summary()
    if bill.get("status") == "unavailable":
        return ToolResult(data=bill, summary="Billing data unavailable for this project.")
    monthly = bill.get("monthly_estimate_usd")
    n_anom = len(bill.get("anomalies", []))
    return ToolResult(
        data=bill,
        summary=f"Monthly estimate ${monthly:.2f}, {n_anom} cost anomaly{'ies' if n_anom != 1 else 'y'} detected.",
    )


def tool_suggest_optimization(client: BaseGcpClient) -> ToolResult:
    """Synthesize optimization suggestions from billing anomalies + inventory."""
    bill = client.get_billing_summary()
    anomalies = bill.get("anomalies", [])
    suggestions = []
    for a in anomalies:
        suggestions.append({
            "target": a["resource"],
            "severity": a["severity"],
            "action": a["description"],
        })
    if not suggestions:
        return ToolResult(
            data={"suggestions": []},
            summary="No obvious optimizations found from current billing signals.",
        )
    return ToolResult(
        data={"suggestions": suggestions},
        summary=f"{len(suggestions)} optimization opportunity(ies) found.",
        diagram_patch={
            "highlight": [s["target"] for s in suggestions],
            "highlight_reason": "optimization-target",
        },
    )


def tool_propose_deploy(client: BaseGcpClient, resource_kind: str, name: str, spec: dict[str, Any]) -> ToolResult:
    """Propose (but don't execute) a new resource — surfaces a 'ghost' node on the diagram."""
    label = f"{name} (proposed)"
    if resource_kind == "compute":
        node = {
            "id": f"vm:{name}",
            "kind": "compute",
            "label": label,
            "subtitle": spec.get("machine_type", ""),
            "status": "PROPOSED",
            "meta": spec,
            "proposed": True,
        }
    elif resource_kind == "storage":
        node = {
            "id": f"bucket:{name}",
            "kind": "storage",
            "label": label,
            "subtitle": spec.get("storage_class", "STANDARD"),
            "meta": spec,
            "proposed": True,
        }
    else:
        node = {
            "id": f"{resource_kind}:{name}",
            "kind": resource_kind,
            "label": label,
            "subtitle": "",
            "meta": spec,
            "proposed": True,
        }
    return ToolResult(
        data={"proposed": node},
        summary=f"Proposed new {resource_kind}: {name} (not applied).",
        diagram_patch={"nodes_add": [node]},
    )


# ---------------------------------------------------------------------------
# Catalog grouped by sub-agent
# ---------------------------------------------------------------------------


INVENTORY_TOOLS = {
    "full_snapshot": tool_full_snapshot,
    "list_compute_instances": tool_list_compute_instances,
    "list_buckets": tool_list_buckets,
    "list_sql_instances": tool_list_sql,
}

COST_TOOLS = {
    "get_billing_summary": tool_get_billing,
    "suggest_optimization": tool_suggest_optimization,
}

DEPLOY_TOOLS = {
    "propose_deploy": tool_propose_deploy,
}

ALL_TOOLS: dict[str, Any] = {**INVENTORY_TOOLS, **COST_TOOLS, **DEPLOY_TOOLS}
