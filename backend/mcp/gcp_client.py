"""GCP client abstraction.

Two implementations:
- RealGcpClient: uses google-cloud-* libraries against a real Service Account
- DemoGcpClient: returns realistic synthetic data for live demos

All client methods return plain dicts so they can be serialized to JSON for
both the LLM (as tool results) and the frontend (as diagram updates).
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class BaseGcpClient(ABC):
    project_id: str
    region: str

    @abstractmethod
    def list_projects(self) -> list[dict[str, str]]: ...

    @abstractmethod
    def list_compute_instances(self) -> list[dict[str, Any]]: ...

    @abstractmethod
    def list_buckets(self) -> list[dict[str, Any]]: ...

    @abstractmethod
    def list_sql_instances(self) -> list[dict[str, Any]]: ...

    @abstractmethod
    def list_load_balancers(self) -> list[dict[str, Any]]: ...

    @abstractmethod
    def get_billing_summary(self) -> dict[str, Any]: ...

    def snapshot(self) -> dict[str, Any]:
        """Full inventory snapshot, used to build the initial diagram."""
        return {
            "project_id": self.project_id,
            "region": self.region,
            "compute": self.list_compute_instances(),
            "storage": self.list_buckets(),
            "sql": self.list_sql_instances(),
            "load_balancers": self.list_load_balancers(),
            "billing": self.get_billing_summary(),
        }


# ---------------------------------------------------------------------------
# Real implementation
# ---------------------------------------------------------------------------


class RealGcpClient(BaseGcpClient):
    """Real GCP client. Requires a valid Service Account dict."""

    def __init__(self, sa_info: dict[str, Any], project_id: str, region: str = "us-central1") -> None:
        from google.oauth2 import service_account

        self._creds = service_account.Credentials.from_service_account_info(
            sa_info,
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
        self.project_id = project_id
        self.region = region

    def list_projects(self) -> list[dict[str, str]]:
        from google.cloud import resourcemanager_v3

        client = resourcemanager_v3.ProjectsClient(credentials=self._creds)
        projects: list[dict[str, str]] = []
        try:
            for project in client.search_projects():
                projects.append({"projectId": project.project_id, "name": project.display_name or project.project_id})
        except Exception:
            # Fall back to the SA's own project if Resource Manager access is denied.
            projects.append({"projectId": self.project_id, "name": self.project_id})
        return projects

    def list_compute_instances(self) -> list[dict[str, Any]]:
        try:
            from google.cloud import compute_v1

            client = compute_v1.InstancesClient(credentials=self._creds)
            results: list[dict[str, Any]] = []
            for zone_instances in client.aggregated_list(project=self.project_id):
                _, scoped = zone_instances
                if not scoped.instances:
                    continue
                for inst in scoped.instances:
                    results.append({
                        "id": str(inst.id),
                        "name": inst.name,
                        "zone": inst.zone.split("/")[-1] if inst.zone else "",
                        "machine_type": inst.machine_type.split("/")[-1] if inst.machine_type else "",
                        "status": inst.status,
                    })
            return results
        except Exception:
            return []

    def list_buckets(self) -> list[dict[str, Any]]:
        try:
            from google.cloud import storage

            client = storage.Client(credentials=self._creds, project=self.project_id)
            return [
                {
                    "name": b.name,
                    "location": b.location,
                    "storage_class": b.storage_class,
                }
                for b in client.list_buckets()
            ]
        except Exception:
            return []

    def list_sql_instances(self) -> list[dict[str, Any]]:
        # The official SQL Admin client is not in google-cloud-sql-connector;
        # for the hackathon we report unknown rather than failing the demo.
        return []

    def list_load_balancers(self) -> list[dict[str, Any]]:
        try:
            from google.cloud import compute_v1

            client = compute_v1.ForwardingRulesClient(credentials=self._creds)
            results: list[dict[str, Any]] = []
            for _, scoped in client.aggregated_list(project=self.project_id):
                if not scoped.forwarding_rules:
                    continue
                for fr in scoped.forwarding_rules:
                    results.append({
                        "name": fr.name,
                        "ip_address": fr.I_p_address,
                        "port_range": fr.port_range,
                    })
            return results
        except Exception:
            return []

    def get_billing_summary(self) -> dict[str, Any]:
        # Real Billing API requires extra setup and a Billing Account ID;
        # the hackathon backend exposes a placeholder so the agent can still
        # answer "I don't have billing access" gracefully.
        return {
            "status": "unavailable",
            "reason": "Billing API requires a configured billing account ID.",
            "monthly_estimate_usd": None,
            "anomalies": [],
        }


# ---------------------------------------------------------------------------
# Demo implementation (synthetic but realistic)
# ---------------------------------------------------------------------------


DEMO_SNAPSHOT: dict[str, Any] = {
    "project_id": "demo-shopflow-prod",
    "region": "us-central1",
    "compute": [
        {"id": "web-1", "name": "web-frontend-1", "zone": "us-central1-a", "machine_type": "e2-medium", "status": "RUNNING"},
        {"id": "web-2", "name": "web-frontend-2", "zone": "us-central1-b", "machine_type": "e2-medium", "status": "RUNNING"},
        {"id": "api-1", "name": "api-backend-1", "zone": "us-central1-a", "machine_type": "n2-standard-8", "status": "RUNNING"},
    ],
    "storage": [
        {"name": "shopflow-static-assets", "location": "US", "storage_class": "STANDARD"},
        {"name": "shopflow-backups-cold", "location": "US-CENTRAL1", "storage_class": "NEARLINE"},
    ],
    "sql": [
        {"name": "shopflow-orders-db", "database_version": "POSTGRES_15", "tier": "db-custom-4-16384", "region": "us-central1", "state": "RUNNABLE"},
    ],
    "load_balancers": [
        {"name": "shopflow-lb", "ip_address": "35.190.12.45", "port_range": "443"},
    ],
    "billing": {
        "status": "ok",
        "monthly_estimate_usd": 1842.50,
        "by_service": {
            "Compute Engine": 612.10,
            "Cloud SQL": 894.00,
            "Cloud Storage": 41.40,
            "Networking": 294.00,
        },
        "anomalies": [
            {
                "resource": "api-backend-1",
                "service": "Compute Engine",
                "severity": "high",
                "description": "n2-standard-8 averaging 12% CPU over 30 days. Right-sizing to n2-standard-2 saves ~$210/month.",
            },
            {
                "resource": "shopflow-orders-db",
                "service": "Cloud SQL",
                "severity": "medium",
                "description": "No read replica + no automated backup tier optimization. Adding a read replica would offload ~40% of read traffic.",
            },
        ],
    },
}


class DemoGcpClient(BaseGcpClient):
    def __init__(self, project_id: str = "demo-shopflow-prod", region: str = "us-central1") -> None:
        self.project_id = project_id
        self.region = region

    def list_projects(self) -> list[dict[str, str]]:
        return [
            {"projectId": "demo-shopflow-prod", "name": "ShopFlow Production"},
            {"projectId": "demo-shopflow-staging", "name": "ShopFlow Staging"},
        ]

    def list_compute_instances(self) -> list[dict[str, Any]]:
        return list(DEMO_SNAPSHOT["compute"])

    def list_buckets(self) -> list[dict[str, Any]]:
        return list(DEMO_SNAPSHOT["storage"])

    def list_sql_instances(self) -> list[dict[str, Any]]:
        return list(DEMO_SNAPSHOT["sql"])

    def list_load_balancers(self) -> list[dict[str, Any]]:
        return list(DEMO_SNAPSHOT["load_balancers"])

    def get_billing_summary(self) -> dict[str, Any]:
        return dict(DEMO_SNAPSHOT["billing"])


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def build_client(credentials: dict[str, Any] | None, project_id: str | None, region: str) -> BaseGcpClient:
    if not credentials:
        raise ValueError("no credentials configured")
    if credentials.get("_demo"):
        return DemoGcpClient(project_id=project_id or "demo-shopflow-prod", region=region)
    if not project_id:
        raise ValueError("project_id is required for real credentials")
    return RealGcpClient(credentials, project_id=project_id, region=region)
