"""Safety namespace — emergency halt, escalation management, watchdog, trust certs & compliance."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import IntEnum
from typing import Any, AsyncIterator, Optional

from .transport import Transport


class HaltLevel(IntEnum):
    """Emergency halt levels."""

    AGENT = 1
    WORKSPACE = 2
    GLOBAL = 3


@dataclass
class EmergencyHaltRecord:
    """Record of an emergency halt event."""

    id: str
    level: int
    reason: str
    triggered_by: str
    active: bool
    target_agent_id: Optional[str] = None
    target_workspace_id: Optional[str] = None
    affected_agent_ids: list[str] = field(default_factory=list)
    lifted_at: Optional[datetime] = None
    lifted_by: Optional[str] = None
    created_at: Optional[datetime] = None


@dataclass
class EmergencyHaltStatus:
    """Current halt status across the system."""

    global_halt_active: bool
    active_halts: list[EmergencyHaltRecord]
    total_active: int


@dataclass
class EscalationTicket:
    """A human-review escalation ticket."""

    id: str
    agent_id: str
    action: str
    risk_level: str
    status: str
    priority: str
    reason: str
    context: dict[str, Any] = field(default_factory=dict)
    deliberation_transcript: Optional[str] = None
    due_by: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    approvals: Optional[list[Any]] = None
    created_at: Optional[datetime] = None


@dataclass
class WatchdogStatus:
    """Dead-man's-switch watchdog status."""

    enabled: bool
    active: bool
    last_acknowledged_at: Optional[str] = None
    time_remaining_ms: Optional[int] = None
    overdue: bool = False


# ── Trust Certificate Types ───────────────────────────────────────────────────


@dataclass
class TrustDimensions:
    """Trust dimension scores for a certificate."""

    provenance: float = 0
    code: float = 0
    hardware: float = 0
    network: float = 0
    behavioral: float = 0


@dataclass
class GovernanceSummary:
    """Governance action summary included in a trust certificate."""

    total_actions: int = 0
    auto_approved: int = 0
    jury_reviewed: int = 0
    denied: int = 0
    halts: int = 0


@dataclass
class MerkleInclusionProof:
    """Merkle tree inclusion proof for a certificate."""

    leaf_hash: str = ""
    tree_size: int = 0
    inclusion_path: list[str] = field(default_factory=list)


@dataclass
class SignedTreeHead:
    """Signed tree head from the Merkle log."""

    tree_size: int = 0
    root_hash: str = ""
    timestamp: str = ""
    signature: str = ""


@dataclass
class TrustCertificate:
    """A signed trust certificate for an agent."""

    id: str
    agent_id: str
    org_id: str
    trust_dimensions: TrustDimensions
    governance_summary: GovernanceSummary
    issued_at: str = ""
    expires_at: str = ""
    signature: str = ""
    merkle_proof: Optional[MerkleInclusionProof] = None
    signed_tree_head: Optional[SignedTreeHead] = None


@dataclass
class CertVerificationResult:
    """Result of verifying a trust certificate."""

    valid: bool = False
    reason: Optional[str] = None
    checked_at: str = ""


@dataclass
class PublicKeyInfo:
    """Organization public key information."""

    org_id: str = ""
    public_key: str = ""
    algorithm: str = ""
    created_at: str = ""


# ── Federation Types ──────────────────────────────────────────────────────────


@dataclass
class TrustRoot:
    """A federated trust root for cross-org verification."""

    id: str
    org_id: str
    public_key: str
    label: str = ""
    added_at: str = ""


@dataclass
class FederatedThreatSignature:
    """A shared threat signature from the federation."""

    id: str
    category: str
    description: str = ""
    source_org_id: str = ""
    confidence: float = 0
    created_at: str = ""
    active: bool = True


# ── Compliance Types ──────────────────────────────────────────────────────────


@dataclass
class GovernanceStats:
    """Governance statistics summary."""

    total_actions: int = 0
    auto_approved: int = 0
    jury_reviewed: int = 0
    denied: int = 0
    escalated: int = 0
    halts: int = 0
    active_agents: int = 0


