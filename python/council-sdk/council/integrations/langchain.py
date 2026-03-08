"""LangChain integration for Council SDK.

Wraps LangChain tools with Council jury approval and provides a callback
handler that intercepts tool invocations.

Install: pip install council-sdk[langchain]
"""

from __future__ import annotations

import asyncio
from typing import Any, Callable, Dict, List, Optional, Sequence

try:
    from langchain_core.callbacks import AsyncCallbackHandler, BaseCallbackHandler
    from langchain_core.tools import BaseTool, ToolException

    HAS_LANGCHAIN = True
except ImportError:
    HAS_LANGCHAIN = False


def _require_langchain() -> None:
    if not HAS_LANGCHAIN:
        raise ImportError(
            "langchain is required for this integration. "
            "Install it with: pip install council-sdk[langchain]"
        )


class CouncilApprovalTool:
    """Wrap a LangChain tool with Council jury approval.

    Usage::

        from council.integrations.langchain import CouncilApprovalTool

        safe_tool = CouncilApprovalTool(
            tool=dangerous_tool,
            council_client=client,
            risk_level="high",
        )
    """

    def __init__(
        self,
        *,
        tool: Any,  # BaseTool
        council_client: Any,
        risk_level: str = "medium",
        context_builder: Optional[Callable[[str], dict[str, Any]]] = None,
    ) -> None:
        _require_langchain()
        self._tool = tool
        self._client = council_client
        self._risk_level = risk_level
        self._context_builder = context_builder or (lambda x: {"input": x})

        # Preserve tool metadata
        self.name = tool.name
        self.description = f"[Council-governed] {tool.description}"

    async def arun(self, tool_input: str, **kwargs: Any) -> str:
        """Run the tool with Council approval."""
        from council.errors import JuryDeniedError

        context = self._context_builder(tool_input)

        try:
            verdict = await self._client.jury.deliberate(
                action=f"tool:{self.name}",
                context=context,
                risk_level=self._risk_level,
            )
        except JuryDeniedError as e:
            raise ToolException(  # type: ignore[misc]
                f"Council denied tool execution: {e.reasoning}"
            ) from e

        # If approved (with possible conditions), execute the tool
        result = await self._tool.arun(tool_input, **kwargs)
        return result

    def run(self, tool_input: str, **kwargs: Any) -> str:
        """Synchronous wrapper."""
        return asyncio.run(self.arun(tool_input, **kwargs))


class CouncilApprovalCallback:
    """LangChain callback handler that submits tool calls to Council for approval.

    Usage::

        callback = CouncilApprovalCallback(
            council_client=client,
            risk_levels={"database_query": "high", "web_search": "low"},
        )

        agent = initialize_agent(tools=tools, llm=llm, callbacks=[callback])
    """

    def __init__(
        self,
        *,
        council_client: Any,
        risk_levels: Optional[dict[str, str]] = None,
        default_risk_level: str = "medium",
    ) -> None:
        _require_langchain()
        self._client = council_client
        self._risk_levels = risk_levels or {}
        self._default_risk_level = default_risk_level

    async def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        **kwargs: Any,
    ) -> None:
        """Called when a tool starts — submit to Council for approval."""
        tool_name = serialized.get("name", "unknown_tool")
        risk_level = self._risk_levels.get(tool_name, self._default_risk_level)

        from council.errors import JuryDeniedError

        try:
            await self._client.jury.deliberate(
                action=f"tool:{tool_name}",
                context={"input": input_str, "tool": tool_name},
                risk_level=risk_level,
            )
        except JuryDeniedError as e:
            raise ToolException(  # type: ignore[misc]
                f"Council denied {tool_name}: {e.reasoning}"
            ) from e
