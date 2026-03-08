"""Testing utilities for the Council SDK — mock client and helpers."""

from __future__ import annotations

from typing import Any, AsyncIterator, Optional
from unittest.mock import AsyncMock

from council.types import (
    Agent,
    AuditLog,
    ExecutionResult,
    JurorVote,
    Verdict,
    VerdictDecision,
)


class MockVerdict:
    """A mock verdict for testing."""

    def __init__(
        self,
        decision: str = "approved",
        confidence: float = 0.95,
        reasoning: str = "Test approval",
        votes: Optional[list[dict[str, Any]]] = None,
        conditions: Optional[list[str]] = None,
    ) -> None:
        self.decision = decision
        self.confidence = confidence
        self.reasoning = reasoning
        self.votes = votes or [
            {"juror_role": "guardian", "decision": decision, "confidence": confidence, "reasoning": reasoning},
            {"juror_role": "advocate", "decision": decision, "confidence": confidence, "reasoning": reasoning},
        ]
        self.conditions = conditions or []

    def to_verdict(self) -> Verdict:
        """Convert to a Verdict model."""
        return Verdict(
            id="mock_delib_001",
            decision=self.decision,
            confidence=self.confidence,
            reasoning=self.reasoning,
            votes=[
                JurorVote(
                    juror_role=v.get("juror_role", ""),
                    decision=v.get("decision", ""),
                    confidence=v.get("confidence", 0),
                    reasoning=v.get("reasoning", ""),
                )
                for v in self.votes
            ],
            conditions=self.conditions,
            deliberation_rounds=1,
        )


class MockJuryNamespace:
    """Mock jury namespace for testing."""

    def __init__(self) -> None:
        self._response: Optional[MockVerdict] = None
        self.deliberate = AsyncMock(side_effect=self._deliberate)
        self.deliberate_safe = AsyncMock(side_effect=self._deliberate_safe)
        self.submit_case = AsyncMock()
        self.get = AsyncMock()
        self.stats = AsyncMock(return_value={})

    def set_response(self, response: MockVerdict) -> None:
        """Set the verdict response for deliberate calls."""
        self._response = response

    async def _deliberate(self, **kwargs: Any) -> Verdict:
        if self._response:
            return self._response.to_verdict()
        return MockVerdict().to_verdict()

    async def _deliberate_safe(self, **kwargs: Any) -> Any:
        from council.types import Result

        try:
            verdict = await self._deliberate(**kwargs)
            return Result.success(verdict)
        except Exception as e:
            return Result.failure(e)


class MockAgentsNamespace:
    """Mock agents namespace for testing."""

    def __init__(self) -> None:
        self._agents: dict[str, Agent] = {}
        self.register = AsyncMock(side_effect=self._register)
        self.get = AsyncMock(side_effect=self._get)
        self.update = AsyncMock(side_effect=self._update)
        self.delete = AsyncMock(side_effect=self._delete)
        self.execute = AsyncMock(return_value={"action": "test", "response": "mock_response"})

    async def _register(self, **kwargs: Any) -> Agent:
        agent = Agent(
            id=f"agent_{len(self._agents) + 1:03d}",
            name=kwargs.get("name", "MockAgent"),
            status="active",
            model=kwargs.get("model"),
            capabilities=kwargs.get("capabilities", []),
            workspace_id=kwargs.get("workspace_id"),
        )
        self._agents[agent.id] = agent
        return agent

    async def _get(self, agent_id: str) -> Agent:
        if agent_id in self._agents:
            return self._agents[agent_id]
        return Agent(id=agent_id, name="MockAgent")

    async def _update(self, agent_id: str, **kwargs: Any) -> Agent:
        agent = self._agents.get(agent_id, Agent(id=agent_id, name="MockAgent"))
        for key, value in kwargs.items():
            if hasattr(agent, key) and value is not None:
                setattr(agent, key, value)
        return agent

    async def _delete(self, agent_id: str) -> None:
        self._agents.pop(agent_id, None)


class MockSandboxNamespace:
    """Mock sandbox namespace for testing."""

    def __init__(self) -> None:
        self._response = ExecutionResult(
            id="exec_mock_001",
            stdout="",
            stderr="",
            exit_code=0,
            execution_time_ms=10,
        )
        self.execute = AsyncMock(side_effect=self._execute)
        self.get = AsyncMock()

    def set_response(
        self,
        stdout: str = "",
        stderr: str = "",
        exit_code: int = 0,
    ) -> None:
        """Set the execution response."""
        self._response = ExecutionResult(
            id="exec_mock_001",
            stdout=stdout,
            stderr=stderr,
            exit_code=exit_code,
            execution_time_ms=10,
        )

    async def _execute(self, **kwargs: Any) -> ExecutionResult:
        return self._response


class MockAuditNamespace:
    """Mock audit namespace for testing."""

    def __init__(self) -> None:
        self.query = AsyncMock(return_value=iter([]))
        self.verify = AsyncMock()
        self.get = AsyncMock()
        self.get_anchor = AsyncMock()


class MockCouncil:
    """Mock Council client for testing.

    Usage::

        from council.testing import MockCouncil, MockVerdict

        mock = MockCouncil()
        mock.jury.set_response(MockVerdict(decision="approved", confidence=0.95))

        verdict = await mock.jury.deliberate(action="deploy", context={})
        assert verdict.decision == "approved"
        assert mock.jury.deliberate.called
    """

    def __init__(self) -> None:
        self.agents = MockAgentsNamespace()
        self.jury = MockJuryNamespace()
        self.sandbox = MockSandboxNamespace()
        self.audit = MockAuditNamespace()

    async def login(self, **kwargs: Any) -> dict[str, Any]:
        return {"user": {"id": "mock_user", "email": "test@example.com"}}

    async def me(self) -> dict[str, Any]:
        return {"id": "mock_user", "email": "test@example.com", "name": "Test User"}

    async def close(self) -> None:
        pass

    async def __aenter__(self) -> "MockCouncil":
        return self

    async def __aexit__(self, *args: Any) -> None:
        pass
