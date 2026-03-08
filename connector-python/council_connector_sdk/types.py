"""Type definitions for Council connector SDK."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol


ConnectorTrust = Literal["council", "verified", "community"]


@dataclass
class HttpResponse:
    status: int
    data: Any
    headers: dict[str, str] = field(default_factory=dict)


class ConnectorHttpClient(Protocol):
    async def request(self, method: str, url: str, *, headers: dict[str, str] | None = None, body: Any = None, timeout: int | None = None) -> HttpResponse: ...
    async def get(self, url: str, *, headers: dict[str, str] | None = None, timeout: int | None = None) -> HttpResponse: ...
    async def post(self, url: str, *, headers: dict[str, str] | None = None, body: Any = None, timeout: int | None = None) -> HttpResponse: ...
    async def put(self, url: str, *, headers: dict[str, str] | None = None, body: Any = None, timeout: int | None = None) -> HttpResponse: ...
    async def delete(self, url: str, *, headers: dict[str, str] | None = None, timeout: int | None = None) -> HttpResponse: ...


class ConnectorConfigReader(Protocol):
    def get(self, key: str) -> str | None: ...
    def get_required(self, key: str) -> str: ...
    def get_all(self) -> dict[str, str]: ...


class ConnectorLogger(Protocol):
    def info(self, message: str, data: dict[str, Any] | None = None) -> None: ...
    def warn(self, message: str, data: dict[str, Any] | None = None) -> None: ...
    def error(self, message: str, data: dict[str, Any] | None = None) -> None: ...


@dataclass
class ConnectorContext:
    http: ConnectorHttpClient
    config: ConnectorConfigReader
    log: ConnectorLogger
    agent_id: str
    organization_id: str


@dataclass
class ConnectorManifest:
    name: str
    version: str
    publisher: str
    trust: ConnectorTrust
    operations: list[str]
    network_allowlist: list[str] | None = None
    timeout: int | None = None
