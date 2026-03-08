"""Agents namespace — agent registration and lifecycle management."""

from __future__ import annotations

from typing import Any, AsyncIterator, Optional, Union

from council.transport import Transport
from council.types import Agent, AgentAction, AgentCapability, CostSummary


class AgentsNamespace:
    """Manage agents registered on the Council platform.

    Usage::

        agent = await client.agents.register(
            workspace_id="ws_abc",
            name="ResearchBot",
            model="claude-3-opus",
        )
    """

    def __init__(self, transport: Transport) -> None:
        self._t = transport

    # ── CRUD ───────────────────────────────────────────────────────────────

    async def register(
        self,
        *,
        workspace_id: str,
        name: str,
        model: Optional[str] = None,
        provider: Optional[str] = None,
        personality: Optional[str] = None,
        autonomy_level: Optional[int] = None,
        capabilities: Optional[list] = None,
        configuration: Optional[dict] = None,
        metadata: Optional[dict] = None,
    ) -> Agent:
        """Register a new agent in a workspace."""
        body: dict[str, Any] = {
            "workspaceId": workspace_id,
            "name": name,
        }
        if model is not None:
            body["model"] = model
        if provider is not None:
            body["provider"] = provider
        if personality is not None:
            body["personality"] = personality
        if autonomy_level is not None:
            body["autonomyLevel"] = autonomy_level
        if capabilities is not None:
            body["capabilities"] = [
                c.value if isinstance(c, AgentCapability) else c for c in capabilities
            ]
        if configuration is not None:
            body["configuration"] = configuration
        if metadata is not None:
            body["metadata"] = metadata

        resp = await self._t.post("/api/agents", json=body)
        return _parse_agent(resp.get("data", resp))

    async def get(self, agent_id: str) -> Agent:
        """Get an agent by ID."""
        resp = await self._t.get(f"/api/agents/{agent_id}")
        return _parse_agent(resp.get("data", resp))

    async def list(
        self,
        *,
        workspace_id: Optional[str] = None,
        status: Optional[str] = None,
        capability: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> AsyncIterator[Agent]:
        """List agents with optional filters. Yields Agent objects."""
        params: dict[str, Any] = {}
        if workspace_id:
            params["workspaceId"] = workspace_id
        if status:
            params["status"] = status

        resp = await self._t.get("/api/agents", params=params)
        agents_data = resp.get("data", [])

        if not isinstance(agents_data, list):
            agents_data = [agents_data]

        count = 0
        for item in agents_data:
            agent = _parse_agent(item)

            # Client-side filter for capability (if API doesn't support it)
            if capability and capability not in agent.capabilities:
                continue

            yield agent
            count += 1
            if limit and count >= limit:
                break

    async def update(
        self,
        agent_id: str,
        *,
        name: Optional[str] = None,
        model: Optional[str] = None,
        personality: Optional[str] = None,
        autonomy_level: Optional[int] = None,
        capabilities: Optional[list] = None,
        configuration: Optional[dict] = None,
        metadata: Optional[dict] = None,
        status: Optional[str] = None,
    ) -> Agent:
        """Update an agent's configuration."""
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if model is not None:
            body["model"] = model
        if personality is not None:
            body["personality"] = personality
        if autonomy_level is not None:
            body["autonomyLevel"] = autonomy_level
        if capabilities is not None:
            body["capabilities"] = [
                c.value if isinstance(c, AgentCapability) else c for c in capabilities
            ]
        if configuration is not None:
            body["configuration"] = configuration
        if metadata is not None:
            body["metadata"] = metadata
        if status is not None:
            body["status"] = status

        resp = await self._t.put(f"/api/agents/{agent_id}", json=body)
        return _parse_agent(resp.get("data", resp))

    async def delete(self, agent_id: str) -> None:
        """Permanently delete an agent."""
        await self._t.delete(f"/api/agents/{agent_id}")

    # ── Lifecycle ──────────────────────────────────────────────────────────

    async def suspend(self, agent_id: str, *, reason: Optional[str] = None) -> Agent:
        """Suspend an agent."""
        body: dict[str, Any] = {"status": "suspended"}
        if reason:
            body["configuration"] = {"suspend_reason": reason}
        resp = await self._t.put(f"/api/agents/{agent_id}", json=body)
        return _parse_agent(resp.get("data", resp))

    async def reactivate(self, agent_id: str) -> Agent:
        """Reactivate a suspended agent."""
        resp = await self._t.put(
            f"/api/agents/{agent_id}",
            json={"status": "active"},
        )
        return _parse_agent(resp.get("data", resp))

    # ── Execution ──────────────────────────────────────────────────────────

    async def execute(
        self,
        agent_id: str,
        *,
        action: str,
        context: dict[str, Any],
        canvas_id: Optional[str] = None,
        system_prompt: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> dict[str, Any]:
        """Execute an action on an agent."""
        body: dict[str, Any] = {
            "action": action,
            "context": context,
        }
        if canvas_id:
            body["canvasId"] = canvas_id
        if system_prompt:
            body["systemPrompt"] = system_prompt
        if temperature is not None:
            body["temperature"] = temperature
        if max_tokens is not None:
            body["maxTokens"] = max_tokens

        resp = await self._t.post(f"/api/agents/{agent_id}/execute", json=body)
        return resp.get("data", resp)

    async def get_actions(
        self,
        agent_id: str,
        *,
        limit: int = 50,
    ) -> list[AgentAction]:
        """Get recent actions for an agent."""
        resp = await self._t.get(
            f"/api/agents/{agent_id}/actions",
            params={"limit": limit},
        )
        data = resp.get("data", [])
        if not isinstance(data, list):
            return []
        return [_parse_action(item) for item in data]

    async def get_cost(self, agent_id: str) -> CostSummary:
        """Get the cost summary for an agent."""
        resp = await self._t.get(f"/api/agents/{agent_id}/cost")
        data = resp.get("data", {})
        return CostSummary(
            total_cost=data.get("totalCost", data.get("total_cost", 0)),
            total_tokens=data.get("totalTokens", data.get("total_tokens", 0)),
            action_count=data.get("actionCount", data.get("action_count", 0)),
            breakdown=data.get("breakdown", {}),
        )


# ── Helpers ────────────────────────────────────────────────────────────────────


def _parse_agent(data: dict[str, Any]) -> Agent:
    """Parse a raw API response into an Agent model."""
    return Agent(
        id=data.get("id", ""),
        name=data.get("name", ""),
        status=data.get("status", "idle"),
        model=data.get("model"),
        provider=data.get("provider"),
        personality=data.get("personality"),
        autonomy_level=data.get("autonomyLevel", data.get("autonomy_level", 3)),
        capabilities=data.get("capabilities", []),
        configuration=data.get("configuration", {}),
        metadata=data.get("metadata", {}),
        workspace_id=data.get("workspaceId", data.get("workspace_id")),
        created_at=data.get("createdAt", data.get("created_at")),
        updated_at=data.get("updatedAt", data.get("updated_at")),
        api_key=data.get("apiKey", data.get("api_key")),
    )


def _parse_action(data: dict[str, Any]) -> AgentAction:
    return AgentAction(
        id=data.get("id", ""),
        agent_id=data.get("agentId", data.get("agent_id", "")),
        action=data.get("action", ""),
        context=data.get("context", {}),
        response=data.get("response"),
        tokens_used=data.get("tokensUsed", data.get("tokens_used", 0)),
        cost=data.get("cost", 0),
        model=data.get("model"),
        created_at=data.get("createdAt", data.get("created_at")),
    )
