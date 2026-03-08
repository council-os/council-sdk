import { describe, expect, it } from "vitest";
import { Council } from "../src/client.js";
import {
  AuthenticationError,
  CouncilError,
  JuryDeniedError,
  NotFoundError,
  RateLimitError,
  ValidationError,
  isCouncilError,
  raiseForStatus,
} from "../src/errors.js";
import { MockCouncil, MockVerdict } from "../src/testing.js";
import {
  AgentCapability,
  RiskLevel,
  Runtime,
  VerdictDecision,
} from "../src/types.js";

// ── Error Tests ─────────────────────────────────────────────────────────────

describe("Errors", () => {
  it("AuthenticationError extends CouncilError", () => {
    const err = new AuthenticationError("bad token");
    expect(err).toBeInstanceOf(CouncilError);
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("authentication_error");
  });

  it("raiseForStatus throws correct error for 404", () => {
    expect(() => raiseForStatus(404, { error: "Not found" })).toThrow(
      NotFoundError,
    );
  });

  it("raiseForStatus throws RateLimitError with retryAfter", () => {
    try {
      raiseForStatus(429, { error: "Rate limited", retry_after: 30 });
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      expect((e as RateLimitError).retryAfter).toBe(30);
    }
  });

  it("raiseForStatus throws ValidationError with field", () => {
    try {
      raiseForStatus(400, {
        error: { message: "Invalid", details: [{ field: "name" }] },
      });
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).field).toBe("name");
    }
  });

  it("JuryDeniedError has reasoning and votes", () => {
    const err = new JuryDeniedError("Denied", {
      reasoning: "Unsafe",
      votes: [{ juror: "guardian", decision: "denied" }],
    });
    expect(err.reasoning).toBe("Unsafe");
    expect(err.votes).toHaveLength(1);
  });

  it("isCouncilError type guard works", () => {
    expect(isCouncilError(new CouncilError("test"))).toBe(true);
    expect(isCouncilError(new Error("test"))).toBe(false);
    expect(isCouncilError("string")).toBe(false);
  });
});

// ── Mock Client Tests ─────────────────────────────────────────────────────────

describe("MockCouncil", () => {
  it("defaults to approved verdict", async () => {
    const mock = new MockCouncil();
    const verdict = await mock.jury.deliberate({ action: "test", context: {} });
    expect(verdict.decision).toBe("approved");
    expect(verdict.confidence).toBe(0.95);
  });

  it("uses custom verdict response", async () => {
    const mock = new MockCouncil();
    mock.jury.setResponse(
      new MockVerdict({
        decision: "denied",
        confidence: 0.8,
        reasoning: "Too risky",
      }),
    );
    const verdict = await mock.jury.deliberate({
      action: "deploy",
      context: {},
    });
    expect(verdict.decision).toBe("denied");
    expect(verdict.reasoning).toBe("Too risky");
  });

  it("tracks deliberate calls", async () => {
    const mock = new MockCouncil();
    await mock.jury.deliberate({
      action: "deploy",
      context: { target: "prod" },
    });
    expect(mock.jury.calls).toHaveLength(1);
    expect(mock.jury.calls[0].method).toBe("deliberate");
  });

  it("registers and retrieves agents", async () => {
    const mock = new MockCouncil();
    const agent = await mock.agents.register({
      workspaceId: "ws_1",
      name: "TestBot",
      model: "gpt-4",
    });
    expect(agent.name).toBe("TestBot");
    expect(agent.status).toBe("active");

    const fetched = await mock.agents.get(agent.id);
    expect(fetched.id).toBe(agent.id);
  });

  it("deletes agents", async () => {
    const mock = new MockCouncil();
    const agent = await mock.agents.register({
      workspaceId: "ws_1",
      name: "Bot",
    });
    await mock.agents.delete(agent.id);

    const result = await mock.agents.get(agent.id);
    expect(result.name).toBe("MockAgent"); // default after deletion
  });

  it("sandbox executes with custom response", async () => {
    const mock = new MockCouncil();
    mock.sandbox.setResponse({ stdout: "Hello", exitCode: 0 });
    const result = await mock.sandbox.execute({ code: "console.log('Hello')" });
    expect(result.stdout).toBe("Hello");
    expect(result.exitCode).toBe(0);
  });

  it("deliberateSafe returns Result", async () => {
    const mock = new MockCouncil();
    const result = await mock.jury.deliberateSafe({
      action: "test",
      context: {},
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.decision).toBe("approved");
    }
  });
});

// ── Enum Tests ────────────────────────────────────────────────────────────────

describe("Enums", () => {
  it("RiskLevel values", () => {
    expect(RiskLevel.High).toBe("high");
    expect(RiskLevel.Critical).toBe("critical");
  });

  it("VerdictDecision values", () => {
    expect(VerdictDecision.Approved).toBe("approved");
    expect(VerdictDecision.Denied).toBe("denied");
  });

  it("AgentCapability values", () => {
    expect(AgentCapability.WebSearch).toBe("web_search");
    expect(AgentCapability.CodeExecution).toBe("code_execution");
  });

  it("Runtime values", () => {
    expect(Runtime.Python).toBe("python");
    expect(Runtime.Node).toBe("node");
  });
});

// ── Client Construction Tests ──────────────────────────────────────────────────

describe("Council client", () => {
  it("constructs with defaults", () => {
    const client = new Council();
    expect(client).toBeDefined();
    expect(client.agents).toBeDefined();
    expect(client.jury).toBeDefined();
    expect(client.sandbox).toBeDefined();
    expect(client.audit).toBeDefined();
  });

  it("constructs with explicit options", () => {
    const client = new Council({
      apiKey: "test_key",
      baseUrl: "http://custom:9000",
    });
    expect(client).toBeDefined();
  });
});
