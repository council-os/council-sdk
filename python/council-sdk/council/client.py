"""Main Council client — entry point for the SDK."""

from __future__ import annotations

from typing import Any, Optional

import httpx

from council.agents import AgentsNamespace
from council.audit import AuditNamespace
from council.auth import Credentials, resolve_credentials
from council.command import CommandNamespace
from council.containment import ContainmentNamespace
from council.jury import JuryNamespace
from council.fleet import FleetNamespace
from council.safety import SafetyNamespace
from council.sandbox import SandboxNamespace
from council.streaming import EventStream
from council.transport import Transport
from council.types import Workspace


class Council:
    """Client for the Council AI Governance Platform.

    Usage::

        # From environment variables (COUNCIL_API_KEY, COUNCIL_BASE_URL)
        client = Council()

        # Explicit credentials
        client = Council(api_key="ck_live_...", base_url="https://council.example.com")

        # With JWT token
        client = Council(jwt_token="eyJ...")

    Namespaces::

        client.agents   — Agent registration & lifecycle
        client.jury     — Jury deliberation & verdicts
        client.sandbox  — Sandboxed code execution
        client.audit    — Audit logs & blockchain verification
        client.command  — AGP command: registration, governance, deployments, fleets
    """

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        jwt_token: Optional[str] = None,
        base_url: Optional[str] = None,
        http_client: Optional[httpx.AsyncClient] = None,
        timeout: float = 30.0,
    ) -> None:
        self._credentials = resolve_credentials(
            api_key=api_key,
            jwt_token=jwt_token,
            base_url=base_url,
        )
        self._transport = Transport(
            credentials=self._credentials,
            http_client=http_client,
            timeout=timeout,
        )

        # Initialize namespaces
        self.agents = AgentsNamespace(self._transport)
        self.jury = JuryNamespace(self._transport)
        self.sandbox = SandboxNamespace(self._transport)
        self.audit = AuditNamespace(self._transport)
        self.safety = SafetyNamespace(self._transport)
        self.fleet = FleetNamespace(self._transport)
        self.containment = ContainmentNamespace(self._transport)
        self.command = CommandNamespace(self._transport)

    @classmethod
    def from_config(cls, profile: str = "default", **kwargs: Any) -> "Council":
        """Create a client from ~/.council/config.json.

        Args:
            profile: Config profile name (default: "default").
            **kwargs: Additional arguments passed to the constructor.
        """
        creds = resolve_credentials(profile=profile)
        return cls(
            api_key=creds.api_key,
            jwt_token=creds.jwt_token,
            base_url=creds.base_url,
            **kwargs,
        )

    # ── Auth convenience ───────────────────────────────────────────────────

    async def login(self, *, email: str, password: str) -> dict[str, Any]:
        """Authenticate with email/password and store the resulting tokens.

        Returns:
            Dict with user info, accessToken, and refreshToken.
        """
        resp = await self._transport.post(
            "/api/auth/login",
            json={"email": email, "password": password},
        )
        data = resp.get("data", resp)
        if "accessToken" in data:
            self._transport.update_auth(
                access_token=data["accessToken"],
                refresh_token=data.get("refreshToken"),
            )
        return data

    async def register(
        self, *, email: str, password: str, name: str
    ) -> dict[str, Any]:
        """Register a new user account.

        Returns:
            Dict with user info and tokens.
        """
        resp = await self._transport.post(
            "/api/auth/register",
            json={"email": email, "password": password, "name": name},
        )
        data = resp.get("data", resp)
        if "accessToken" in data:
            self._transport.update_auth(
                access_token=data["accessToken"],
                refresh_token=data.get("refreshToken"),
            )
        return data

    async def refresh_token(self, refresh_token: Optional[str] = None) -> dict[str, Any]:
        """Refresh the access token."""
        token = refresh_token or (
            self._credentials.refresh_token if self._credentials else None
        )
        body: dict[str, Any] = {}
        if token:
            body["refreshToken"] = token

        resp = await self._transport.post("/api/auth/refresh", json=body)
        data = resp.get("data", resp)
        if "accessToken" in data:
            self._transport.update_auth(
                access_token=data["accessToken"],
                refresh_token=data.get("refreshToken"),
            )
        return data

    async def me(self) -> dict[str, Any]:
        """Get the current authenticated user."""
        resp = await self._transport.get("/api/auth/me")
        return resp.get("data", resp)

    async def logout(self) -> None:
        """Logout and invalidate the current tokens."""
        body: dict[str, Any] = {}
        if self._credentials.refresh_token:
            body["refreshToken"] = self._credentials.refresh_token
        await self._transport.post("/api/auth/logout", json=body)
        self._credentials.access_token = None
        self._credentials.refresh_token = None

    # ── Workspace convenience ──────────────────────────────────────────────

    async def create_workspace(
        self, *, name: str, description: Optional[str] = None
    ) -> Workspace:
        """Create a new workspace."""
        body: dict[str, Any] = {"name": name}
        if description:
            body["description"] = description
        resp = await self._transport.post("/api/workspaces", json=body)
        data = resp.get("data", resp)
        return Workspace(
            id=data.get("id", ""),
            name=data.get("name", ""),
            description=data.get("description"),
            owner_id=data.get("ownerId", data.get("owner_id")),
            created_at=data.get("createdAt", data.get("created_at")),
            updated_at=data.get("updatedAt", data.get("updated_at")),
        )

    async def list_workspaces(self) -> list[Workspace]:
        """List all workspaces."""
        resp = await self._transport.get("/api/workspaces")
        data = resp.get("data", [])
        if not isinstance(data, list):
            data = [data]
        return [
            Workspace(
                id=w.get("id", ""),
                name=w.get("name", ""),
                description=w.get("description"),
                owner_id=w.get("ownerId", w.get("owner_id")),
                created_at=w.get("createdAt", w.get("created_at")),
                updated_at=w.get("updatedAt", w.get("updated_at")),
            )
            for w in data
        ]

    # ── Streaming ──────────────────────────────────────────────────────────

    def stream(self) -> EventStream:
        """Create a WebSocket event stream for real-time updates.

        Usage::

            async with client.stream() as events:
                await events.subscribe("jury:*")
                async for event in events:
                    print(event.type, event.data)
        """
        return EventStream(self._credentials)

    # ── Lifecycle ──────────────────────────────────────────────────────────

    async def close(self) -> None:
        """Close the HTTP client and release resources."""
        await self._transport.close()

    async def __aenter__(self) -> "Council":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()

    def __repr__(self) -> str:
        return f"Council(base_url={self._credentials.base_url!r})"
