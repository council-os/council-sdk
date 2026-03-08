"""Audit namespace — query audit logs and verify blockchain anchors."""

from __future__ import annotations

from typing import Any, AsyncIterator, Optional

from council.transport import Transport
from council.types import ActionType, Anchor, AuditLog, MerkleProof, VerificationResult


class AuditNamespace:
    """Query audit trails and verify blockchain anchors.

    Usage::

        async for log in client.audit.query(agent_id="agent_abc123"):
            print(f"{log.timestamp}: {log.action}")
    """

    def __init__(self, transport: Transport) -> None:
        self._t = transport

    async def query(
        self,
        *,
        agent_id: Optional[str] = None,
        user_id: Optional[str] = None,
        action_type: Optional[str | ActionType] = None,
        resource: Optional[str] = None,
        outcome: Optional[str] = None,
        since: Optional[str] = None,
        until: Optional[str] = None,
        limit: int = 100,
    ) -> AsyncIterator[AuditLog]:
        """Query audit logs with optional filters."""
        params: dict[str, Any] = {"limit": limit}
        if agent_id:
            params["agentId"] = agent_id
        if user_id:
            params["userId"] = user_id
        if action_type:
            params["actionType"] = (
                action_type.value if isinstance(action_type, ActionType) else action_type
            )
        if resource:
            params["resource"] = resource
        if outcome:
            params["outcome"] = outcome
        if since:
            params["since"] = since
        if until:
            params["until"] = until

        resp = await self._t.get("/api/audit/logs", params=params)
        data = resp.get("data", [])
        if not isinstance(data, list):
            data = [data]

        for item in data:
            yield _parse_audit_log(item)

    async def get(self, entry_id: str) -> AuditLog:
        """Get a single audit log entry by ID."""
        resp = await self._t.get(f"/api/audit/logs/{entry_id}")
        return _parse_audit_log(resp.get("data", resp))

    async def verify(
        self,
        *,
        entry_id: str,
        anchor_id: str,
    ) -> VerificationResult:
        """Verify an audit entry against a blockchain anchor."""
        resp = await self._t.post(
            "/api/audit/verify",
            json={"entryId": entry_id, "anchorId": anchor_id},
        )
        data = resp.get("data", resp)
        return _parse_verification(data)

    async def get_anchor(self, anchor_id: str) -> Anchor:
        """Get details of a blockchain anchor."""
        resp = await self._t.get(f"/api/audit/anchors/{anchor_id}")
        return _parse_anchor(resp.get("data", resp))

    async def list_anchors(
        self,
        *,
        status: Optional[str] = None,
        since: Optional[str] = None,
        limit: int = 50,
    ) -> AsyncIterator[Anchor]:
        """List blockchain anchors."""
        params: dict[str, Any] = {"limit": limit}
        if status:
            params["status"] = status
        if since:
            params["since"] = since

        resp = await self._t.get("/api/audit/anchors", params=params)
        data = resp.get("data", [])
        if not isinstance(data, list):
            data = [data]

        for item in data:
            yield _parse_anchor(item)


# ── Helpers ────────────────────────────────────────────────────────────────────


def _parse_audit_log(data: dict[str, Any]) -> AuditLog:
    return AuditLog(
        id=data.get("id", ""),
        user_id=data.get("userId", data.get("user_id")),
        agent_id=data.get("agentId", data.get("agent_id")),
        action=data.get("action", ""),
        resource=data.get("resource"),
        resource_id=data.get("resourceId", data.get("resource_id")),
        outcome=data.get("outcome"),
        metadata=data.get("metadata", {}),
        ip_address=data.get("ipAddress", data.get("ip_address")),
        user_agent=data.get("userAgent", data.get("user_agent")),
        timestamp=data.get("timestamp", data.get("createdAt", data.get("created_at"))),
        anchor_id=data.get("anchorId", data.get("anchor_id")),
    )


def _parse_verification(data: dict[str, Any]) -> VerificationResult:
    proof_data = data.get("merkleProof", data.get("merkle_proof"))
    proof = None
    if proof_data:
        proof = MerkleProof(
            leaf=proof_data.get("leaf", ""),
            root=proof_data.get("root", ""),
            siblings=proof_data.get("siblings", []),
        )

    return VerificationResult(
        is_valid=data.get("isValid", data.get("is_valid", False)),
        merkle_proof=proof,
        on_chain_verified=data.get("onChainVerified", data.get("on_chain_verified", False)),
        block_number=data.get("blockNumber", data.get("block_number")),
        tx_hash=data.get("txHash", data.get("tx_hash")),
    )


def _parse_anchor(data: dict[str, Any]) -> Anchor:
    return Anchor(
        id=data.get("id", ""),
        merkle_root=data.get("merkleRoot", data.get("merkle_root")),
        leaf_count=data.get("leafCount", data.get("leaf_count", 0)),
        status=data.get("status", "pending"),
        block_number=data.get("blockNumber", data.get("block_number")),
        tx_hash=data.get("txHash", data.get("tx_hash")),
        submitted_at=data.get("submittedAt", data.get("submitted_at")),
        confirmed_at=data.get("confirmedAt", data.get("confirmed_at")),
    )
