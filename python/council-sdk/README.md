# Council SDK for Python

> Official Python SDK for the [Council OS](https://meetcouncil.com) harness engineering platform.

## Installation

```bash
pip install council-sdk
```

With framework integrations:

```bash
pip install council-sdk[langchain]    # LangChain support
pip install council-sdk[llamaindex]   # LlamaIndex support
```

## Quick Start

```python
from council import Council

# Initialize (reads COUNCIL_API_KEY from environment)
client = Council()

# Or with explicit credentials
client = Council(api_key="ck_live_...", base_url="https://council.example.com")
```

### Authentication

```python
# Login with email/password
data = await client.login(email="user@example.com", password="secure_password")

# Or use API key / JWT token
client = Council(api_key="ck_live_...")
client = Council(jwt_token="eyJ...")

# From config file (~/.council/config.json)
client = Council.from_config(profile="staging")
```

### Agents

```python
from council.types import AgentCapability

# Register an agent
agent = await client.agents.register(
    workspace_id="ws_abc",
    name="ResearchBot",
    model="claude-3-opus",
    capabilities=[AgentCapability.WEB_SEARCH, AgentCapability.CODE_EXECUTION],
)

# List agents
async for agent in client.agents.list(workspace_id="ws_abc"):
    print(f"{agent.name}: {agent.status}")

# Execute an action
result = await client.agents.execute(
    agent.id,
    action="analyze",
    context={"query": "market trends"},
)

# Update / delete
await client.agents.update(agent.id, name="ResearchBot v2")
await client.agents.delete(agent.id)
```

### Jury Deliberation

```python
from council.types import RiskLevel, VerdictDecision

# Submit for deliberation
verdict = await client.jury.deliberate(
    action="deploy_to_production",
    context={"target": "api-server", "changes": ["db migration"]},
    risk_level=RiskLevel.HIGH,
)

print(verdict.decision)    # "approved"
print(verdict.confidence)  # 0.87
print(verdict.reasoning)

# Handle verdicts
match verdict.decision:
    case "approved":
        execute_deployment()
    case "denied":
        print(f"Denied: {verdict.reasoning}")
    case "escalated":
        await wait_for_human_review()

# Safe pattern (no exceptions)
result = await client.jury.deliberate_safe(
    action="deploy", context={}, risk_level="high",
)
if result.is_success:
    print(result.value.reasoning)
else:
    print(result.error)

# Streaming
async for update in client.jury.deliberate_stream(
    action="execute_trade",
    context={"symbol": "BTC", "amount_usd": 1_000_000},
    risk_level=RiskLevel.CRITICAL,
):
    match update.phase:
        case "started":
            print(f"Deliberation {update.deliberation_id} started")
        case "complete":
            print(f"Final: {update.verdict.decision}")
```

### Sandbox (Code Execution)

```python
from council.types import Runtime

result = await client.sandbox.execute(
    code='print("Hello, Council!")',
    runtime=Runtime.PYTHON,
    timeout_ms=5000,
)

print(result.stdout)       # "Hello, Council!"
print(result.exit_code)    # 0
```

### Audit Trail

```python
from council.types import ActionType

async for log in client.audit.query(
    agent_id="agent_abc123",
    action_type=ActionType.JURY_DELIBERATION,
    limit=100,
):
    print(f"{log.timestamp}: {log.action} -> {log.outcome}")

# Verify against blockchain
verification = await client.audit.verify(
    entry_id="log_abc",
    anchor_id="anchor_xyz",
)
print(verification.is_valid)
```

### Real-Time Streaming

```python
async with client.stream() as events:
    await events.subscribe("jury:*")
    await events.subscribe("agent:agent_abc123")

    async for event in events:
        print(f"{event.type}: {event.data}")
```

## Error Handling

```python
from council.errors import (
    AuthenticationError,
    JuryDeniedError,
    RateLimitError,
    ValidationError,
)

try:
    verdict = await client.jury.deliberate(...)
except AuthenticationError:
    client = Council(api_key=get_new_key())
except RateLimitError as e:
    await asyncio.sleep(e.retry_after)
except JuryDeniedError as e:
    print(f"Denied: {e.reasoning}")
except ValidationError as e:
    print(f"Invalid: {e.field} - {e.message}")
```

## Testing

```python
from council.testing import MockCouncil, MockVerdict

mock = MockCouncil()
mock.jury.set_response(MockVerdict(decision="approved", confidence=0.95))

verdict = await mock.jury.deliberate(action="deploy", context={})
assert verdict.decision == "approved"
assert mock.jury.deliberate.called
```

## LangChain Integration

```python
from council.integrations.langchain import CouncilApprovalTool

safe_tool = CouncilApprovalTool(
    tool=dangerous_tool,
    council_client=client,
    risk_level="high",
)
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
  },
  "staging": {
    "api_key": "ck_test_...",
    "base_url": "https://staging.council.example.com"
  }
}
```

## License

MIT
