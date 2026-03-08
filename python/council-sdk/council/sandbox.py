"""Sandbox namespace — execute code in isolated environments."""

from __future__ import annotations

from typing import Any, AsyncIterator, Optional, Union

from council.transport import Transport
from council.types import ExecutionResult, Runtime


class SandboxNamespace:
    """Execute code in sandboxed environments.

    Usage::

        result = await client.sandbox.execute(
            code="print('Hello, Council!')",
            runtime=Runtime.PYTHON,
        )
    """

    def __init__(self, transport: Transport) -> None:
        self._t = transport

    async def execute(
        self,
        *,
        code: str,
        runtime: Union[str, Runtime] = Runtime.PYTHON,
        timeout_ms: int = 5000,
        memory_mb: int = 256,
        files: Optional[dict[str, str]] = None,
        env: Optional[dict[str, str]] = None,
        agent_id: Optional[str] = None,
    ) -> ExecutionResult:
        """Execute code in an isolated sandbox.

        Args:
            code: The source code to execute.
            runtime: Execution runtime (python, node, bash, deno).
            timeout_ms: Maximum execution time in milliseconds.
            memory_mb: Maximum memory allocation in MB.
            files: Virtual files to make available (name -> content).
            env: Environment variables for the execution.
            agent_id: Optional agent ID for attribution.

        Returns:
            ExecutionResult with stdout, stderr, exit_code, etc.
        """
        rt = runtime.value if isinstance(runtime, Runtime) else runtime

        body: dict[str, Any] = {
            "code": code,
            "runtime": rt,
            "timeoutMs": timeout_ms,
            "memoryMb": memory_mb,
        }
        if files:
            body["files"] = files
        if env:
            body["env"] = env
        if agent_id:
            body["agentId"] = agent_id

        # Use the tools endpoint for code execution
        resp = await self._t.post("/api/tools/execute", json=body)
        data = resp.get("data", resp)
        return _parse_execution_result(data)

    async def get(self, execution_id: str) -> ExecutionResult:
        """Get a previous execution result by ID."""
        resp = await self._t.get(f"/api/tools/executions/{execution_id}")
        return _parse_execution_result(resp.get("data", resp))

    async def list(
        self,
        *,
        runtime: Optional[str | Runtime] = None,
        since: Optional[str] = None,
        limit: int = 50,
    ) -> AsyncIterator[ExecutionResult]:
        """List recent code executions."""
        params: dict[str, Any] = {"limit": limit}
        if runtime:
            params["runtime"] = runtime.value if isinstance(runtime, Runtime) else runtime
        if since:
            params["since"] = since

        resp = await self._t.get("/api/tools/executions", params=params)
        data = resp.get("data", [])
        if not isinstance(data, list):
            data = [data]

        for item in data:
            yield _parse_execution_result(item)


# ── Helpers ────────────────────────────────────────────────────────────────────


def _parse_execution_result(data: dict[str, Any]) -> ExecutionResult:
    return ExecutionResult(
        id=data.get("id", ""),
        stdout=data.get("stdout", data.get("output", "")),
        stderr=data.get("stderr", ""),
        exit_code=data.get("exitCode", data.get("exit_code", 0)),
        execution_time_ms=data.get("executionTimeMs", data.get("execution_time_ms", 0)),
        memory_used_mb=data.get("memoryUsedMb", data.get("memory_used_mb", 0)),
        created_at=data.get("createdAt", data.get("created_at")),
    )
