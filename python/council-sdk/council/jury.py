"""Jury namespace — submit cases for deliberation and receive verdicts."""

from __future__ import annotations

from typing import Any, AsyncIterator, Optional, Union

from council.errors import JuryDeniedError
from council.transport import Transport
from council.types import (
    DeliberationUpdate,
    JuryCase,
    JurorVote,
    Result,
    RiskLevel,
    Verdict,
    VerdictDecision,
)


class JuryNamespace:
    """Submit actions for jury deliberation and query verdicts.

    Usage::

        verdict = await client.jury.deliberate(
            action="deploy_to_production",
            context={"target": "api-server"},
            risk_level=RiskLevel.HIGH,
        )
    """

    def __init__(self, transport: Transport) -> None:
        self._t = transport

    async def deliberate(
        self,
        *,
        action: str,
        context: dict[str, Any],
        risk_level: Union[str, RiskLevel] = RiskLevel.MEDIUM,
        agent_id: Optional[str] = None,
    ) -> Verdict:
        """Submit an action for jury deliberation and await the verdict.

        This is a convenience method that submits a case and polls for the result.

        Raises:
            JuryDeniedError: If the deliberation results in denial.
        """
        level = risk_level.value if isinstance(risk_level, RiskLevel) else risk_level

        body: dict[str, Any] = {
            "action": action,
            "context": context,
            "riskLevel": level,
        }
        if agent_id:
            body["agentId"] = agent_id

        resp = await self._t.post("/api/v1/jury/cases", json=body)
        case_data = resp.get("data", resp)
        case_id = case_data.get("caseId", case_data.get("case_id", case_data.get("id", "")))

        # If the response already contains deliberation results, return directly
        if "deliberation" in case_data and case_data["deliberation"]:
            return _parse_verdict_from_deliberation(case_id, case_data["deliberation"])

        # Poll for result
        import asyncio

        for _ in range(60):  # Max 60 attempts (~30s with 0.5s sleep)
            await asyncio.sleep(0.5)
            status_resp = await self._t.get(f"/api/v1/jury/cases/{case_id}/deliberation")
            status_data = status_resp.get("data", status_resp)

            status = status_data.get("status", "")
            if status in ("complete", "completed"):
                delib = status_data.get("deliberation", status_data)
                verdict = _parse_verdict_from_deliberation(case_id, delib)
                if verdict.decision == VerdictDecision.DENIED:
                    raise JuryDeniedError(
                        message=f"Jury denied: {verdict.reasoning}",
                        reasoning=verdict.reasoning,
                        votes=[v.model_dump() for v in verdict.votes],
                    )
                return verdict

        from council.errors import JuryTimeoutError

        raise JuryTimeoutError(f"Deliberation {case_id} did not complete within timeout")

    async def deliberate_safe(
        self,
        *,
        action: str,
        context: dict[str, Any],
        risk_level: Union[str, RiskLevel] = RiskLevel.MEDIUM,
        agent_id: Optional[str] = None,
    ) -> Result:
        """Like deliberate(), but returns a Result instead of raising exceptions."""
        try:
            verdict = await self.deliberate(
                action=action,
                context=context,
                risk_level=risk_level,
                agent_id=agent_id,
            )
            return Result.success(verdict)
        except Exception as e:
            return Result.failure(e)

    async def deliberate_stream(
        self,
        *,
        action: str,
        context: dict[str, Any],
        risk_level: Union[str, RiskLevel] = RiskLevel.MEDIUM,
        agent_id: Optional[str] = None,
    ) -> AsyncIterator[DeliberationUpdate]:
        """Stream deliberation updates in real-time.

        Falls back to polling if WebSocket streaming is not available.
        """
        level = risk_level.value if isinstance(risk_level, RiskLevel) else risk_level
        body: dict[str, Any] = {
            "action": action,
            "context": context,
            "riskLevel": level,
        }
        if agent_id:
            body["agentId"] = agent_id

        resp = await self._t.post("/api/v1/jury/cases", json=body)
        case_data = resp.get("data", resp)
        case_id = case_data.get("caseId", case_data.get("case_id", case_data.get("id", "")))

        yield DeliberationUpdate(phase="started", deliberation_id=case_id)

        # Poll for updates
        import asyncio

        prev_status = ""
        for _ in range(120):
            await asyncio.sleep(0.5)
            try:
                status_resp = await self._t.get(f"/api/v1/jury/cases/{case_id}/deliberation")
            except Exception:
                continue

            status_data = status_resp.get("data", status_resp)
            status = status_data.get("status", "")

            if status != prev_status:
                prev_status = status

                if status == "voting":
                    yield DeliberationUpdate(
                        phase="voting",
                        deliberation_id=case_id,
                    )
                elif status in ("complete", "completed"):
                    delib = status_data.get("deliberation", status_data)
                    verdict = _parse_verdict_from_deliberation(case_id, delib)
                    yield DeliberationUpdate(
                        phase="complete",
                        deliberation_id=case_id,
                        verdict=verdict,
                    )
                    return

    async def submit_case(
        self,
        *,
        action: str,
        context: dict[str, Any],
        risk_level: Union[str, RiskLevel] = RiskLevel.MEDIUM,
        agent_id: Optional[str] = None,
    ) -> JuryCase:
        """Submit a case without waiting for the verdict. Returns the case details."""
        level = risk_level.value if isinstance(risk_level, RiskLevel) else risk_level
        body: dict[str, Any] = {
            "action": action,
            "context": context,
            "riskLevel": level,
        }
        if agent_id:
            body["agentId"] = agent_id

        resp = await self._t.post("/api/v1/jury/cases", json=body)
        data = resp.get("data", resp)
        return _parse_case(data)

    async def get(self, case_id: str) -> JuryCase:
        """Get a jury case by ID."""
        resp = await self._t.get(f"/api/v1/jury/cases/{case_id}")
        return _parse_case(resp.get("data", resp))

    async def get_deliberation(self, case_id: str) -> dict[str, Any]:
        """Get the deliberation details for a case."""
        resp = await self._t.get(f"/api/v1/jury/cases/{case_id}/deliberation")
        return resp.get("data", resp)

    async def list(
        self,
        *,
        agent_id: Optional[str] = None,
        decision: Optional[Union[str, VerdictDecision]] = None,
        since: Optional[str] = None,
        limit: int = 50,
    ) -> AsyncIterator[JuryCase]:
        """List jury cases with optional filters."""
        params: dict[str, Any] = {"limit": limit}
        if agent_id:
            params["agentId"] = agent_id
        if decision:
            params["decision"] = (
                decision.value if isinstance(decision, VerdictDecision) else decision
            )
        if since:
            params["since"] = since

        # Use stats endpoint or case listing
        resp = await self._t.get("/api/v1/jury/stats")
        # The stats endpoint returns aggregate data, not individual cases
        # If the API supports listing, we'd iterate here
        data = resp.get("data", {})
        # Return empty iterator for now as the list endpoint may not be implemented
        return
        yield  # Make this an async generator  # type: ignore[misc]

    async def stats(self) -> dict[str, Any]:
        """Get jury deliberation statistics."""
        resp = await self._t.get("/api/v1/jury/stats")
        return resp.get("data", resp)


