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


def _expand_resource(parent_id: str, parent_kind: str, target: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Build the sub-graph (attached components) for a single resource."""
    sub_nodes: list[dict[str, Any]] = []
    if parent_kind == "compute":
        sub_nodes = [
            {"id": f"{parent_id}/disk:boot", "kind": "disk", "label": f"{target['name']}-boot", "subtitle": "pd-balanced · 50GB", "parent_id": parent_id, "meta": {"size_gb": 50, "type": "pd-balanced"}},
            {"id": f"{parent_id}/network:vpc-default", "kind": "network", "label": "vpc-default", "subtitle": "us-central1 · 10.128.0.0/20", "parent_id": parent_id, "meta": {"cidr": "10.128.0.0/20"}},
            {"id": f"{parent_id}/sa:compute-default", "kind": "iam", "label": "compute-default", "subtitle": "Service account", "parent_id": parent_id, "meta": {"email": "default@compute.iam.gserviceaccount.com"}},
            {"id": f"{parent_id}/firewall:allow-http", "kind": "firewall", "label": "allow-http", "subtitle": "TCP:80,443 from 0.0.0.0/0", "parent_id": parent_id, "meta": {"ports": [80, 443]}},
        ]
    elif parent_kind == "sql":
        sub_nodes = [
            {"id": f"{parent_id}/backup:auto", "kind": "backup", "label": "Automated backups", "subtitle": "7-day retention", "parent_id": parent_id},
            {"id": f"{parent_id}/network:private", "kind": "network", "label": "private-ip", "subtitle": "VPC peering enabled", "parent_id": parent_id},
            {"id": f"{parent_id}/db:orders", "kind": "database", "label": "orders", "subtitle": "Schema · 47 tables", "parent_id": parent_id},
            {"id": f"{parent_id}/db:sessions", "kind": "database", "label": "sessions", "subtitle": "Schema · 4 tables", "parent_id": parent_id},
        ]
    elif parent_kind == "storage":
        sub_nodes = [
            {"id": f"{parent_id}/lifecycle:nearline-30d", "kind": "lifecycle", "label": "→ Nearline @ 30d", "subtitle": "Lifecycle rule", "parent_id": parent_id},
            {"id": f"{parent_id}/iam:public-read", "kind": "iam", "label": "allUsers: read", "subtitle": "Public bucket", "parent_id": parent_id},
            {"id": f"{parent_id}/cdn:edge", "kind": "cdn", "label": "Cloud CDN edge", "subtitle": "94 PoPs", "parent_id": parent_id},
        ]
    elif parent_kind == "load_balancer":
        sub_nodes = [
            {"id": f"{parent_id}/ssl:wildcard", "kind": "ssl", "label": "*.shopflow.app", "subtitle": "Managed SSL · valid 87d", "parent_id": parent_id},
            {"id": f"{parent_id}/backend-svc", "kind": "service", "label": "web-backend-svc", "subtitle": "Backend service", "parent_id": parent_id},
            {"id": f"{parent_id}/policy:waf", "kind": "policy", "label": "shopflow-waf", "subtitle": "Cloud Armor", "parent_id": parent_id},
        ]
    sub_edges = [
        {"id": f"e:{parent_id}~{n['id']}", "source": parent_id, "target": n["id"], "sub": True}
        for n in sub_nodes
    ]
    return sub_nodes, sub_edges


def tool_get_resource_context(client: BaseGcpClient, resource_id: str) -> ToolResult:
    """Return the expanded context for a single resource: attached components,
    config, dependencies. Adds sub-nodes anchored to the parent on the canvas.
    """
    snap = client.snapshot()
    target = None
    parent_kind = None
    for vm in snap.get("compute", []):
        if resource_id in (vm["name"], f"vm:{vm['name']}", vm.get("id")):
            target = vm; parent_kind = "compute"; break
    if target is None:
        for s in snap.get("sql", []):
            if resource_id in (s["name"], f"sql:{s['name']}"):
                target = s; parent_kind = "sql"; break
    if target is None:
        for b in snap.get("storage", []):
            if resource_id in (b["name"], f"bucket:{b['name']}"):
                target = b; parent_kind = "storage"; break
    if target is None:
        for lb in snap.get("load_balancers", []):
            if resource_id in (lb["name"], f"lb:{lb['name']}"):
                target = lb; parent_kind = "load_balancer"; break

    if target is None:
        return ToolResult(
            data={"error": f"resource '{resource_id}' not found"},
            summary=f"Could not find resource {resource_id}.",
        )

    parent_id = {
        "compute": f"vm:{target['name']}",
        "sql": f"sql:{target['name']}",
        "storage": f"bucket:{target['name']}",
        "load_balancer": f"lb:{target['name']}",
    }[parent_kind]

    sub_nodes, sub_edges = _expand_resource(parent_id, parent_kind, target)

    return ToolResult(
        data={"resource": target, "kind": parent_kind, "context_items": len(sub_nodes)},
        summary=f"Expanded context for {target['name']}: {len(sub_nodes)} related components.",
        diagram_patch={"nodes_add": sub_nodes, "edges_add": sub_edges},
    )


# ---------------------------------------------------------------------------
# Catalog grouped by sub-agent
# ---------------------------------------------------------------------------


def tool_full_architecture_map(client: BaseGcpClient) -> ToolResult:
    """Build the multi-layer architecture in one go: primary resources
    (LB, VMs, SQL, buckets) PLUS the expanded sub-graph (disks, networks,
    IAM, lifecycle, etc.) for each. One tool call → full canvas."""
    snap = client.snapshot()
    primary = snapshot_to_diagram(snap)
    primary_nodes = primary["nodes_replace"]
    primary_edges = primary["edges_replace"]

    all_sub_nodes: list[dict[str, Any]] = []
    all_sub_edges: list[dict[str, Any]] = []

    for vm in snap.get("compute", []):
        sn, se = _expand_resource(f"vm:{vm['name']}", "compute", vm)
        all_sub_nodes.extend(sn); all_sub_edges.extend(se)
    for s in snap.get("sql", []):
        sn, se = _expand_resource(f"sql:{s['name']}", "sql", s)
        all_sub_nodes.extend(sn); all_sub_edges.extend(se)
    for b in snap.get("storage", []):
        sn, se = _expand_resource(f"bucket:{b['name']}", "storage", b)
        all_sub_nodes.extend(sn); all_sub_edges.extend(se)
    for lb in snap.get("load_balancers", []):
        sn, se = _expand_resource(f"lb:{lb['name']}", "load_balancer", lb)
        all_sub_nodes.extend(sn); all_sub_edges.extend(se)

    return ToolResult(
        data={
            "primary_count": len(primary_nodes),
            "sub_count": len(all_sub_nodes),
            "layers": {
                "edge": [n["id"] for n in primary_nodes if n["kind"] == "load_balancer"],
                "compute": [n["id"] for n in primary_nodes if n["kind"] == "compute"],
                "data": [n["id"] for n in primary_nodes if n["kind"] in ("sql", "storage")],
                "attached": [n["id"] for n in all_sub_nodes],
            },
        },
        summary=(
            f"Full architecture map built: layer-1 has {len(primary_nodes)} primary "
            f"resources, plus {len(all_sub_nodes)} sub-components across every layer."
        ),
        diagram_patch={
            "nodes_replace": primary_nodes,
            "edges_replace": primary_edges,
            "nodes_add": all_sub_nodes,
            "edges_add": all_sub_edges,
        },
    )


INVENTORY_TOOLS = {
    "full_snapshot": tool_full_snapshot,
    "list_compute_instances": tool_list_compute_instances,
    "list_buckets": tool_list_buckets,
    "list_sql_instances": tool_list_sql,
    "get_resource_context": tool_get_resource_context,
    "full_architecture_map": tool_full_architecture_map,
}

COST_TOOLS = {
    "get_billing_summary": tool_get_billing,
    "suggest_optimization": tool_suggest_optimization,
}

DEPLOY_TOOLS = {
    "propose_deploy": tool_propose_deploy,
}

ALL_TOOLS: dict[str, Any] = {**INVENTORY_TOOLS, **COST_TOOLS, **DEPLOY_TOOLS}
