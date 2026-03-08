import { Transport } from "../transport.js";
import type {
  Agent,
  AgentAction,
  CostSummary,
  CreateAgentOptions,
  ExecuteAgentOptions,
  UpdateAgentOptions,
} from "../types.js";

/**
 * Agent registration and lifecycle management.
 */
export class AgentsNamespace {
  constructor(private transport: Transport) {}

  /**
   * Register a new agent in a workspace.
   */
  async register(options: CreateAgentOptions): Promise<Agent> {
    const body: Record<string, unknown> = {
      workspaceId: options.workspaceId,
      name: options.name,
    };
    if (options.model !== undefined) body.model = options.model;
    if (options.provider !== undefined) body.provider = options.provider;
    if (options.personality !== undefined)
      body.personality = options.personality;
    if (options.autonomyLevel !== undefined)
      body.autonomyLevel = options.autonomyLevel;
    if (options.capabilities !== undefined)
      body.capabilities = options.capabilities;
    if (options.configuration !== undefined)
      body.configuration = options.configuration;
    if (options.metadata !== undefined) body.metadata = options.metadata;

    const resp = await this.transport.post("/api/agents", { json: body });
    return parseAgent((resp.data ?? resp) as Record<string, unknown>);
  }

  /**
   * Get an agent by ID.
   */
  async get(agentId: string): Promise<Agent> {
    const resp = await this.transport.get(`/api/agents/${agentId}`);
    return parseAgent((resp.data ?? resp) as Record<string, unknown>);
  }

  /**
   * List agents with optional filters. Returns an async iterable.
   */
  async *list(
    options: {
      workspaceId?: string;
      status?: string;
      capability?: string;
      limit?: number;
    } = {},
  ): AsyncIterableIterator<Agent> {
    const params: Record<string, unknown> = {};
    if (options.workspaceId) params.workspaceId = options.workspaceId;
    if (options.status) params.status = options.status;

    const resp = await this.transport.get("/api/agents", { params });
    const data = resp.data;
    const agents = Array.isArray(data) ? data : [data];

    let count = 0;
    for (const item of agents) {
      const agent = parseAgent(item as Record<string, unknown>);

      if (
        options.capability &&
        !agent.capabilities.includes(options.capability)
      ) {
        continue;
      }

      yield agent;
      count++;
      if (options.limit && count >= options.limit) break;
    }
  }

  /**
   * Update an agent's configuration.
   */
  async update(agentId: string, options: UpdateAgentOptions): Promise<Agent> {
    const body: Record<string, unknown> = {};
    if (options.name !== undefined) body.name = options.name;
    if (options.model !== undefined) body.model = options.model;
    if (options.personality !== undefined)
      body.personality = options.personality;
    if (options.autonomyLevel !== undefined)
      body.autonomyLevel = options.autonomyLevel;
    if (options.capabilities !== undefined)
      body.capabilities = options.capabilities;
    if (options.configuration !== undefined)
      body.configuration = options.configuration;
    if (options.metadata !== undefined) body.metadata = options.metadata;
    if (options.status !== undefined) body.status = options.status;

    const resp = await this.transport.put(`/api/agents/${agentId}`, {
      json: body,
    });
    return parseAgent((resp.data ?? resp) as Record<string, unknown>);
  }

  /**
   * Permanently delete an agent.
   */
  async delete(agentId: string): Promise<void> {
    await this.transport.delete(`/api/agents/${agentId}`);
  }

  /**
   * Suspend an agent.
   */
  async suspend(
    agentId: string,
    options: { reason?: string } = {},
  ): Promise<Agent> {
    const body: Record<string, unknown> = { status: "suspended" };
    if (options.reason) {
      body.configuration = { suspend_reason: options.reason };
    }
    const resp = await this.transport.put(`/api/agents/${agentId}`, {
      json: body,
    });
    return parseAgent((resp.data ?? resp) as Record<string, unknown>);
  }

  /**
   * Reactivate a suspended agent.
   */
  async reactivate(agentId: string): Promise<Agent> {
    const resp = await this.transport.put(`/api/agents/${agentId}`, {
      json: { status: "active" },
    });
    return parseAgent((resp.data ?? resp) as Record<string, unknown>);
  }

  /**
   * Execute an action on an agent.
   */
  async execute(
    agentId: string,
    options: ExecuteAgentOptions,
  ): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = {
      action: options.action,
      context: options.context,
    };
    if (options.canvasId) body.canvasId = options.canvasId;
    if (options.systemPrompt) body.systemPrompt = options.systemPrompt;
    if (options.temperature !== undefined)
      body.temperature = options.temperature;
    if (options.maxTokens !== undefined) body.maxTokens = options.maxTokens;

    const resp = await this.transport.post(`/api/agents/${agentId}/execute`, {
      json: body,
    });
    return (resp.data ?? resp) as Record<string, unknown>;
  }

  /**
   * Get recent actions for an agent.
   */
  async getActions(
    agentId: string,
    options: { limit?: number } = {},
  ): Promise<AgentAction[]> {
    const resp = await this.transport.get(`/api/agents/${agentId}/actions`, {
      params: { limit: options.limit ?? 50 },
    });
    const data = resp.data;
    if (!Array.isArray(data)) return [];
    return data.map((item) => parseAction(item as Record<string, unknown>));
  }

  /**
   * Get the cost summary for an agent.
   */
  async getCost(agentId: string): Promise<CostSummary> {
    const resp = await this.transport.get(`/api/agents/${agentId}/cost`);
    const data = (resp.data ?? resp) as Record<string, unknown>;
    return {
      totalCost: (data.totalCost ?? data.total_cost ?? 0) as number,
      totalTokens: (data.totalTokens ?? data.total_tokens ?? 0) as number,
      actionCount: (data.actionCount ?? data.action_count ?? 0) as number,
      breakdown: (data.breakdown ?? {}) as Record<string, unknown>,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAgent(data: Record<string, unknown>): Agent {
  return {
    id: String(data.id ?? ""),
    name: String(data.name ?? ""),
    status: String(data.status ?? "idle"),
    model: data.model as string | undefined,
    provider: data.provider as string | undefined,
    personality: data.personality as string | undefined,
    autonomyLevel: (data.autonomyLevel ?? data.autonomy_level ?? 3) as number,
    capabilities: (data.capabilities ?? []) as string[],
    configuration: (data.configuration ?? {}) as Record<string, unknown>,
    metadata: (data.metadata ?? {}) as Record<string, unknown>,
    workspaceId: (data.workspaceId ?? data.workspace_id) as string | undefined,
    createdAt: data.createdAt ? new Date(data.createdAt as string) : undefined,
    updatedAt: data.updatedAt ? new Date(data.updatedAt as string) : undefined,
    apiKey: (data.apiKey ?? data.api_key) as string | undefined,
  };
}

function parseAction(data: Record<string, unknown>): AgentAction {
  return {
    id: String(data.id ?? ""),
    agentId: String(data.agentId ?? data.agent_id ?? ""),
    action: String(data.action ?? ""),
    context: (data.context ?? {}) as Record<string, unknown>,
    response: data.response as string | undefined,
    tokensUsed: (data.tokensUsed ?? data.tokens_used ?? 0) as number,
    cost: (data.cost ?? 0) as number,
    model: data.model as string | undefined,
    createdAt: data.createdAt ? new Date(data.createdAt as string) : undefined,
  };
}