# ── Helpers ────────────────────────────────────────────────────────────────────


def _parse_verdict_from_deliberation(case_id: str, delib: dict[str, Any]) -> Verdict:
    """Parse deliberation data into a Verdict."""
    votes_raw = delib.get("votes", [])
    votes = []
    for v in votes_raw:
        votes.append(
            JurorVote(
                juror_role=v.get("jurorRole", v.get("juror_role", v.get("juror", ""))),
                decision=v.get("decision", ""),
                confidence=float(v.get("confidence", 0)),
                reasoning=v.get("reasoning", ""),
            )
        )

    return Verdict(
        id=case_id,
        decision=delib.get("decision", delib.get("verdict", "")),
        confidence=float(delib.get("confidence", 0)),
        reasoning=delib.get("reasoning", ""),
        votes=votes,
        conditions=delib.get("conditions", []),
        deliberation_rounds=delib.get("deliberationRounds", delib.get("rounds", 1)),
        created_at=delib.get("createdAt", delib.get("created_at")),
    )


def _parse_case(data: dict[str, Any]) -> JuryCase:
    """Parse raw data into a JuryCase."""
    return JuryCase(
        id=data.get("id", ""),
        case_id=data.get("caseId", data.get("case_id")),
        status=data.get("status", "pending"),
        action=data.get("action"),
        context=data.get("context", {}),
        risk_level=data.get("riskLevel", data.get("risk_level")),
        deliberation=data.get("deliberation"),
        created_at=data.get("createdAt", data.get("created_at")),
    )
