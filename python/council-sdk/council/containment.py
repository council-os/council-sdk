"""Containment namespace — cascade, replay, quarantine & threat signatures (WS5)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from .transport import Transport


# =============================================================================
# Data classes
# =============================================================================


@dataclass
class ForensicSnapshot:
    """Immutable record from a containment cascade."""

    id: str
    agent_id: str
    blast_radius_agent_ids: list[str]
    status: str
    contained_at: str
    snapshot_completed_at: Optional[str] = None
    jury_verdict_at: Optional[str] = None
    report_pushed_at: Optional[str] = None
    jury_verdict: Optional[dict[str, Any]] = None


@dataclass
class ReplayReport:
    """Result of adversarial replay."""

    id: str
    forensic_id: str
    agent_id: str
    status: str
    started_at: str
    completed_at: Optional[str] = None
    summary: Optional[dict[str, Any]] = None


@dataclass
class QuarantineRecord:
    """Quarantine state for an agent."""

    agent_id: str
    config: dict[str, Any]
    started_at: str
    action_count: int = 0
    blocked_count: int = 0
    jury_approved_release: bool = False
    human_approved_release: bool = False


@dataclass
class ThreatAssessment:
    """Result of immune memory threat assessment."""

    threat_level: str  # "none" | "low" | "medium" | "high" | "critical"
    score: float
    matched_signatures: list[dict[str, Any]] = field(default_factory=list)
    assessed_at: str = ""


@dataclass
class ThreatSignature:
    """A known behavioral threat signature."""

    id: str
    label: str
    created_at: str
    forensic_id: str
    confidence: float
    match_count: int
    active: bool
    last_matched_at: Optional[str] = None


# =============================================================================
# Namespace
# =============================================================================


class ContainmentNamespace:
    """Containment cascade, adversarial replay, quarantine & immune memory.

    Usage::

        # Initiate containment cascade
        snapshot = await client.containment.initiate(
            agent_id="agent_abc",
            reason="Anomalous scope escalation",
            severity="critical",
        )

        # List active containments
        active = await client.containment.list()

        # Clear an agent
        await client.containment.clear(forensic_id, agent_id)

        # Start adversarial replay
        replay = await client.containment.replay(forensic_id)

        # Quarantine an agent
        record = await client.containment.quarantine(agent_id, "Under investigation")

        # Release from quarantine
        result = await client.containment.approve_release(agent_id)

        # Assess threats
        assessment = await client.containment.assess_threat(agent_id)

        # List threat signatures
        sigs = await client.containment.threat_signatures()
    """

    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    # ── Containment Cascade ─────────────────────────────────────────────

    async def initiate(
        self,
        *,
        agent_id: str,
        reason: str,
        severity: str = "critical",
        evidence: Optional[dict[str, Any]] = None,
    ) -> ForensicSnapshot:
        """Initiate a containment cascade for an adversarial agent."""
        resp = await self._transport.post(
            "/api/v1/containment/cascade",
            json={
                "agentId": agent_id,
                "reason": reason,
                "severity": severity,
                "evidence": evidence or {},
            },
        )
        data = resp if isinstance(resp, dict) else resp.json()
        return ForensicSnapshot(
            id=data["id"],
            agent_id=data["agentId"],
            blast_radius_agent_ids=data.get("blastRadiusAgentIds", []),
            status=data["status"],
            contained_at=data["containedAt"],
        )

    async def get(self, forensic_id: str) -> ForensicSnapshot:
        """Get a containment record by forensic ID."""
        resp = await self._transport.get(
            f"/api/v1/containment/cascade/{forensic_id}"
        )
        data = resp if isinstance(resp, dict) else resp.json()
        return ForensicSnapshot(
            id=data["id"],
            agent_id=data["agentId"],
            blast_radius_agent_ids=data.get("blastRadiusAgentIds", []),
            status=data["status"],
            contained_at=data["containedAt"],
            jury_verdict=data.get("juryVerdict"),
        )

    async def list(self) -> list[ForensicSnapshot]:
        """List all active containments."""
        resp = await self._transport.get("/api/v1/containment/cascade")
        items = resp if isinstance(resp, list) else resp.json()
        return [
            ForensicSnapshot(
                id=d["id"],
                agent_id=d["agentId"],
                blast_radius_agent_ids=d.get("blastRadiusAgentIds", []),
                status=d["status"],
                contained_at=d["containedAt"],
            )
            for d in items
        ]

    async def clear(self, forensic_id: str, agent_id: str) -> None:
        """Clear an agent from containment."""
        await self._transport.post(
            f"/api/v1/containment/cascade/{forensic_id}/clear",
            json={"agentId": agent_id},
        )

    # ── Adversarial Replay ──────────────────────────────────────────────

    async def replay(
        self,
        forensic_id: str,
        *,
        max_actions: Optional[int] = None,
        action_timeout_ms: Optional[int] = None,
        total_timeout_ms: Optional[int] = None,
    ) -> ReplayReport:
        """Start adversarial replay of a contained agent's actions."""
        body: dict[str, Any] = {}
        if max_actions is not None:
            body["maxActions"] = max_actions
        if action_timeout_ms is not None:
            body["actionTimeoutMs"] = action_timeout_ms
        if total_timeout_ms is not None:
            body["totalTimeoutMs"] = total_timeout_ms

        resp = await self._transport.post(
            f"/api/v1/containment/replay/{forensic_id}",
            json=body,
        )
        data = resp if isinstance(resp, dict) else resp.json()
        return ReplayReport(
            id=data["id"],
            forensic_id=data["forensicId"],
            agent_id=data["agentId"],
            status=data["status"],
            started_at=data["startedAt"],
            completed_at=data.get("completedAt"),
            summary=data.get("summary"),
        )

    async def get_replay(self, replay_id: str) -> ReplayReport:
        """Get a replay report."""
        resp = await self._transport.get(
            f"/api/v1/containment/replay/{replay_id}"
        )
        data = resp if isinstance(resp, dict) else resp.json()
        return ReplayReport(
            id=data["id"],
            forensic_id=data["forensicId"],
            agent_id=data["agentId"],
            status=data["status"],
            started_at=data["startedAt"],
            completed_at=data.get("completedAt"),
            summary=data.get("summary"),
        )

    # ── Quarantine ──────────────────────────────────────────────────────

    async def quarantine(
        self,
        agent_id: str,
        reason: str,
        *,
        allowed_targets: Optional[list[str]] = None,
        action_rate_limit: Optional[int] = None,
        sandbox_only: bool = True,
    ) -> QuarantineRecord:
        """Place an agent into quarantine mode."""
        body: dict[str, Any] = {"reason": reason}
        if allowed_targets is not None:
            body["allowedCommunicationTargets"] = allowed_targets
        if action_rate_limit is not None:
            body["actionRateLimit"] = action_rate_limit
        body["sandboxOnly"] = sandbox_only

        resp = await self._transport.post(
            f"/api/v1/containment/quarantine/{agent_id}",
            json=body,
        )
        data = resp if isinstance(resp, dict) else resp.json()
        return QuarantineRecord(
            agent_id=data["agentId"],
            config=data["config"],
            started_at=data["startedAt"],
            action_count=data.get("actionCount", 0),
            blocked_count=data.get("blockedCount", 0),
        )

    async def get_quarantine(self, agent_id: str) -> Optional[QuarantineRecord]:
        """Get quarantine record for an agent, or None if not quarantined."""
        resp = await self._transport.get(
            f"/api/v1/containment/quarantine/{agent_id}"
        )
        data = resp if isinstance(resp, dict) else resp.json()
        if not data:
            return None
        return QuarantineRecord(
            agent_id=data["agentId"],
            config=data["config"],
            started_at=data["startedAt"],
            action_count=data.get("actionCount", 0),
            blocked_count=data.get("blockedCount", 0),
        )

    async def quarantine_list(self) -> list[QuarantineRecord]:
        """List all quarantined agents."""
        resp = await self._transport.get("/api/v1/containment/quarantine")
        items = resp if isinstance(resp, list) else resp.json()
        return [
            QuarantineRecord(
                agent_id=d["agentId"],
                config=d["config"],
                started_at=d["startedAt"],
                action_count=d.get("actionCount", 0),
                blocked_count=d.get("blockedCount", 0),
            )
            for d in items
        ]

    async def approve_release(self, agent_id: str) -> dict[str, Any]:
        """Approve quarantine release (human admin side)."""
        resp = await self._transport.post(
            f"/api/v1/containment/quarantine/{agent_id}/release",
            json={},
        )
        return resp if isinstance(resp, dict) else resp.json()

    # ── Immune Memory / Threat Signatures ───────────────────────────────

    async def assess_threat(self, agent_id: str) -> ThreatAssessment:
        """Assess an agent against known threat signatures."""
        resp = await self._transport.get(
            f"/api/v1/containment/threats/assess/{agent_id}"
        )
        data = resp if isinstance(resp, dict) else resp.json()
        return ThreatAssessment(
            threat_level=data["threatLevel"],
            score=data["score"],
            matched_signatures=data.get("matchedSignatures", []),
            assessed_at=data.get("assessedAt", ""),
        )

    async def threat_signatures(self) -> list[ThreatSignature]:
        """List all active threat signatures."""
        resp = await self._transport.get(
            "/api/v1/containment/threats/signatures"
        )
        items = resp if isinstance(resp, list) else resp.json()
        return [
            ThreatSignature(
                id=d["id"],
                label=d["label"],
                created_at=d["createdAt"],
                forensic_id=d["forensicId"],
                confidence=d["confidence"],
                match_count=d.get("matchCount", 0),
                active=d.get("active", True),
                last_matched_at=d.get("lastMatchedAt"),
            )
            for d in items
        ]

    async def deactivate_signature(self, signature_id: str) -> None:
        """Deactivate a threat signature."""
        await self._transport.post(
            f"/api/v1/containment/threats/signatures/{signature_id}/deactivate",
            json={},
        )
