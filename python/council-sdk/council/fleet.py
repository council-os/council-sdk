"""Fleet namespace — fleet-level safety intelligence & dashboard."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from .transport import Transport


# =============================================================================
# Data classes
# =============================================================================


@dataclass
class FleetMetrics:
    """Fleet health snapshot."""

    total_requests_per_min: float
    scope_elevations_per_hour: int
    denials_per_hour: int
    anomalous_agent_count: int
    fleet_risk: str  # "normal" | "elevated" | "critical"
    timestamp: str


@dataclass
class CoordinatedAnomaly:
    """A detected fleet-level anomaly."""

    type: str
    description: str
    involved_agents: list[str]
    detected_at: str
    severity: str
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class CapabilityRisk:
    """A dangerous capability composition."""

    agents: list[str]
    scopes: list[str]
    combined_risk: str
    severity: str


@dataclass
class CollusionAlert:
    """A detected collusion alert."""

    type: str
    description: str
    involved_agents: list[str]
    confidence: float
    evidence: dict[str, Any]
    detected_at: str
    severity: str


@dataclass
class DeviationReport:
    """An agent's behavioural deviation report."""

    agent_id: str
    deviations: list[dict[str, Any]]
    overall_score: float
    timestamp: str


@dataclass
class CommunicationEdge:
    """An edge in the agent communication graph."""

    from_agent: str
    to_agent: str
    weight: int
    last_seen: int


@dataclass
class InvariantViolation:
    """A safety invariant violation."""

    invariant: str
    description: str
    details: dict[str, Any]
    timestamp: str


@dataclass
class InvariantCheckResult:
    """Result of running all safety invariant checks."""

    passed: bool
    violations: list[InvariantViolation]
    checked_at: str


@dataclass
class DashboardOverview:
    """Combined dashboard overview."""

    fleet: FleetMetrics
    anomalies: dict[str, Any]
    collusion: dict[str, Any]
    deviations: dict[str, Any]
    invariants: dict[str, Any]
    timestamp: str


# =============================================================================
# FleetNamespace
# =============================================================================


class FleetNamespace:
    """Fleet-level safety intelligence and dashboard.

    Example::

        overview = await client.fleet.overview()
        anomalies = await client.fleet.anomalies(hours=4)
        alerts = await client.fleet.collusion_alerts()
    """

    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    # ── Fleet Metrics ───────────────────────────────────────────────────

    async def metrics(self) -> FleetMetrics:
        """Get current fleet health snapshot."""
        data = await self._transport.get("/api/v1/safety/fleet/metrics")
        payload = data.get("data", data)
        return _parse_fleet_metrics(payload)

    async def anomalies(self, hours: int = 1) -> list[CoordinatedAnomaly]:
        """Get coordinated anomaly alerts."""
        data = await self._transport.get(
            "/api/v1/safety/fleet/anomalies", params={"hours": hours}
        )
        items = data.get("data", data)
        return [_parse_anomaly(a) for a in items] if isinstance(items, list) else []

    async def capabilities(self) -> list[CapabilityRisk]:
        """Get dangerous capability compositions."""
        data = await self._transport.get("/api/v1/safety/fleet/capabilities")
        items = data.get("data", data)
        return [_parse_capability(c) for c in items] if isinstance(items, list) else []

    async def analyse(self) -> dict[str, Any]:
        """Trigger full fleet analysis."""
        return await self._transport.post(
            "/api/v1/safety/fleet/analyse", json={}
        )

    # ── Collusion Detection ─────────────────────────────────────────────

    async def collusion_alerts(self, hours: int = 1) -> list[CollusionAlert]:
        """Get recent collusion alerts."""
        data = await self._transport.get(
            "/api/v1/safety/collusion/alerts", params={"hours": hours}
        )
        items = data.get("data", data)
        return [_parse_collusion(a) for a in items] if isinstance(items, list) else []

    async def collusion_scan(self) -> dict[str, Any]:
        """Trigger full collusion scan."""
        return await self._transport.post(
            "/api/v1/safety/collusion/scan", json={}
        )

    # ── Behavioural Profiling ───────────────────────────────────────────

    async def deviations(self) -> list[DeviationReport]:
        """Get agents with behavioural deviations."""
        data = await self._transport.get("/api/v1/safety/agents/deviations")
        items = data.get("data", data)
        return [_parse_deviation(d) for d in items] if isinstance(items, list) else []

    async def communication_graph(self) -> list[CommunicationEdge]:
        """Get the agent communication graph."""
        data = await self._transport.get("/api/v1/safety/agents/graph")
        items = data.get("data", data)
        return [_parse_edge(e) for e in items] if isinstance(items, list) else []

    # ── Invariants ──────────────────────────────────────────────────────

    async def invariants(self) -> InvariantCheckResult:
        """Run all safety invariant checks."""
        data = await self._transport.get("/api/v1/safety/invariants")
        return InvariantCheckResult(
            passed=data.get("passed", False),
            violations=[
                InvariantViolation(**v) for v in data.get("violations", [])
            ],
            checked_at=data.get("checkedAt", ""),
        )

    # ── Overview ────────────────────────────────────────────────────────

    async def overview(self) -> DashboardOverview:
        """Combined dashboard overview."""
        data = await self._transport.get("/api/v1/safety/overview")
        return DashboardOverview(
            fleet=_parse_fleet_metrics(data.get("fleet", {})),
            anomalies=data.get("anomalies", {}),
            collusion=data.get("collusion", {}),
            deviations=data.get("deviations", {}),
            invariants=data.get("invariants", {}),
            timestamp=data.get("timestamp", ""),
        )