@dataclass
class ComplianceReport:
    """Compliance report for a time range."""

    start_ms: int = 0
    end_ms: int = 0
    governance: GovernanceStats = field(default_factory=GovernanceStats)
    certificates_issued: int = 0
    certificates_expired: int = 0
    invariant_violations: int = 0
    generated_at: str = ""


def _parse_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _parse_halt(data: dict[str, Any]) -> EmergencyHaltRecord:
    return EmergencyHaltRecord(
        id=str(data.get("id", "")),
        level=int(data.get("level", 0)),
        reason=str(data.get("reason", "")),
        triggered_by=str(data.get("triggeredBy", "")),
        active=bool(data.get("active")),
        target_agent_id=data.get("targetAgentId"),
        target_workspace_id=data.get("targetWorkspaceId"),
        affected_agent_ids=[str(a) for a in data.get("affectedAgentIds", [])],
        lifted_at=_parse_datetime(data.get("liftedAt")),
        lifted_by=data.get("liftedBy"),
        created_at=_parse_datetime(data.get("createdAt")),
    )


def _parse_escalation(data: dict[str, Any]) -> EscalationTicket:
    return EscalationTicket(
        id=str(data.get("id", "")),
        agent_id=str(data.get("agentId", "")),
        action=str(data.get("action", "")),
        risk_level=str(data.get("riskLevel", "")),
        status=str(data.get("status", "")),
        priority=str(data.get("priority", "")),
        reason=str(data.get("reason", "")),
        context=data.get("context", {}),
        deliberation_transcript=data.get("deliberationTranscript"),
        due_by=_parse_datetime(data.get("dueBy")),
        resolved_at=_parse_datetime(data.get("resolvedAt")),
        resolved_by=data.get("resolvedBy"),
        approvals=data.get("approvals"),
        created_at=_parse_datetime(data.get("createdAt")),
    )


def _parse_trust_dimensions(data: dict[str, Any]) -> TrustDimensions:
    return TrustDimensions(
        provenance=float(data.get("provenance", 0)),
        code=float(data.get("code", 0)),
        hardware=float(data.get("hardware", 0)),
        network=float(data.get("network", 0)),
        behavioral=float(data.get("behavioral", 0)),
    )


def _parse_governance_summary(data: dict[str, Any]) -> GovernanceSummary:
    return GovernanceSummary(
        total_actions=int(data.get("totalActions", 0)),
        auto_approved=int(data.get("autoApproved", 0)),
        jury_reviewed=int(data.get("juryReviewed", 0)),
        denied=int(data.get("denied", 0)),
        halts=int(data.get("halts", 0)),
    )


def _parse_merkle_proof(data: Optional[dict[str, Any]]) -> Optional[MerkleInclusionProof]:
    if data is None:
        return None
    return MerkleInclusionProof(
        leaf_hash=data.get("leafHash", ""),
        tree_size=int(data.get("treeSize", 0)),
        inclusion_path=data.get("inclusionPath", []),
    )


def _parse_signed_tree_head(data: Optional[dict[str, Any]]) -> Optional[SignedTreeHead]:
    if data is None:
        return None
    return SignedTreeHead(
        tree_size=int(data.get("treeSize", 0)),
        root_hash=data.get("rootHash", ""),
        timestamp=data.get("timestamp", ""),
        signature=data.get("signature", ""),
    )


def _parse_trust_cert(data: dict[str, Any]) -> TrustCertificate:
    return TrustCertificate(
        id=str(data.get("id", "")),
        agent_id=str(data.get("agentId", "")),
        org_id=str(data.get("orgId", "")),
        trust_dimensions=_parse_trust_dimensions(data.get("trustDimensions", {})),
        governance_summary=_parse_governance_summary(data.get("governanceSummary", {})),
        issued_at=data.get("issuedAt", ""),
        expires_at=data.get("expiresAt", ""),
        signature=data.get("signature", ""),
        merkle_proof=_parse_merkle_proof(data.get("merkleProof")),
        signed_tree_head=_parse_signed_tree_head(data.get("signedTreeHead")),
    )


