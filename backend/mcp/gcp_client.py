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
#
# ShopFlow Inc — global e-commerce platform, ~12,500 monthly active users.
# Multi-region: us-central1 (primary, prod traffic) and europe-west1 (DR +
# EU GDPR-compliant data residency). The demo data is deliberately rich so
# the agents have something interesting to talk about: idle EU capacity,
# oversized read replica, cold-tier candidates, missing CUDs, anomalous
# egress, etc.
# ---------------------------------------------------------------------------


DEMO_SNAPSHOT: dict[str, Any] = {
    "project_id": "shopflow-prod-12345",
    "region": "us-central1",
    "compute": [
        # Web tier — public-facing Next.js frontends (autoscaling MIG)
        {"id": "web-1", "name": "web-frontend-1", "zone": "us-central1-a", "machine_type": "n2-standard-4", "status": "RUNNING"},
        {"id": "web-2", "name": "web-frontend-2", "zone": "us-central1-b", "machine_type": "n2-standard-4", "status": "RUNNING"},
        {"id": "web-3", "name": "web-frontend-3", "zone": "us-central1-c", "machine_type": "n2-standard-4", "status": "RUNNING"},
        # API tier — Node.js backends behind internal LB
        {"id": "api-1", "name": "api-backend-1", "zone": "us-central1-a", "machine_type": "n2-standard-8", "status": "RUNNING"},
        {"id": "api-2", "name": "api-backend-2", "zone": "us-central1-b", "machine_type": "n2-standard-8", "status": "RUNNING"},
        {"id": "api-3", "name": "api-backend-3", "zone": "us-central1-c", "machine_type": "n2-standard-8", "status": "RUNNING"},
        {"id": "api-4", "name": "api-backend-4", "zone": "us-central1-a", "machine_type": "n2-standard-8", "status": "RUNNING"},
        # DR region (EU)
        {"id": "api-eu-1", "name": "api-backend-eu-1", "zone": "europe-west1-b", "machine_type": "n2-standard-8", "status": "RUNNING"},
        {"id": "api-eu-2", "name": "api-backend-eu-2", "zone": "europe-west1-c", "machine_type": "n2-standard-8", "status": "RUNNING"},
        # Background worker tier (cron, Pub/Sub consumers)
        {"id": "worker-1", "name": "worker-jobs-1", "zone": "us-central1-a", "machine_type": "n2-standard-4", "status": "RUNNING"},
        {"id": "worker-2", "name": "worker-jobs-2", "zone": "us-central1-b", "machine_type": "n2-standard-4", "status": "RUNNING"},
        # Self-hosted Redis cache (legacy — should migrate to Memorystore)
        {"id": "cache-1", "name": "cache-redis-1", "zone": "us-central1-a", "machine_type": "n2-highmem-4", "status": "RUNNING"},
        {"id": "cache-2", "name": "cache-redis-2", "zone": "us-central1-b", "machine_type": "n2-highmem-4", "status": "RUNNING"},
        # Bastion / ops jump host
        {"id": "bastion", "name": "ops-bastion", "zone": "us-central1-a", "machine_type": "e2-small", "status": "RUNNING"},
    ],
    "storage": [
        {"name": "shopflow-static-assets", "location": "US", "storage_class": "STANDARD"},
        {"name": "shopflow-user-uploads", "location": "US", "storage_class": "STANDARD"},
        {"name": "shopflow-product-images", "location": "MULTI-REGION-US", "storage_class": "STANDARD"},
        {"name": "shopflow-invoices-pdf", "location": "US-CENTRAL1", "storage_class": "STANDARD"},
        {"name": "shopflow-ml-models", "location": "US-CENTRAL1", "storage_class": "STANDARD"},
        {"name": "shopflow-analytics-export", "location": "US-CENTRAL1", "storage_class": "STANDARD"},
        {"name": "shopflow-logs-archive", "location": "US-CENTRAL1", "storage_class": "NEARLINE"},
        {"name": "shopflow-backups-cold", "location": "US-CENTRAL1", "storage_class": "COLDLINE"},
        # GDPR-compliant EU residency
        {"name": "shopflow-eu-user-data", "location": "EUROPE-WEST1", "storage_class": "STANDARD"},
    ],
    "sql": [
        {"name": "shopflow-orders-db", "database_version": "POSTGRES_15", "tier": "db-custom-8-32768", "region": "us-central1", "state": "RUNNABLE"},
        {"name": "shopflow-orders-db-replica", "database_version": "POSTGRES_15", "tier": "db-custom-8-32768", "region": "us-central1", "state": "RUNNABLE"},
        {"name": "shopflow-sessions-db", "database_version": "MYSQL_8_0", "tier": "db-custom-4-16384", "region": "us-central1", "state": "RUNNABLE"},
        {"name": "shopflow-analytics-warehouse", "database_version": "POSTGRES_15", "tier": "db-custom-16-65536", "region": "us-central1", "state": "RUNNABLE"},
        {"name": "shopflow-eu-orders-db", "database_version": "POSTGRES_15", "tier": "db-custom-4-16384", "region": "europe-west1", "state": "RUNNABLE"},
    ],
    "load_balancers": [
        {"name": "shopflow-global-lb", "ip_address": "35.190.12.45", "port_range": "443"},
        {"name": "shopflow-internal-api-lb", "ip_address": "10.128.0.18", "port_range": "8080"},
        {"name": "shopflow-eu-lb", "ip_address": "35.241.7.92", "port_range": "443"},
    ],
    "billing": {
        "status": "ok",
        "monthly_estimate_usd": 24582.40,
        "by_service": {
            "Compute Engine": 8420.50,
            "Cloud SQL": 7280.00,
            "Networking": 4180.30,
            "BigQuery": 1840.00,
            "Cloud Storage": 1410.80,
            "Cloud Logging": 980.20,
            "Cloud Monitoring": 470.60,
        },
        "anomalies": [
            {
                "resource": "api-backend-eu-1",
                "service": "Compute Engine",
                "severity": "high",
                "description": "EU backup region averaging 4% CPU over 30 days (failover never triggered). Right-sizing to n2-standard-2 + stopping api-backend-eu-2 saves ~$680/month.",
            },
            {
                "resource": "shopflow-orders-db-replica",
                "service": "Cloud SQL",
                "severity": "high",
                "description": "Read replica is identical tier to primary (db-custom-8-32768) but only serves 18% of read traffic. Downsizing to db-custom-4-16384 saves ~$480/month with no measurable latency impact.",
            },
            {
                "resource": "shopflow-logs-archive",
                "service": "Cloud Storage",
                "severity": "high",
                "description": "412 GB of logs older than 90 days still on NEARLINE. Lifecycle rule → COLDLINE @ 90d → ARCHIVE @ 180d would save ~$210/month.",
            },
            {
                "resource": "cache-redis-1",
                "service": "Compute Engine",
                "severity": "medium",
                "description": "Self-managed Redis on n2-highmem-4. Migrating to Memorystore Standard (5GB) would cut $310/month and remove the manual ops burden.",
            },
            {
                "resource": "shopflow-orders-db",
                "service": "Cloud SQL",
                "severity": "medium",
                "description": "No committed-use discount applied. A 1-year CUD across primary + analytics-warehouse would unlock ~$1,200/month (≈17%) savings.",
            },
            {
                "resource": "shopflow-product-images",
                "service": "Networking",
                "severity": "medium",
                "description": "Egress to europe-west1 averages 4.2 TB/month — Cloud CDN edge caching is OFF for this bucket. Enabling would save ~$380/month and cut p95 latency by 60%.",
            },
            {
                "resource": "worker-jobs-2",
                "service": "Compute Engine",
                "severity": "low",
                "description": "Pub/Sub queue depth averages <2 messages; worker-jobs-2 is mostly idle. Cloud Run Jobs with --max-instances=3 would replace both workers and save ~$95/month.",
            },
            {
                "resource": "shopflow-analytics-warehouse",
                "service": "BigQuery",
                "severity": "low",
                "description": "23% of BigQuery slots used on repeated full-table scans of `order_events`. A partition-by-date + cluster-by-region rewrite would cut ~$140/month.",
            },
        ],
    },
}


class DemoGcpClient(BaseGcpClient):
    def __init__(self, project_id: str = "shopflow-prod-12345", region: str = "us-central1") -> None:
        self.project_id = project_id
        self.region = region

    def list_projects(self) -> list[dict[str, str]]:
        return [
            {"projectId": "shopflow-prod-12345", "name": "ShopFlow Production (US + EU)"},
            {"projectId": "shopflow-staging-12345", "name": "ShopFlow Staging"},
            {"projectId": "shopflow-data-warehouse", "name": "ShopFlow Data Warehouse"},
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