# =============================================================================
# Parsers
# =============================================================================


def _parse_fleet_metrics(d: dict[str, Any]) -> FleetMetrics:
    return FleetMetrics(
        total_requests_per_min=d.get("totalRequestsPerMin", 0),
        scope_elevations_per_hour=d.get("scopeElevationsPerHour", 0),
        denials_per_hour=d.get("denialsPerHour", 0),
        anomalous_agent_count=d.get("anomalousAgentCount", 0),
        fleet_risk=d.get("fleetRisk", "normal"),
        timestamp=d.get("timestamp", ""),
    )


def _parse_anomaly(d: dict[str, Any]) -> CoordinatedAnomaly:
    return CoordinatedAnomaly(
        type=d.get("type", ""),
        description=d.get("description", ""),
        involved_agents=d.get("involvedAgents", []),
        detected_at=d.get("detectedAt", ""),
        severity=d.get("severity", "warning"),
        details=d.get("details", {}),
    )


def _parse_capability(d: dict[str, Any]) -> CapabilityRisk:
    return CapabilityRisk(
        agents=d.get("agents", []),
        scopes=d.get("scopes", []),
        combined_risk=d.get("combinedRisk", ""),
        severity=d.get("severity", "warning"),
    )


def _parse_collusion(d: dict[str, Any]) -> CollusionAlert:
    return CollusionAlert(
        type=d.get("type", ""),
        description=d.get("description", ""),
        involved_agents=d.get("involvedAgents", []),
        confidence=d.get("confidence", 0),
        evidence=d.get("evidence", {}),
        detected_at=d.get("detectedAt", ""),
        severity=d.get("severity", "warning"),
    )


def _parse_deviation(d: dict[str, Any]) -> DeviationReport:
    return DeviationReport(
        agent_id=d.get("agentId", ""),
        deviations=d.get("deviations", []),
        overall_score=d.get("overallScore", 0),
        timestamp=d.get("timestamp", ""),
    )


def _parse_edge(d: dict[str, Any]) -> CommunicationEdge:
    return CommunicationEdge(
        from_agent=d.get("from", ""),
        to_agent=d.get("to", ""),
        weight=d.get("weight", 0),
        last_seen=d.get("lastSeen", 0),
    )
