"""AGP Command operations — agent registration, governance, deployments & fleets."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from council.transport import Transport


class CommandNamespace:
    """AGP Command operations for agent registration, governance actions,
    deployments, fleets, and activity streams.

    Usage::

        agent = await client.command.register_agent(
            name="Bot",
            organization_id="org_1",
            agent_class="DIGITAL",
            digital={"model": "gpt-4", "provider": "openai", "runtime": "NODE"},
            declared_caps=["api.call"],
            governance_profile_id="gov_1",
            provenance_trust="INTERNAL",
            code_trust="AUDITED",
            network_trust="VPN",
        )
    """

    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    # ── Agent Registration ──────────────────────────────────────────────

    async def register_agent(
        self,
        name: str,
        organization_id: str,
        agent_class: str,
        declared_caps: List[str],
        governance_profile_id: str,
        provenance_trust: str,
        code_trust: str,
        network_trust: str,
        description: Optional[str] = None,
        digital: Optional[Dict[str, Any]] = None,
        physical: Optional[Dict[str, Any]] = None,
        hardware_trust: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Register a new agent in the AGP registry."""
        return await self._transport.post("/agp/v1/agents/register", json={
            "name": name,
            "organizationId": organization_id,
            "agentClass": agent_class,
            "description": description,
            "digital": digital,
            "physical": physical,
            "declaredCaps": declared_caps,
            "governanceProfileId": governance_profile_id,
            "provenanceTrust": provenance_trust,
            "codeTrust": code_trust,
            "hardwareTrust": hardware_trust,
            "networkTrust": network_trust,
        })

    async def get_agent(self, agent_id: str) -> Dict[str, Any]:
        """Get an agent by ID."""
        return await self._transport.get(f"/agp/v1/agents/{agent_id}")

    async def list_agents(self, organization_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """List agents, optionally filtered by organization."""
        params = f"?organizationId={organization_id}" if organization_id else ""
        return await self._transport.get(f"/agp/v1/agents{params}")

    # ── Governance Actions ──────────────────────────────────────────────

    async def request_action(
        self, agent_id: str, action: str, context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Request a governed action on behalf of an agent."""
        return await self._transport.post("/agp/v1/governance/action", json={
            "agentId": agent_id,
            "action": action,
            "context": context,
            "protocolVersion": "agp/v1",
        })

    async def get_governance_events(self, agent_id: str) -> List[Dict[str, Any]]:
        """Get governance events for an agent."""
        return await self._transport.get(f"/agp/v1/governance/events/{agent_id}")

    # ── Deployments ─────────────────────────────────────────────────────

    async def create_deployment(
        self,
        agent_id: str,
        mode: str,
        compute_target: str,
        cloud_spec: Optional[Dict[str, Any]] = None,
        replicas: int = 1,
        schedule: Optional[str] = None,
        edge_node_id: Optional[str] = None,
        external_endpoint: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a new deployment for an agent."""
        return await self._transport.post("/agp/v1/deployments", json={
            "agentId": agent_id,
            "mode": mode,
            "computeTarget": compute_target,
            "cloudSpec": cloud_spec,
            "replicas": replicas,
            "schedule": schedule,
            "edgeNodeId": edge_node_id,
            "externalEndpoint": external_endpoint,
        })

    async def list_deployments(self, agent_id: str) -> List[Dict[str, Any]]:
        """List deployments for an agent."""
        return await self._transport.get(f"/agp/v1/deployments/{agent_id}")

    # ── Fleets ──────────────────────────────────────────────────────────

    async def create_fleet(
        self,
        name: str,
        organization_id: str,
        governance_profile_id: str,
        description: Optional[str] = None,
        template_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a new fleet."""
        return await self._transport.post("/agp/v1/fleets", json={
            "name": name,
            "organizationId": organization_id,
            "description": description,
            "templateId": template_id,
            "governanceProfileId": governance_profile_id,
        })

    async def list_fleets(self, organization_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """List fleets, optionally filtered by organization."""
        params = f"?organizationId={organization_id}" if organization_id else ""
        return await self._transport.get(f"/agp/v1/fleets{params}")

    # ── Activity ────────────────────────────────────────────────────────

    async def get_activity(self, agent_id: str) -> List[Dict[str, Any]]:
        """Get the activity stream for an agent."""
        return await self._transport.get(f"/agp/v1/activity/{agent_id}")
