"""Testing utilities for Council connectors."""

from __future__ import annotations

import fnmatch
from dataclasses import dataclass, field
from typing import Any

from .types import ConnectorContext, HttpResponse


@dataclass
class HttpCall:
    method: str
    url: str
    headers: dict[str, str] | None = None
    body: Any = None


@dataclass
class MockHttpRule:
    status: int
    body: Any
    headers: dict[str, str] | None = None


class TestHttpClient:
    def __init__(self, mocks: dict[str, MockHttpRule] | None = None):
        self.calls: list[HttpCall] = []
        self._mocks = mocks or {}

    def _find_mock(self, url: str) -> HttpResponse:
        for pattern, rule in self._mocks.items():
            if fnmatch.fnmatch(url, pattern):
                return HttpResponse(status=rule.status, data=rule.body, headers=rule.headers or {})
        return HttpResponse(status=404, data={"error": f"No mock for {url}"}, headers={})

    async def request(self, method: str, url: str, *, headers: dict[str, str] | None = None, body: Any = None, timeout: int | None = None) -> HttpResponse:
        self.calls.append(HttpCall(method=method, url=url, headers=headers, body=body))
        return self._find_mock(url)

    async def get(self, url: str, *, headers: dict[str, str] | None = None, timeout: int | None = None) -> HttpResponse:
        return await self.request("GET", url, headers=headers)

    async def post(self, url: str, *, headers: dict[str, str] | None = None, body: Any = None, timeout: int | None = None) -> HttpResponse:
        return await self.request("POST", url, headers=headers, body=body)

    async def put(self, url: str, *, headers: dict[str, str] | None = None, body: Any = None, timeout: int | None = None) -> HttpResponse:
        return await self.request("PUT", url, headers=headers, body=body)

    async def delete(self, url: str, *, headers: dict[str, str] | None = None, timeout: int | None = None) -> HttpResponse:
        return await self.request("DELETE", url, headers=headers)


class TestConfigReader:
    def __init__(self, config: dict[str, str] | None = None):
        self._config = config or {}

    def get(self, key: str) -> str | None:
        return self._config.get(key)

    def get_required(self, key: str) -> str:
        val = self._config.get(key)
        if val is None:
            raise KeyError(f"Missing required config: {key}")
        return val

    def get_all(self) -> dict[str, str]:
        return dict(self._config)


class TestLogger:
    def __init__(self):
        self.entries: list[dict[str, Any]] = []

    def info(self, message: str, data: dict[str, Any] | None = None) -> None:
        self.entries.append({"level": "info", "message": message, "data": data})

    def warn(self, message: str, data: dict[str, Any] | None = None) -> None:
        self.entries.append({"level": "warn", "message": message, "data": data})

    def error(self, message: str, data: dict[str, Any] | None = None) -> None:
        self.entries.append({"level": "error", "message": message, "data": data})


def create_test_context(
    *,
    config: dict[str, str] | None = None,
    http_mocks: dict[str, MockHttpRule] | None = None,
    agent_id: str = "test-agent",
    organization_id: str = "test-org",
) -> ConnectorContext:
    """Create a mock ConnectorContext for testing connectors without running Council.

    Usage::

        ctx = create_test_context(
            config={"api_key": "test-key"},
            http_mocks={
                "https://api.example.com/*": MockHttpRule(status=200, body={"data": "test"}),
            },
        )
        result = await my_connector.fetch_data(FetchParams(query="test"), ctx)
        assert result.data == "test"
        assert len(ctx.http.calls) == 1
    """
    return ConnectorContext(
        http=TestHttpClient(http_mocks),
        config=TestConfigReader(config),
        log=TestLogger(),
        agent_id=agent_id,
        organization_id=organization_id,
    )
