# council-connector-sdk

> Build custom connectors for Council OS in Python — give AI agents new capabilities through governed tool integrations.

Connectors are the integration layer between Council agents and external services. Each connector exposes a set of **operations** (public methods) that agents can invoke through the Council Tool Router, with every call governed by the Safety Lattice.

## Installation

```bash
pip install council-connector-sdk
```

Requires Python >= 3.9.

## Quick Example

```python
from council_connector_sdk import define_connector

@define_connector(name="weather", version="1.0.0", publisher="my-org", trust="community")
class WeatherConnector:
    async def get_forecast(self, city: str, days: int = 3, *, ctx):
        """Get weather forecast for a city."""
        res = await ctx.http.get(
            "https://api.weather.com/forecast",
            headers={"Authorization": f"Bearer {ctx.config.get_required('WEATHER_API_KEY')}"},
        )
        return {"forecasts": res.data["forecasts"]}
```

Key points:

- **`@define_connector`** is a class decorator that registers your connector with Council. It validates that the class has at least one public method.
- **Operations are public methods** -- any method not starting with `_` is auto-discovered as an operation.
- The **`ctx`** argument is a `ConnectorContext` injected at call time, providing audited HTTP, config, and logging.

## ConnectorContext

Every operation receives a `ctx` argument with the following:

| Property | Type | Description |
|---|---|---|
| `ctx.http` | `ConnectorHttpClient` | Audited HTTP client (`get`, `post`, `put`, `delete`, `request`). All requests are logged and rate-limited by Council. |
| `ctx.config` | `ConnectorConfigReader` | Credential reader scoped to the organization. `get(key)` returns `None` if missing; `get_required(key)` raises `KeyError`. `get_all()` returns all config entries. |
| `ctx.log` | `ConnectorLogger` | Structured logger with `info`, `warn`, and `error` methods. Accepts an optional `data` dict for structured metadata. |
| `ctx.agent_id` | `str` | ID of the agent executing this operation. |
| `ctx.organization_id` | `str` | ID of the organization the agent belongs to. |

Connectors must use `ctx.http` instead of `httpx`, `aiohttp`, or other HTTP libraries. This ensures all external requests are auditable and subject to rate limiting.

## Testing

The SDK ships a `create_test_context` utility for unit testing connectors without a running Council instance:

```python
import pytest
from council_connector_sdk.testing import create_test_context, MockHttpRule

ctx = create_test_context(
    config={"WEATHER_API_KEY": "test-key"},
    http_mocks={
        "https://api.weather.com/*": MockHttpRule(status=200, body={"forecasts": []}),
    },
)

connector = WeatherConnector()
result = await connector.get_forecast("London", ctx=ctx)
assert result["forecasts"] == []
assert len(ctx.http.calls) == 1
```

### `create_test_context` options

| Argument | Type | Default | Description |
|---|---|---|---|
| `config` | `dict[str, str]` | `None` | Mock config entries returned by `ctx.config`. |
| `http_mocks` | `dict[str, MockHttpRule]` | `None` | URL pattern to response mapping. Patterns support `*` and `?` wildcards (fnmatch). Unmatched URLs return 404. |
| `agent_id` | `str` | `"test-agent"` | Mock agent ID. |
| `organization_id` | `str` | `"test-org"` | Mock organization ID. |

The test HTTP client records all calls in `ctx.http.calls` (list of `HttpCall` objects), so you can assert on request count, URLs, methods, headers, and bodies.

### Testing utilities

| Class | Description |
|---|---|
| `TestHttpClient` | HTTP client that records calls and matches URL patterns (fnmatch) to mock responses. |
| `TestConfigReader` | Config reader backed by a plain dict. `get_required` raises `KeyError` if key is missing. |
| `TestLogger` | Logger that stores entries in `logger.entries` for assertion. |
| `MockHttpRule` | Dataclass defining a mock response: `status`, `body`, optional `headers`. |

## Trust Levels

Every connector declares a **trust** level that determines its execution runtime and review requirements:

| Trust | Who publishes | Runtime | Review |
|---|---|---|---|
| `council` | Council team | Runs in-process with full access | Audited by Council |
| `verified` | Third-party, Council-reviewed | Sandboxed with network allowlist | Reviewed before listing |
| `community` | Anyone | Sandboxed, restricted network, resource limits | Community-moderated |

Trust is about the **connector runtime**, not agent permissions. An agent's ability to invoke a connector operation is still governed by role-based tool assignments and the Safety Lattice.

## API Reference

### Decorators

| Export | Description |
|---|---|
| `define_connector(name, version, publisher, trust, config_schema=None)` | Class decorator that registers a connector. Auto-discovers public methods as operations. |

### Types

| Type | Description |
|---|---|
| `ConnectorContext` | Dataclass injected into every handler: `http`, `config`, `log`, `agent_id`, `organization_id`. |
| `ConnectorTrust` | `Literal["council", "verified", "community"]` |
| `ConnectorManifest` | Registry-facing metadata: `name`, `version`, `publisher`, `trust`, `operations` list, optional `network_allowlist` and `timeout`. |
| `ConnectorHttpClient` | Protocol for audited HTTP client (`request`, `get`, `post`, `put`, `delete`). |
| `ConnectorConfigReader` | Protocol for config reader (`get`, `get_required`, `get_all`). |
| `ConnectorLogger` | Protocol for structured logger (`info`, `warn`, `error`). |
| `HttpResponse` | Dataclass: `status`, `data`, `headers`. |

### Connector metadata (set by decorator)

After `@define_connector` is applied, the class has the following attributes:

| Attribute | Type | Description |
|---|---|---|
| `_connector_name` | `str` | Connector name. |
| `_connector_version` | `str` | Connector version. |
| `_connector_publisher` | `str` | Publisher identifier. |
| `_connector_trust` | `ConnectorTrust` | Trust tier. |
| `_connector_operations` | `list[str]` | Auto-discovered operation names. |
| `_connector_config_schema` | `type[BaseModel] \| None` | Optional Pydantic model for config validation. |

## License

MIT
