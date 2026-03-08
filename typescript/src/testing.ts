import type {
  Agent,
  CreateAgentOptions,
  DeliberateOptions,
  ExecuteAgentOptions,
  ExecuteCodeOptions,
  ExecutionResult,
  JurorVote,
  Result,
  UpdateAgentOptions,
  Verdict,
} from "./types.js";

// ── MockVerdict ───────────────────────────────────────────────────────────────

export class MockVerdict {
  decision: string;
  confidence: number;
  reasoning: string;
  votes: Array<{
    jurorRole: string;
    decision: string;
    confidence: number;
    reasoning: string;
  }>;
  conditions: string[];

  constructor(
    options: {
      decision?: string;
      confidence?: number;
      reasoning?: string;
      votes?: Array<{
        jurorRole: string;
        decision: string;
        confidence: number;
        reasoning: string;
      }>;
      conditions?: string[];
    } = {},
  ) {
    this.decision = options.decision ?? "approved";
    this.confidence = options.confidence ?? 0.95;
    this.reasoning = options.reasoning ?? "Test approval";
    this.votes = options.votes ?? [
      {
        jurorRole: "guardian",
        decision: this.decision,
        confidence: this.confidence,
        reasoning: this.reasoning,
      },
      {
        jurorRole: "advocate",
        decision: this.decision,
        confidence: this.confidence,
        reasoning: this.reasoning,
      },
    ];
    this.conditions = options.conditions ?? [];
  }

  toVerdict(): Verdict {
    return {
      id: "mock_delib_001",
      decision: this.decision,
      confidence: this.confidence,
      reasoning: this.reasoning,
      votes: this.votes as JurorVote[],
      conditions: this.conditions,
      deliberationRounds: 1,
    };
  }
}

// ── Mock Namespaces ───────────────────────────────────────────────────────────

export class MockJuryNamespace {
  private response: MockVerdict | null = null;
  public calls: Array<{ method: string; args: unknown[] }> = [];

  setResponse(response: MockVerdict): void {
    this.response = response;
  }

  async deliberate(options: DeliberateOptions): Promise<Verdict> {
    this.calls.push({ method: "deliberate", args: [options] });
    return (this.response ?? new MockVerdict()).toVerdict();
  }

  async deliberateSafe(
    options: DeliberateOptions,
  ): Promise<Result<Verdict, Error>> {
    this.calls.push({ method: "deliberateSafe", args: [options] });
    try {
      const verdict = await this.deliberate(options);
      return { ok: true, value: verdict };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  async submitCase(
    options: DeliberateOptions,
  ): Promise<Record<string, unknown>> {
    this.calls.push({ method: "submitCase", args: [options] });
    return { id: "mock_case_001", status: "pending" };
  }

  async stats(): Promise<Record<string, unknown>> {
    return {};
  }
}

export class MockAgentsNamespace {
  private agents = new Map<string, Agent>();
  public calls: Array<{ method: string; args: unknown[] }> = [];

  async register(options: CreateAgentOptions): Promise<Agent> {
    this.calls.push({ method: "register", args: [options] });
    const agent: Agent = {
      id: `agent_${this.agents.size + 1}`.padStart(10, "0"),
      name: options.name,
      status: "active",
      model: options.model,
      autonomyLevel: options.autonomyLevel ?? 3,
      capabilities: (options.capabilities ?? []) as string[],
      configuration: (options.configuration ?? {}) as Record<string, unknown>,
      metadata: (options.metadata ?? {}) as Record<string, unknown>,
      workspaceId: options.workspaceId,
    };
    this.agents.set(agent.id, agent);
    return agent;
  }

  async get(agentId: string): Promise<Agent> {
    this.calls.push({ method: "get", args: [agentId] });
    return (
      this.agents.get(agentId) ?? {
        id: agentId,
        name: "MockAgent",
        status: "idle",
        autonomyLevel: 3,
        capabilities: [],
        configuration: {},
        metadata: {},
      }
    );
  }

  async update(agentId: string, options: UpdateAgentOptions): Promise<Agent> {
    this.calls.push({ method: "update", args: [agentId, options] });
    const agent = this.agents.get(agentId) ?? {
      id: agentId,
      name: "MockAgent",
      status: "idle",
      autonomyLevel: 3,
      capabilities: [],
      configuration: {},
      metadata: {},
    };
    return { ...agent, ...options } as Agent;
  }

  async delete(agentId: string): Promise<void> {
    this.calls.push({ method: "delete", args: [agentId] });
    this.agents.delete(agentId);
  }

  async execute(
    agentId: string,
    options: ExecuteAgentOptions,
  ): Promise<Record<string, unknown>> {
    this.calls.push({ method: "execute", args: [agentId, options] });
    return { action: options.action, response: "mock_response" };
  }
}

export class MockSandboxNamespace {
  private response: ExecutionResult = {
    id: "exec_mock_001",
    stdout: "",
    stderr: "",
    exitCode: 0,
    executionTimeMs: 10,
    memoryUsedMb: 0,
  };
  public calls: Array<{ method: string; args: unknown[] }> = [];

  setResponse(options: {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
  }): void {
    this.response = {
      ...this.response,
      ...options,
    };
  }

  async execute(options: ExecuteCodeOptions): Promise<ExecutionResult> {
    this.calls.push({ method: "execute", args: [options] });
    return this.response;
  }
}

export class MockAuditNamespace {
  public calls: Array<{ method: string; args: unknown[] }> = [];

  async *query(): AsyncIterableIterator<never> {
    // Empty iterator
  }

  async verify(options: {
    entryId: string;
    anchorId: string;
  }): Promise<Record<string, unknown>> {
    this.calls.push({ method: "verify", args: [options] });
    return { isValid: true, onChainVerified: false };
  }
}

// ── MockCouncil ───────────────────────────────────────────────────────────────

/**
 * Mock Council client for testing.
 *
 * @example
 * ```typescript
 * import { MockCouncil, MockVerdict } from '@council/sdk/testing';
 *
 * const mock = new MockCouncil();
 * mock.jury.setResponse(new MockVerdict({ decision: 'approved' }));
 *
 * const verdict = await mock.jury.deliberate({ action: 'deploy', context: {} });
 * expect(verdict.decision).toBe('approved');
 * ```
 */
export class MockCouncil {
  public readonly agents = new MockAgentsNamespace();
  public readonly jury = new MockJuryNamespace();
  public readonly sandbox = new MockSandboxNamespace();
  public readonly audit = new MockAuditNamespace();

  async login(): Promise<Record<string, unknown>> {
    return { user: { id: "mock_user", email: "test@example.com" } };
  }

  async me(): Promise<Record<string, unknown>> {
    return { id: "mock_user", email: "test@example.com", name: "Test User" };
  }

  async logout(): Promise<void> {}
}
