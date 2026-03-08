"""Low-level HTTP transport for the Council SDK."""

from __future__ import annotations

import asyncio
from typing import Any, AsyncIterator, Optional

import httpx

from council.auth import Credentials
from council.errors import CouncilError, NetworkError, raise_for_status


class Transport:
    """Async HTTP transport wrapping httpx."""

    def __init__(
        self,
        credentials: Credentials,
        http_client: Optional[httpx.AsyncClient] = None,
        timeout: float = 30.0,
    ) -> None:
        self._credentials = credentials
        self._timeout = timeout
        self._owned_client = http_client is None
        self._client = http_client or httpx.AsyncClient(
            base_url=credentials.base_url,
            headers=credentials.headers,
            timeout=httpx.Timeout(timeout),
        )

    @property
    def base_url(self) -> str:
        return self._credentials.base_url

    def update_auth(self, access_token: str, refresh_token: Optional[str] = None) -> None:
        """Update the auth tokens after login/refresh."""
        self._credentials.access_token = access_token
        if refresh_token:
            self._credentials.refresh_token = refresh_token
        self._client.headers.update(self._credentials.headers)

    async def request(
        self,
        method: str,
        path: str,
        *,
        json: Optional[dict[str, Any]] = None,
        params: Optional[dict[str, Any]] = None,
        headers: Optional[dict[str, str]] = None,
    ) -> dict[str, Any]:
        """Make an HTTP request and return the parsed JSON response."""
        try:
            response = await self._client.request(
                method,
                path,
                json=json,
                params=_clean_params(params),
                headers=headers,
            )
        except httpx.ConnectError as e:
            raise NetworkError(f"Failed to connect to {self._credentials.base_url}: {e}") from e
        except httpx.TimeoutException as e:
            raise NetworkError(f"Request timed out: {e}") from e
        except httpx.HTTPError as e:
            raise NetworkError(f"HTTP error: {e}") from e

        if response.status_code == 204:
            return {}

        try:
            body = response.json()
        except Exception:
            if response.is_success:
                return {"data": response.text}
            raise CouncilError(
                f"Non-JSON response (HTTP {response.status_code}): {response.text[:200]}",
                status_code=response.status_code,
            )

        if not response.is_success:
            raise_for_status(response.status_code, body)

        return body

    async def get(self, path: str, **kwargs: Any) -> dict[str, Any]:
        return await self.request("GET", path, **kwargs)

    async def post(self, path: str, **kwargs: Any) -> dict[str, Any]:
        return await self.request("POST", path, **kwargs)

    async def put(self, path: str, **kwargs: Any) -> dict[str, Any]:
        return await self.request("PUT", path, **kwargs)

    async def delete(self, path: str, **kwargs: Any) -> dict[str, Any]:
        return await self.request("DELETE", path, **kwargs)

    async def patch(self, path: str, **kwargs: Any) -> dict[str, Any]:
        return await self.request("PATCH", path, **kwargs)

    async def close(self) -> None:
        if self._owned_client:
            await self._client.aclose()


class SyncTransport:
    """Synchronous wrapper around the async Transport."""

    # Cached executor — avoids creating/destroying a thread pool per request
    _executor: "concurrent.futures.ThreadPoolExecutor | None" = None

    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    @classmethod
    def _get_executor(cls) -> "concurrent.futures.ThreadPoolExecutor":
        import concurrent.futures

        if cls._executor is None:
            cls._executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        return cls._executor

    def _run(self, coro: Any) -> Any:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            # We're inside an async context; use a cached thread
            return self._get_executor().submit(asyncio.run, coro).result()
        else:
            return asyncio.run(coro)

    def request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        return self._run(self._transport.request(method, path, **kwargs))

    def get(self, path: str, **kwargs: Any) -> dict[str, Any]:
        return self._run(self._transport.get(path, **kwargs))

    def post(self, path: str, **kwargs: Any) -> dict[str, Any]:
        return self._run(self._transport.post(path, **kwargs))

    def put(self, path: str, **kwargs: Any) -> dict[str, Any]:
        return self._run(self._transport.put(path, **kwargs))

    def delete(self, path: str, **kwargs: Any) -> dict[str, Any]:
        return self._run(self._transport.delete(path, **kwargs))

    def close(self) -> None:
        self._run(self._transport.close())


def _clean_params(params: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """Remove None values from query params."""
    if params is None:
        return None
    return {k: v for k, v in params.items() if v is not None}
