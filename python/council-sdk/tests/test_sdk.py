"""Tests for the Council Python SDK."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from council import Council
from council.auth import Credentials, resolve_credentials
from council.errors import (
    AuthenticationError,
    CouncilError,
    JuryDeniedError,
    NotFoundError,
    RateLimitError,
    ValidationError,
    raise_for_status,
)
from council.testing import MockCouncil, MockVerdict
from council.types import (
    Agent,
    AgentCapability,
    ExecutionResult,
    Result,
    RiskLevel,
    Verdict,
    VerdictDecision,
)


# ── Auth Tests ─────────────────────────────────────────────────────────────────


class TestCredentials:
    def test_resolve_explicit(self):
        creds = resolve_credentials(api_key="test_key", base_url="http://test:3000")
        assert creds.api_key == "test_key"
        assert creds.base_url == "http://test:3000"

    def test_resolve_env_vars(self, monkeypatch):
        monkeypatch.setenv("COUNCIL_API_KEY", "env_key")
        monkeypatch.setenv("COUNCIL_BASE_URL", "http://env:3000")
        creds = resolve_credentials()
        assert creds.api_key == "env_key"
        assert creds.base_url == "http://env:3000"

    def test_explicit_overrides_env(self, monkeypatch):
        monkeypatch.setenv("COUNCIL_API_KEY", "env_key")
        creds = resolve_credentials(api_key="explicit_key")
        assert creds.api_key == "explicit_key"

    def test_default_base_url(self, monkeypatch):
        monkeypatch.delenv("COUNCIL_API_KEY", raising=False)
        monkeypatch.delenv("COUNCIL_BASE_URL", raising=False)
        creds = resolve_credentials()
        assert creds.base_url == "http://localhost:3001"

    def test_auth_header_api_key(self):
        creds = Credentials(api_key="test_key")
        assert creds.auth_header == {"Authorization": "Bearer test_key"}

    def test_auth_header_jwt(self):
        creds = Credentials(jwt_token="jwt_tok")
        assert creds.auth_header == {"Authorization": "Bearer jwt_tok"}

    def test_auth_header_access_token_priority(self):
        creds = Credentials(api_key="key", jwt_token="jwt", access_token="access")
        assert creds.auth_header == {"Authorization": "Bearer access"}

    def test_headers_include_user_agent(self):
        creds = Credentials(api_key="key")
        headers = creds.headers
        assert "User-Agent" in headers
        assert "council-sdk-python" in headers["User-Agent"]


# ── Error Tests ────────────────────────────────────────────────────────────────


class TestErrors:
    def test_error_hierarchy(self):
        assert issubclass(AuthenticationError, CouncilError)
        assert issubclass(JuryDeniedError, CouncilError)
        assert issubclass(RateLimitError, CouncilError)

    def test_raise_for_status_401(self):
        with pytest.raises(AuthenticationError) as exc_info:
            raise_for_status(401, {"error": "Invalid token"})
        assert exc_info.value.status_code == 401

    def test_raise_for_status_404(self):
        with pytest.raises(NotFoundError):
            raise_for_status(404, {"error": "Not found"})

    def test_raise_for_status_429_with_retry(self):
        with pytest.raises(RateLimitError) as exc_info:
            raise_for_status(429, {"error": "Too many requests", "retry_after": 30})
        assert exc_info.value.retry_after == 30

    def test_raise_for_status_400_validation(self):
        with pytest.raises(ValidationError) as exc_info:
            raise_for_status(400, {
                "error": {"message": "Invalid field", "details": [{"field": "name"}]}
            })
        assert exc_info.value.field == "name"

    def test_jury_denied_error_details(self):
        err = JuryDeniedError(
            reasoning="Unsafe action",
            votes=[{"juror": "guardian", "decision": "denied"}],
        )
        assert err.reasoning == "Unsafe action"
        assert len(err.votes) == 1
        assert err.code == "jury_denied"

    def test_generic_error(self):
        with pytest.raises(CouncilError):
            raise_for_status(500, {"error": "Internal server error"})


# ── Mock Client Tests ──────────────────────────────────────────────────────────


class TestMockCouncil:
    @pytest.mark.asyncio
    async def test_mock_jury_deliberate(self):
        mock = MockCouncil()
        mock.jury.set_response(MockVerdict(decision="approved", confidence=0.9))

        verdict = await mock.jury.deliberate(
            action="deploy",
            context={"target": "prod"},
            risk_level="high",
        )
        assert verdict.decision == "approved"
        assert verdict.confidence == 0.9
        assert len(verdict.votes) == 2

    @pytest.mark.asyncio
    async def test_mock_jury_default_response(self):
        mock = MockCouncil()
        verdict = await mock.jury.deliberate(action="test", context={})
        assert verdict.decision == "approved"

    @pytest.mark.asyncio
    async def test_mock_agents_register(self):
        mock = MockCouncil()
        agent = await mock.agents.register(
            workspace_id="ws_1",
            name="TestBot",
            model="gpt-4",
        )
        assert agent.name == "TestBot"
        assert agent.status == "active"
        assert agent.id.startswith("agent_")

    @pytest.mark.asyncio
    async def test_mock_agents_crud(self):
        mock = MockCouncil()
        agent = await mock.agents.register(workspace_id="ws_1", name="Bot")
        fetched = await mock.agents.get(agent.id)
        assert fetched.id == agent.id

        await mock.agents.delete(agent.id)
        # After deletion, get returns a default
        fetched2 = await mock.agents.get(agent.id)
        assert fetched2.name == "MockAgent"

    @pytest.mark.asyncio
    async def test_mock_sandbox_execute(self):
        mock = MockCouncil()
        mock.sandbox.set_response(stdout="Hello World", exit_code=0)

        result = await mock.sandbox.execute(code="print('Hello World')")
        assert result.stdout == "Hello World"
        assert result.exit_code == 0

    @pytest.mark.asyncio
    async def test_mock_me(self):
        mock = MockCouncil()
        user = await mock.me()
        assert user["email"] == "test@example.com"


# ── Type Tests ─────────────────────────────────────────────────────────────────


class TestTypes:
    def test_agent_model(self):
        agent = Agent(
            id="agent_001",
            name="TestBot",
            capabilities=["web_search", "code_execution"],
        )
        assert agent.id == "agent_001"
        assert len(agent.capabilities) == 2
        assert agent.status == "idle"

    def test_verdict_model(self):
        verdict = Verdict(
            id="delib_001",
            decision="approved",
            confidence=0.85,
            reasoning="All clear",
            votes=[],
        )
        assert verdict.decision == "approved"
        assert verdict.deliberation_rounds == 1

    def test_result_success(self):
        result = Result.success(42)
        assert result.is_success
        assert result.value == 42
        assert result.error is None

    def test_result_failure(self):
        err = ValueError("bad value")
        result = Result.failure(err)
        assert not result.is_success
        assert result.error is err

    def test_enum_values(self):
        assert RiskLevel.HIGH.value == "high"
        assert VerdictDecision.APPROVED.value == "approved"
        assert AgentCapability.WEB_SEARCH.value == "web_search"


# ── Client Construction Tests ──────────────────────────────────────────────────


class TestClientConstruction:
    def test_default_construction(self, monkeypatch):
        monkeypatch.delenv("COUNCIL_API_KEY", raising=False)
        monkeypatch.delenv("COUNCIL_BASE_URL", raising=False)
        client = Council()
        assert client._credentials.base_url == "http://localhost:3001"

    def test_explicit_construction(self):
        client = Council(api_key="test", base_url="http://custom:9000")
        assert client._credentials.api_key == "test"
        assert client._credentials.base_url == "http://custom:9000"

    def test_namespaces_exist(self):
        client = Council(api_key="test")
        assert hasattr(client, "agents")
        assert hasattr(client, "jury")
        assert hasattr(client, "sandbox")
        assert hasattr(client, "audit")

    def test_repr(self):
        client = Council(base_url="http://test:3000")
        assert "test:3000" in repr(client)
