"""Council Connector SDK — build tool integrations for governed AI agents."""

from .define_connector import define_connector
from .testing import create_test_context, MockHttpRule, TestHttpClient, TestConfigReader, TestLogger
from .types import (
    ConnectorContext,
    ConnectorHttpClient,
    ConnectorConfigReader,
    ConnectorLogger,
    ConnectorManifest,
    ConnectorTrust,
    HttpResponse,
)

__all__ = [
    "define_connector",
    "create_test_context",
    "MockHttpRule",
    "TestHttpClient",
    "TestConfigReader",
    "TestLogger",
    "ConnectorContext",
    "ConnectorHttpClient",
    "ConnectorConfigReader",
    "ConnectorLogger",
    "ConnectorManifest",
    "ConnectorTrust",
    "HttpResponse",
]
