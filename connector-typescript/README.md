# @council/connector-sdk

> Build custom connectors for Council OS — give AI agents new capabilities through governed tool integrations.

Connectors are the integration layer between Council agents and external services. Each connector exposes a set of **operations** that agents can invoke through the Council Tool Router, with every call governed by the Safety Lattice.

## Installation

```bash
npm install @council/connector-sdk
```

Requires Node.js >= 18.

## Quick Example

A complete connector definition using `defineConnector`:

```typescript
import { defineConnector, z } from '@council/connector-sdk';

export default defineConnector({
  name: 'my-api',
  version: '1.0.0',
  publisher: 'my-org',
  trust: 'community',
  configSchema: z.object({ apiKey: z.string() }),
  operations: {
    get_data: {
      description: 'Fetches data from my API',
      parameters: z.object({ query: z.string() }),
      returns: z.object({ results: z.array(z.string()) }),
      async handler(params, ctx) {
        const resp = await ctx.http.get(`https://api.example.com/search?q=${params.query}`, {
          headers: { Authorization: `Bearer ${ctx.config.getRequired('apiKey')}` },
        });
        return { results: resp.data as string[] };
      },
    },
  },
});
```

Key points:

- **`defineConnector`** validates the connector structure at definition time (name, version, operations, schemas).
- **`z`** is re-exported from Zod so you don't need a separate dependency.
- Each operation declares its **parameters** and **returns** schemas. Council uses these for input validation and tool descriptions shown to agents.
- The **handler** receives validated params and a `ConnectorContext`.

## ConnectorContext

Every operation handler receives a `ctx` argument with the following:

| Property | Type | Description |
|---|---|---|
| `ctx.http` | `ConnectorHttpClient` | Audited HTTP client (`get`, `post`, `put`, `delete`, `request`). All requests are logged and rate-limited by Council. |
| `ctx.config` | `ConnectorConfigReader` | Credential reader scoped to the organization. `get(key)` returns `undefined` if missing; `getRequired(key)` throws. `getAll()` returns all config entries. |
| `ctx.log` | `ConnectorLogger` | Structured logger with `info`, `warn`, and `error` methods. Accepts an optional `data` object for structured metadata. |
| `ctx.agentId` | `string` | ID of the agent executing this operation. |
| `ctx.organizationId` | `string` | ID of the organization the agent belongs to. |

Connectors must use `ctx.http` instead of raw `fetch` or other HTTP libraries. This ensures all external requests are auditable and subject to rate limiting.

## Testing

The SDK ships a `createTestContext` utility for unit testing connectors without a running Council instance:

```typescript
import { createTestContext } from '@council/connector-sdk/testing';
import myConnector from './my-connector';

const ctx = createTestContext({
  config: { apiKey: 'test-key' },
  httpMock: {
    'https://api.example.com/*': { status: 200, body: { results: ['hello'] } },
  },
});

const result = await myConnector.operations.get_data.handler({ query: 'test' }, ctx);
expect(result.results).toEqual(['hello']);
expect(ctx.http.calls).toHaveLength(1);
```

### `createTestContext` options

| Option | Type | Default | Description |
|---|---|---|---|
| `config` | `Record<string, string>` | `{}` | Mock config entries returned by `ctx.config`. |
| `httpMock` | `Record<string, MockHttpRule>` | `{}` | URL pattern to response mapping. Patterns support trailing `*` wildcards. Unmatched URLs return 404. |
| `agentId` | `string` | `'test-agent'` | Mock agent ID. |
| `organizationId` | `string` | `'test-org'` | Mock organization ID. |

The test HTTP client records all calls in `ctx.http.calls`, so you can assert on request count, URLs, methods, headers, and bodies.

## Trust Levels

Every connector declares a **trust** level that determines its execution runtime and review requirements:

| Trust | Who publishes | Runtime | Review |
|---|---|---|---|
| `council` | Council team | Runs in-process with full access | Audited by Council |
| `verified` | Third-party, Council-reviewed | Sandboxed with network allowlist | Reviewed before listing |
| `community` | Anyone | Sandboxed, restricted network, resource limits | Community-moderated |

Trust is about the **connector runtime**, not agent permissions. An agent's ability to invoke a connector operation is still governed by role-based tool assignments and the Safety Lattice.

## API Reference

### Functions

| Export | Description |
|---|---|
| `defineConnector(definition)` | Validates and returns a `ConnectorDefinition`. Throws if name, version, or operations are missing or invalid. |
| `z` | Re-exported Zod instance for schema definitions. |

### Types

| Type | Description |
|---|---|
| `ConnectorDefinition` | Full connector shape: `name`, `version`, `publisher`, `trust`, `configSchema`, and `operations` map. |
| `ConnectorContext` | Context injected into every handler: `http`, `config`, `log`, `agentId`, `organizationId`. |
| `ConnectorOperation<TParams, TReturns>` | Single operation with `description`, `parameters` schema, `returns` schema, and `handler`. |
| `ConnectorTrust` | `'council' \| 'verified' \| 'community'` |
| `ConnectorManifest` | Registry-facing metadata extracted from a definition: `name`, `version`, `publisher`, `trust`, `operations` list, optional `networkAllowlist` and `timeout`. |
| `ConnectorHttpClient` | Audited HTTP client interface (`request`, `get`, `post`, `put`, `delete`). |
| `ConnectorConfigReader` | Config reader interface (`get`, `getRequired`, `getAll`). |
| `ConnectorLogger` | Logger interface (`info`, `warn`, `error`). |
| `HttpResponse` | Response shape: `status`, `data`, `headers`. |
| `HttpRequestOptions` | Request options: `headers`, `body`, `timeout`. |

### Testing exports (`@council/connector-sdk/testing`)

| Export | Description |
|---|---|
| `createTestContext(options?)` | Creates a mock `ConnectorContext` with test HTTP client and config reader. |
| `TestHttpClient` | HTTP client that records calls and matches URL patterns to mock responses. |

## License

MIT
