# Council OS — SDKs & Developer Tools

> **Safely scaling intelligence.** SDKs and connector toolkits for the [Council OS](https://meetcouncil.com) harness engineering platform.

Council OS is the operating system for governed AI agents. These open-source SDKs let you interact with the platform programmatically — register agents, submit jury deliberations, query audit trails, stream real-time events, and build custom connectors that give agents new capabilities.

---

## Packages

| Package | Language | Description | Install |
|---------|----------|-------------|---------|
| [`@council/sdk`](./typescript) | TypeScript | Platform SDK — agents, jury, safety, audit, streaming | `npm install @council/sdk` |
| [`council-sdk`](./python/council-sdk) | Python | Platform SDK — agents, jury, safety, audit, streaming | `pip install council-sdk` |
| [`@council/connector-sdk`](./connector-typescript) | TypeScript | Build custom connectors for the Tool Router | `npm install @council/connector-sdk` |
| [`council-connector-sdk`](./connector-python) | Python | Build custom connectors for the Tool Router | `pip install council-connector-sdk` |
| [`@council/protocol`](./packages/council-protocol) | TypeScript | Agent orchestration primitives (composable pipelines) | `npm install @council/protocol` |
| [`@council/orchestrator`](./packages/council-orchestrator) | TypeScript | Governance layer with state machine runtime | `npm install @council/orchestrator` |
| [`council-robotics`](./python) | Python | Robotics SDK — robot identity, telemetry, ROS 2 bridge | `pip install council-robotics` |

## Quick Start

### TypeScript

```typescript
import { Council } from "@council/sdk";

const client = new Council({ apiKey: process.env.COUNCIL_API_KEY });

// Submit an action for jury deliberation
const verdict = await client.jury.deliberate({
  action: "deploy_to_production",
  context: { target: "api-server", changes: ["db migration"] },
  riskLevel: "high",
});

console.log(verdict.decision);  // "approved" | "denied" | "escalated"
console.log(verdict.confidence); // 0.87
```

### Python

```python
from council import Council

client = Council(api_key=os.environ["COUNCIL_API_KEY"])

verdict = await client.jury.deliberate(
    action="deploy_to_production",
    context={"target": "api-server"},
    risk_level="high",
)
print(verdict.decision)  # "approved"
```

### Build a Connector

```typescript
import { defineConnector, z } from "@council/connector-sdk";

export default defineConnector({
  name: "my-api",
  version: "1.0.0",
  publisher: "my-org",
  trust: "community",
  configSchema: z.object({ apiKey: z.string() }),
  operations: {
    search: {
      description: "Search my API",
      parameters: z.object({ query: z.string() }),
      returns: z.object({ results: z.array(z.string()) }),
      async handler(params, ctx) {
        const res = await ctx.http.get(
          `https://api.example.com/search?q=${params.query}`,
          { headers: { Authorization: `Bearer ${ctx.config.getRequired("apiKey")}` } },
        );
        return { results: res.data as string[] };
      },
    },
  },
});
```

## Documentation

Full documentation is available at [docs.meetcouncil.com](https://docs.meetcouncil.com).

- [Getting Started](https://docs.meetcouncil.com/docs/getting-started/quickstart)
- [SDK Reference (TypeScript)](https://docs.meetcouncil.com/docs/sdk/typescript)
- [SDK Reference (Python)](https://docs.meetcouncil.com/docs/sdk/python)
- [Connector Development](https://docs.meetcouncil.com/docs/connectors/building-connectors)
- [Safety Lattice](https://docs.meetcouncil.com/docs/platform/safety-lattice)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, coding standards, and PR guidelines.

## Security

If you discover a security vulnerability, please follow the process outlined in [SECURITY.md](./SECURITY.md). Do not open a public issue.

## License

MIT — see [LICENSE](./LICENSE).
