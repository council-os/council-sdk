"""LlamaIndex integration for Council SDK.

Wraps LlamaIndex tools with Council jury governance.

Install: pip install council-sdk[llamaindex]
"""

from __future__ import annotations

from typing import Any, Callable, List, Optional

try:
    from llama_index.core.tools import BaseTool, FunctionTool, ToolMetadata

    HAS_LLAMAINDEX = True
except ImportError:
    HAS_LLAMAINDEX = False


def _require_llamaindex() -> None:
    if not HAS_LLAMAINDEX:
        raise ImportError(
            "llama-index is required for this integration. "
            "Install it with: pip install council-sdk[llamaindex]"
        )


class CouncilToolSpec:
    """Wrap LlamaIndex tools with Council governance.

    Usage::

        tool_spec = CouncilToolSpec(
            council_client=client,
            tools=[query_engine_tool, summary_tool],
            default_risk_level="medium",
        )

        agent = OpenAIAgent.from_tools(tool_spec.to_tool_list())
    """

    def __init__(
        self,
        *,
        council_client: Any,
        tools: list[Any],
        default_risk_level: str = "medium",
        risk_levels: Optional[dict[str, str]] = None,
    ) -> None:
        _require_llamaindex()
        self._client = council_client
        self._tools = tools
        self._default_risk_level = default_risk_level
        self._risk_levels = risk_levels or {}

    def to_tool_list(self) -> list[Any]:
        """Convert tools to Council-governed tool list."""
        governed_tools = []
        for tool in self._tools:
            tool_name = getattr(tool, "name", str(tool))
            risk = self._risk_levels.get(tool_name, self._default_risk_level)
            governed = _wrap_tool(tool, self._client, risk)
            governed_tools.append(governed)
        return governed_tools


def _wrap_tool(tool: Any, client: Any, risk_level: str) -> Any:
    """Wrap a single LlamaIndex tool with Council approval."""
    import asyncio

    original_call = tool.call if hasattr(tool, "call") else tool.__call__

    async def governed_call(*args: Any, **kwargs: Any) -> Any:
        from council.errors import JuryDeniedError

        tool_name = getattr(tool, "name", "unknown_tool")

        try:
            await client.jury.deliberate(
                action=f"tool:{tool_name}",
                context={"args": str(args), "kwargs": str(kwargs)},
                risk_level=risk_level,
            )
        except JuryDeniedError as e:
            raise RuntimeError(f"Council denied {tool_name}: {e.reasoning}") from e

        return original_call(*args, **kwargs)

    # Replace the call method
    if hasattr(tool, "call"):
        tool.call = governed_call
    return tool
