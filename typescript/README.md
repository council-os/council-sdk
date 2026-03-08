# @council/sdk

> Official TypeScript SDK for the [Council OS](https://meetcouncil.com) harness engineering platform.

## Installation

```bash
npm install @council/sdk
# or
yarn add @council/sdk
# or
pnpm add @council/sdk
```

## Quick Start

```typescript
import { Council } from "@council/sdk";

// Initialize (reads COUNCIL_API_KEY from environment)
const client = new Council();

// Or with explicit credentials
const client = new Council({
  apiKey: "ck_live_...",
  baseUrl: "https://council.example.com",
});
```

### Authentication

```typescript
// Login with email/password
const data = await client.login({
  email: "user@example.com",
  password: "secure",
});

// Or use API key / JWT token
const client = new Council({ apiKey: "ck_live_..." });
const client = new Council({ jwtToken: "eyJ..." });

// From config file (~/.council/config.json)
const client = await Council.fromConfig("staging");
```

### Agents

```typescript
import { AgentCapability } from "@council/sdk";

// Register
const agent = await client.agents.register({
  workspaceId: "ws_abc",
  name: "ResearchBot",
  model: "claude-3-opus",
  capabilities: [AgentCapability.WebSearch, AgentCapability.CodeExecution],
});

// List with async iteration
for await (const agent of client.agents.list({ workspaceId: "ws_abc" })) {
  console.log(`${agent.name}: ${agent.status}`);
}

// Execute
const result = await client.agents.execute(agent.id, {
  action: "analyze",
  context: { query: "market trends" },
});

// Update / delete
await client.agents.update(agent.id, { name: "ResearchBot v2" });
await client.agents.delete(agent.id);
```

### Jury Deliberation

```typescript
import { RiskLevel, VerdictDecision } from "@council/sdk";

// Deliberate
const verdict = await client.jury.deliberate({
  action: "deploy_to_production",
  context: { target: "api-server", changes: ["db migration"] },
  riskLevel: RiskLevel.High,
});

console.log(verdict.decision); // 'approved'
console.log(verdict.confidence); // 0.87

// Safe pattern (no exceptions)
const result = await client.jury.deliberateSafe({
  action: "deploy",
  context: {},
  riskLevel: "high",
});

if (result.ok) {
  console.log(result.value.reasoning);
} else {
  console.log(result.error.message);
}

// Streaming
for await (const update of client.jury.deliberateStream({
  action: "execute_trade",
  context: { symbol: "BTC", amountUsd: 1_000_000 },
  riskLevel: RiskLevel.Critical,
})) {
  switch (update.phase) {
    case "started":
      console.log(`Deliberation ${update.deliberationId} started`);
      break;
    case "complete":
      console.log(`Decision: ${update.verdict?.decision}`);
      break;
  }
}
```

### Sandbox (Code Execution)

```typescript
import { Runtime } from "@council/sdk";

const result = await client.sandbox.execute({
  code: 'console.log("Hello, Council!")',
  runtime: Runtime.Node,
  timeoutMs: 5000,
});

console.log(result.stdout); // "Hello, Council!"
console.log(result.exitCode); // 0
```

### Audit Trail

```typescript
import { ActionType } from "@council/sdk";

for await (const log of client.audit.query({
  agentId: "agent_abc123",
  actionType: ActionType.JuryDeliberation,
})) {
  console.log(`${log.timestamp}: ${log.action} -> ${log.outcome}`);
}

// Verify
const verification = await client.audit.verify({
  entryId: "log_abc",
  anchorId: "anchor_xyz",
});
console.log(verification.isValid);
```

### Real-Time Streaming

```typescript
const stream = client.stream();
await stream.connect();
await stream.subscribe("jury:*");

for await (const event of stream) {
  console.log(`${event.type}: ${JSON.stringify(event.data)}`);
}

await stream.close();
```

## Error Handling

```typescript
import {
  AuthenticationError,
  JuryDeniedError,
  RateLimitError,
  isCouncilError,
} from '@council/sdk';

try {
  const verdict = await client.jury.deliberate({ ... });
} catch (e) {
  if (e instanceof AuthenticationError) {
    // Re-authenticate
  } else if (e instanceof RateLimitError) {
    await sleep(e.retryAfter * 1000);
  } else if (e instanceof JuryDeniedError) {
    console.log(`Denied: ${e.reasoning}`);
  } else if (isCouncilError(e)) {
    console.log(`Error ${e.code}: ${e.message}`);
  }
}
```

## Testing

```typescript
import { MockCouncil, MockVerdict } from "@council/sdk/testing";

const mock = new MockCouncil();
mock.jury.setResponse(
  new MockVerdict({ decision: "approved", confidence: 0.95 }),
);

const verdict = await mock.jury.deliberate({ action: "deploy", context: {} });
expect(verdict.decision).toBe("approved");
expect(mock.jury.calls).toHaveLength(1);
```

## Vercel AI SDK Integration

```typescript
import { Council } from "@council/sdk";
import { withCouncilApproval } from "@council/sdk/integrations/vercel-ai";

const client = new Council();

const safeTool = withCouncilApproval(myTool, {
  client,
  riskLevel: "high",
  contextBuilder: ({ query }) => ({ query, source: "user" }),
});
```

## Configuration

### Environment Variables

| Variable            | Description                       |
| ------------------- | --------------------------------- |
| `COUNCIL_API_KEY`   | API key for authentication        |
| `COUNCIL_BASE_URL`  | Base URL of the Council API       |
| `COUNCIL_JWT_TOKEN` | JWT token for agent-to-agent auth |

### Config File (`~/.council/config.json`)

```json
{
  "default": {
    "api_key": "ck_live_...",
    "base_url": "https://council.example.com"
  }
}
```

## License

MIT
