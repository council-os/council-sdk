import { Transport } from "../transport.js";

export interface RegisterAgentInput {
  name: string;
  organizationId: string;
  agentClass: "DIGITAL" | "PHYSICAL" | "HYBRID";
  description?: string;
  digital?: { model: string; provider: string; runtime: string };
  physical?: {
    embodimentType: string;
    sensorManifest: any[];
    actuatorManifest: any[];
  };
  declaredCaps: string[];
  governanceProfileId: string;
  provenanceTrust: string;
  codeTrust: string;
  hardwareTrust?: string;
  networkTrust: string;
}

export interface ActionRequestInput {
  agentId: string;
  action: string;
  context: Record<string, unknown>;
}

export interface CreateDeploymentInput {
  agentId: string;
  mode: "PERSISTENT" | "SCHEDULED" | "ON_DEMAND";
  computeTarget: "MANAGED" | "EXTERNAL" | "EDGE";
  cloudSpec?: Record<string, unknown>;
  replicas?: number;
  schedule?: string;
  edgeNodeId?: string;
  externalEndpoint?: string;
}

export interface CreateFleetInput {
  name: string;
  organizationId: string;
  description?: string;
  templateId?: string;
  governanceProfileId: string;
}

/**
 * AGP Command operations — agent registration, governance actions,
 * deployments, fleets, and activity streams.
 *
 * @example
 * ```typescript
 * const agent = await client.command.registerAgent({
 *   name: 'Bot', organizationId: 'org_1', agentClass: 'DIGITAL',
 *   digital: { model: 'gpt-4', provider: 'openai', runtime: 'NODE' },
 *   declaredCaps: ['api.call'], governanceProfileId: 'gov_1',
 *   provenanceTrust: 'INTERNAL', codeTrust: 'AUDITED', networkTrust: 'VPN',
 * });
 * ```
 */
export class CommandNamespace {
  constructor(private transport: Transport) {}

  // ── Agent Registration ──────────────────────────────────────────────

  /**
   * Register a new agent in the AGP registry.
   */
  async registerAgent(input: RegisterAgentInput) {
    return this.transport.post("/agp/v1/agents/register", { json: input });
  }

  /**
   * Get an agent by ID.
   */
  async getAgent(agentId: string) {
    return this.transport.get(`/agp/v1/agents/${agentId}`);
  }

  /**
   * List agents, optionally filtered by organization.
   */
  async listAgents(organizationId?: string) {
    const params = organizationId
      ? `?organizationId=${organizationId}`
      : "";
    return this.transport.get(`/agp/v1/agents${params}`);
  }

  // ── Governance Actions ──────────────────────────────────────────────

  /**
   * Request a governed action on behalf of an agent.
   */
  async requestAction(input: ActionRequestInput) {
    return this.transport.post("/agp/v1/governance/action", {
      json: { ...input, protocolVersion: "agp/v1" },
    });
  }

  /**
   * Get governance events for an agent.
   */
  async getGovernanceEvents(agentId: string) {
    return this.transport.get(`/agp/v1/governance/events/${agentId}`);
  }

  // ── Deployments ─────────────────────────────────────────────────────

  /**
   * Create a new deployment for an agent.
   */
  async createDeployment(input: CreateDeploymentInput) {
    return this.transport.post("/agp/v1/deployments", { json: input });
  }

  /**
   * List deployments for an agent.
   */
  async listDeployments(agentId: string) {
    return this.transport.get(`/agp/v1/deployments/${agentId}`);
  }

  // ── Fleets ──────────────────────────────────────────────────────────

  /**
   * Create a new fleet.
   */
  async createFleet(input: CreateFleetInput) {
    return this.transport.post("/agp/v1/fleets", { json: input });
  }

  /**
   * List fleets, optionally filtered by organization.
   */
  async listFleets(organizationId?: string) {
    const params = organizationId
      ? `?organizationId=${organizationId}`
      : "";
    return this.transport.get(`/agp/v1/fleets${params}`);
  }

  // ── Activity ────────────────────────────────────────────────────────

  /**
   * Get the activity stream for an agent.
   */
  async getActivity(agentId: string) {
    return this.transport.get(`/agp/v1/activity/${agentId}`);
  }
}
