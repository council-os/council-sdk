"""define_connector decorator for creating Council connectors."""

from __future__ import annotations

from typing import Any, Type
from pydantic import BaseModel

from .types import ConnectorTrust


def define_connector(
    *,
    name: str,
    version: str,
    publisher: str,
    trust: ConnectorTrust,
    config_schema: Type[BaseModel] | None = None,
) -> Any:
    """Decorator that marks a class as a Council connector.

    Usage::

        @define_connector(
            name="my-api",
            version="1.0.0",
            publisher="my-org",
            trust="community",
            config_schema=MyConfig,
        )
        class MyApiConnector:
            async def get_data(self, params: GetDataParams, ctx: ConnectorContext) -> GetDataResult:
                resp = await ctx.http.get(f"https://api.example.com/{params.query}")
                return GetDataResult(results=resp.data)
    """
    if not name:
        raise ValueError("Connector name is required")
    if not version:
        raise ValueError("Connector version is required")

    def decorator(cls: Type) -> Type:
        cls._connector_name = name
        cls._connector_version = version
        cls._connector_publisher = publisher
        cls._connector_trust = trust
        cls._connector_config_schema = config_schema

        # Discover operations: public async methods (not starting with _)
        operations = []
        for attr_name in dir(cls):
            if attr_name.startswith("_"):
                continue
            attr = getattr(cls, attr_name, None)
            if callable(attr):
                operations.append(attr_name)

        if not operations:
            raise ValueError(f"Connector '{name}' must have at least one public method (operation)")

        cls._connector_operations = operations
        return cls

    return decorator