def _parse_trust_root(data: dict[str, Any]) -> TrustRoot:
    return TrustRoot(
        id=str(data.get("id", "")),
        org_id=str(data.get("orgId", "")),
        public_key=str(data.get("publicKey", "")),
        label=data.get("label", ""),
        added_at=data.get("addedAt", ""),
    )


def _parse_fed_threat_sig(data: dict[str, Any]) -> FederatedThreatSignature:
    return FederatedThreatSignature(
        id=str(data.get("id", "")),
        category=str(data.get("category", "")),
        description=data.get("description", ""),
        source_org_id=data.get("sourceOrgId", ""),
        confidence=float(data.get("confidence", 0)),
        created_at=data.get("createdAt", ""),
        active=bool(data.get("active", True)),
    )


def _parse_governance_stats(data: dict[str, Any]) -> GovernanceStats:
    return GovernanceStats(
        total_actions=int(data.get("totalActions", 0)),
        auto_approved=int(data.get("autoApproved", 0)),
        jury_reviewed=int(data.get("juryReviewed", 0)),
        denied=int(data.get("denied", 0)),
        escalated=int(data.get("escalated", 0)),
        halts=int(data.get("halts", 0)),
        active_agents=int(data.get("activeAgents", 0)),
    )


class SafetyNamespace:
    """Emergency halt, escalation management, and watchdog controls.

    Usage::

        # Halt a single agent
        await client.safety.halt(level=1, agent_id="agent_abc", reason="Anomaly")

        # Global halt
        await client.safety.halt(level=3, reason="Critical safety violation")

        # Check halt status
        status = await client.safety.status()

        # Lift a halt
        await client.safety.lift_halt(halt_id)

        # Review escalations
        async for ticket in client.safety.escalations():
            print(ticket.id, ticket.risk_level)

        # Approve an escalation
        await client.safety.approve_escalation(ticket_id, notes="Verified safe")

        # Acknowledge watchdog
        await client.safety.acknowledge_watchdog()
    """

    def __init__(self, transport: "Transport") -> None:
        self._t = transport

    # ── Emergency Halt ─────────────────────────────────────────────────

    async def halt(
        self,
        *,
        level: int | HaltLevel,
        reason: str,
        agent_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> EmergencyHaltRecord:
        """Trigger an emergency halt.

        Args:
            level: 1 (agent), 2 (workspace), or 3 (global).
            reason: Human-readable reason for the halt.
            agent_id: Required when level=1.
            workspace_id: Required when level=2.
        """
        body: dict[str, Any] = {"level": int(level), "reason": reason}
        if agent_id is not None:
            body["agentId"] = agent_id
        if workspace_id is not None:
            body["workspaceId"] = workspace_id

        resp = await self._t.post("/api/v1/admin/halts", json=body)
        data = resp.get("data", resp)
        return _parse_halt(data)

    async def lift_halt(self, halt_id: str) -> EmergencyHaltRecord:
        """Lift an active halt by record ID."""
        resp = await self._t.post(f"/api/v1/admin/halts/{halt_id}/lift", json={})
        data = resp.get("data", resp)
        return _parse_halt(data)

    async def status(self) -> EmergencyHaltStatus:
        """Get current halt status across the system."""
        resp = await self._t.get("/api/v1/admin/halts")
        data = resp.get("data", resp)
        halts = [_parse_halt(h) for h in data.get("activeHalts", [])]
        return EmergencyHaltStatus(
            global_halt_active=bool(data.get("globalHaltActive")),
            active_halts=halts,
            total_active=int(data.get("totalActive", len(halts))),
        )

    # ── Escalation Management ──────────────────────────────────────────

    async def escalations(
        self,
        *,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> AsyncIterator[EscalationTicket]:
        """List escalation tickets with optional filters."""
        params: dict[str, Any] = {}
        if status is not None:
            params["status"] = status
        if priority is not None:
            params["priority"] = priority
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset

        resp = await self._t.get("/api/v1/admin/escalations", params=params)
        data = resp.get("data", resp)
        items = data if isinstance(data, list) else data.get("tickets", [data])

        async def _iter() -> AsyncIterator[EscalationTicket]:
            for item in items:
                yield _parse_escalation(item)

        return _iter()

    async def get_escalation(self, ticket_id: str) -> EscalationTicket:
        """Get a single escalation ticket by ID (includes deliberation transcript)."""
        resp = await self._t.get(f"/api/v1/admin/escalations/{ticket_id}")
        data = resp.get("data", resp)
        return _parse_escalation(data)

    async def approve_escalation(
        self,
        ticket_id: str,
        *,
        notes: Optional[str] = None,
        conditions: Optional[list[str]] = None,
    ) -> EscalationTicket:
        """Approve an escalation ticket. Critical escalations require 2 approvals."""
        body: dict[str, Any] = {}
        if notes is not None:
            body["notes"] = notes
        if conditions is not None:
            body["conditions"] = conditions

        resp = await self._t.post(
            f"/api/v1/admin/escalations/{ticket_id}/approve", json=body
        )
        data = resp.get("data", resp)
        return _parse_escalation(data)

    async def deny_escalation(
        self, ticket_id: str, *, reason: str
    ) -> EscalationTicket:
        """Deny an escalation ticket (reason is mandatory)."""
        resp = await self._t.post(
            f"/api/v1/admin/escalations/{ticket_id}/deny", json={"reason": reason}
        )
        data = resp.get("data", resp)
        return _parse_escalation(data)

    # ── Watchdog ───────────────────────────────────────────────────────

    async def acknowledge_watchdog(self) -> WatchdogStatus:
        """Acknowledge the dead-man's-switch watchdog to prevent auto Level 2 halt."""
        resp = await self._t.post("/api/v1/admin/watchdog/ack", json={})
        data = resp.get("data", resp)
        return WatchdogStatus(
            enabled=bool(data.get("enabled")),
            active=bool(data.get("active")),
            last_acknowledged_at=data.get("lastAcknowledgedAt"),
            time_remaining_ms=data.get("timeRemainingMs"),
            overdue=bool(data.get("overdue")),
        )

    # ── Trust Certificates ─────────────────────────────────────────────

    async def issue_trust_cert(
        self,
        *,
        agent_id: str,
        org_id: str,
        trust_dimensions: dict[str, float],
        governance_summary: dict[str, int],
        validity_hours: int = 24,
    ) -> TrustCertificate:
        """Issue a signed trust certificate for an agent.

        Args:
            agent_id: The agent to certify.
            org_id: The issuing organization.
            trust_dimensions: Trust scores (provenance, code, hardware, network, behavioral).
            governance_summary: Action counts (total_actions, auto_approved, jury_reviewed, denied, halts).
            validity_hours: Certificate validity in hours (default 24).
        """
        resp = await self._t.post(
            "/api/v1/safety/trust-certs",
            json={
                "agentId": agent_id,
                "orgId": org_id,
                "trustDimensions": {
                    "provenance": trust_dimensions.get("provenance", 0),
                    "code": trust_dimensions.get("code", 0),
                    "hardware": trust_dimensions.get("hardware", 0),
                    "network": trust_dimensions.get("network", 0),
                    "behavioral": trust_dimensions.get("behavioral", 0),
                },
                "governanceSummary": {
                    "totalActions": governance_summary.get("total_actions", 0),
                    "autoApproved": governance_summary.get("auto_approved", 0),
                    "juryReviewed": governance_summary.get("jury_reviewed", 0),
                    "denied": governance_summary.get("denied", 0),
                    "halts": governance_summary.get("halts", 0),
                },
                "validityHours": validity_hours,
            },
        )
        data = resp.get("data", resp)
        return _parse_trust_cert(data)

    async def get_trust_certs(self, *, agent_id: str) -> list[TrustCertificate]:
        """Get all trust certificates for an agent."""
        resp = await self._t.get(f"/api/v1/safety/trust-certs/{agent_id}")
        data = resp.get("data", resp)
        items = data if isinstance(data, list) else [data]
        return [_parse_trust_cert(c) for c in items]

    async def verify_trust_cert(self, *, certificate: dict[str, Any]) -> CertVerificationResult:
        """Verify a trust certificate's signature and merkle inclusion.

        Args:
            certificate: The full certificate object to verify.
        """
        resp = await self._t.post(
            "/api/v1/safety/trust-certs/verify",
            json={"certificate": certificate},
        )
        data = resp.get("data", resp)
        return CertVerificationResult(
            valid=bool(data.get("valid", False)),
            reason=data.get("reason"),
            checked_at=data.get("checkedAt", ""),
        )

    async def get_public_key(self) -> PublicKeyInfo:
        """Get the organization's public key for certificate verification."""
        resp = await self._t.get("/api/v1/safety/trust-certs/public-key")
        data = resp.get("data", resp)
        return PublicKeyInfo(
            org_id=data.get("orgId", ""),
            public_key=data.get("publicKey", ""),
            algorithm=data.get("algorithm", ""),
            created_at=data.get("createdAt", ""),
        )

    # ── Federation ─────────────────────────────────────────────────────

    async def get_trust_roots(self) -> list[TrustRoot]:
        """List all federated trust roots."""
        resp = await self._t.get("/api/v1/safety/federation/trust-roots")
        data = resp.get("data", resp)
        items = data if isinstance(data, list) else [data]
        return [_parse_trust_root(r) for r in items]

    async def add_trust_root(
        self,
        *,
        org_id: str,
        public_key: str,
        label: str = "",
    ) -> TrustRoot:
        """Add a federated trust root for cross-org verification.

        Args:
            org_id: The remote organization ID.
            public_key: The organization's public key (hex-encoded).
            label: Human-readable label for this trust root.
        """
        resp = await self._t.post(
            "/api/v1/safety/federation/trust-roots",
            json={
                "orgId": org_id,
                "publicKey": public_key,
                "label": label,
            },
        )
        data = resp.get("data", resp)
        return _parse_trust_root(data)

    async def get_threat_signatures(
        self, *, category: Optional[str] = None
    ) -> list[FederatedThreatSignature]:
        """List federated threat signatures, optionally filtered by category."""
        params: dict[str, Any] = {}
        if category is not None:
            params["category"] = category
        resp = await self._t.get(
            "/api/v1/safety/federation/signatures", params=params
        )
        data = resp.get("data", resp)
        items = data if isinstance(data, list) else [data]
        return [_parse_fed_threat_sig(s) for s in items]

    # ── Compliance ─────────────────────────────────────────────────────

    async def get_governance_stats(self) -> GovernanceStats:
        """Get current governance statistics."""
        resp = await self._t.get("/api/v1/safety/compliance/stats")
        data = resp.get("data", resp)
        return _parse_governance_stats(data)

    async def get_compliance_report(
        self, *, start_ms: int, end_ms: int
    ) -> ComplianceReport:
        """Generate a compliance report for a time range.

        Args:
            start_ms: Start timestamp in milliseconds.
            end_ms: End timestamp in milliseconds.
        """
        resp = await self._t.get(
            "/api/v1/safety/compliance/report",
            params={"start": start_ms, "end": end_ms},
        )
        data = resp.get("data", resp)
        gov_data = data.get("governance", {})
        return ComplianceReport(
            start_ms=int(data.get("startMs", start_ms)),
            end_ms=int(data.get("endMs", end_ms)),
            governance=_parse_governance_stats(gov_data),
            certificates_issued=int(data.get("certificatesIssued", 0)),
            certificates_expired=int(data.get("certificatesExpired", 0)),
            invariant_violations=int(data.get("invariantViolations", 0)),
            generated_at=data.get("generatedAt", ""),
        )
