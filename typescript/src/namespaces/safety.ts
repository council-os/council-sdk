import { Transport } from "../transport.js";
import type {
  AddTrustRootOptions,
  ComplianceReport,
  EmergencyHaltOptions,
  EmergencyHaltRecord,
  EmergencyHaltStatus,
  EscalationDecision,
  EscalationTicket,
  FederationThreatSignature,
  GovernanceStats,
  IssueTrustCertOptions,
  PublicKeyInfo,
  TrustCertificate,
  TrustRoot,
  VerifyTrustCertResult,
  WatchdogStatus,
} from "../types.js";

/**
 * Emergency halt, escalation management, and watchdog controls.
 *
 * @example
 * ```typescript
 * // Halt a single agent
 * await client.safety.halt({ level: 1, agentId: "agent_abc", reason: "Anomalous behavior" });
 *
 * // Global halt (level 3)
 * await client.safety.halt({ level: 3, reason: "Critical safety violation" });
 *
 * // Check halt status
 * const status = await client.safety.status();
 *
 * // Lift a halt
 * await client.safety.liftHalt(haltId);
 *
 * // Review escalations
 * for await (const ticket of client.safety.escalations()) { ... }
 *
 * // Approve an escalation
 * await client.safety.approveEscalation(ticketId, { notes: "Verified safe" });
 *
 * // Acknowledge watchdog
 * await client.safety.acknowledgeWatchdog();
 * ```
 */
export class SafetyNamespace {
  constructor(private transport: Transport) {}

  // ── Emergency Halt ───────────────────────────────────────────────────

  /**
   * Trigger an emergency halt at the specified level.
   *
   * - **Level 1** — Suspend a single agent (requires `agentId`).
   * - **Level 2** — Halt an entire workspace (requires `workspaceId`).
   * - **Level 3** — Global halt across all workspaces.
   */
  async halt(options: EmergencyHaltOptions): Promise<EmergencyHaltRecord> {
    const body: Record<string, unknown> = {
      level: options.level,
      reason: options.reason,
    };
    if (options.agentId) body.agentId = options.agentId;
    if (options.workspaceId) body.workspaceId = options.workspaceId;

    const resp = await this.transport.post(`/api/v1/admin/halts`, {
      json: body,
    });
    return parseHaltRecord((resp.data ?? resp) as Record<string, unknown>);
  }

  /**
   * Lift an active halt by record ID.
   */
  async liftHalt(haltId: string): Promise<EmergencyHaltRecord> {
    const resp = await this.transport.post(
      `/api/v1/admin/halts/${haltId}/lift`,
      { json: {} },
    );
    return parseHaltRecord((resp.data ?? resp) as Record<string, unknown>);
  }

  /**
   * Get current halt status across the system.
   */
  async status(): Promise<EmergencyHaltStatus> {
    const resp = await this.transport.get(`/api/v1/admin/halts`);
    return (resp.data ?? resp) as EmergencyHaltStatus;
  }

  // ── Escalation Management ────────────────────────────────────────────

  /**
   * List escalation tickets with optional filters.
   */
  async *escalations(
    options: {
      status?: string;
      priority?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): AsyncIterableIterator<EscalationTicket> {
    const params: Record<string, unknown> = {};
    if (options.status) params.status = options.status;
    if (options.priority) params.priority = options.priority;
    if (options.limit) params.limit = options.limit;
    if (options.offset) params.offset = options.offset;

    const resp = await this.transport.get(`/api/v1/admin/escalations`, {
      params,
    });
    const data = (resp.data ?? resp) as Record<string, unknown>;
    const items = Array.isArray(data)
      ? data
      : Array.isArray((data as any).tickets)
        ? (data as any).tickets
        : [data];

    for (const item of items) {
      yield parseEscalation(item as Record<string, unknown>);
    }
  }

  /**
   * Get a single escalation ticket by ID (includes deliberation transcript).
   */
  async getEscalation(ticketId: string): Promise<EscalationTicket> {
    const resp = await this.transport.get(
      `/api/v1/admin/escalations/${ticketId}`,
    );
    return parseEscalation((resp.data ?? resp) as Record<string, unknown>);
  }

  /**
   * Approve an escalation ticket. Critical escalations require 2 approvals.
   */
  async approveEscalation(
    ticketId: string,
    options: EscalationDecision = {},
  ): Promise<EscalationTicket> {
    const body: Record<string, unknown> = {};
    if (options.notes) body.notes = options.notes;
    if (options.conditions) body.conditions = options.conditions;

    const resp = await this.transport.post(
      `/api/v1/admin/escalations/${ticketId}/approve`,
      { json: body },
    );
    return parseEscalation((resp.data ?? resp) as Record<string, unknown>);
  }

  /**
   * Deny an escalation ticket (reason is mandatory).
   */
  async denyEscalation(
    ticketId: string,
    reason: string,
  ): Promise<EscalationTicket> {
    const resp = await this.transport.post(
      `/api/v1/admin/escalations/${ticketId}/deny`,
      { json: { reason } },
    );
    return parseEscalation((resp.data ?? resp) as Record<string, unknown>);
  }

  // ── Watchdog ─────────────────────────────────────────────────────────

  /**
   * Acknowledge the dead-man's-switch watchdog to prevent automatic Level 2 halt.
   */
  async acknowledgeWatchdog(): Promise<WatchdogStatus> {
    const resp = await this.transport.post(`/api/v1/admin/watchdog/ack`, {
      json: {},
    });
    return (resp.data ?? resp) as WatchdogStatus;
  }

  // ── Trust Certificates ──────────────────────────────────────────────

  /**
   * Issue a trust certificate for an agent, attesting to its trust
   * dimensions and governance track record.
   */
  async issueTrustCert(
    options: IssueTrustCertOptions,
  ): Promise<TrustCertificate> {
    const resp = await this.transport.post(`/api/v1/safety/trust-certs`, {
      json: options as unknown as Record<string, unknown>,
    });
    return (resp.data ?? resp) as TrustCertificate;
  }

  /**
   * Get all trust certificates for an agent.
   */
  async getTrustCerts(agentId: string): Promise<TrustCertificate[]> {
    const resp = await this.transport.get(
      `/api/v1/safety/trust-certs/${agentId}`,
    );
    const data = resp.data ?? resp;
    return Array.isArray(data) ? data : (data as any).certificates ?? [];
  }

  /**
   * Verify a trust certificate's signature and merkle inclusion proof.
   */
  async verifyTrustCert(
    certificate: TrustCertificate,
  ): Promise<VerifyTrustCertResult> {
    const resp = await this.transport.post(
      `/api/v1/safety/trust-certs/verify`,
      { json: certificate as unknown as Record<string, unknown> },
    );
    return (resp.data ?? resp) as VerifyTrustCertResult;
  }

  /**
   * Get the organization's public key used for signing trust certificates.
   */
  async getPublicKey(): Promise<PublicKeyInfo> {
    const resp = await this.transport.get(
      `/api/v1/safety/trust-certs/public-key`,
    );
    return (resp.data ?? resp) as PublicKeyInfo;
  }

  // ── Federation ────────────────────────────────────────────────────────

  /**
   * List all trusted federation roots (other organizations).
   */
  async getTrustRoots(): Promise<TrustRoot[]> {
    const resp = await this.transport.get(
      `/api/v1/safety/federation/trust-roots`,
    );
    const data = resp.data ?? resp;
    return Array.isArray(data) ? data : (data as any).roots ?? [];
  }

  /**
   * Add a trust root for cross-org federation.
   */
  async addTrustRoot(options: AddTrustRootOptions): Promise<TrustRoot> {
    const resp = await this.transport.post(
      `/api/v1/safety/federation/trust-roots`,
      { json: options as unknown as Record<string, unknown> },
    );
    return (resp.data ?? resp) as TrustRoot;
  }

  /**
   * List shared threat signatures from federation partners.
   */
  async getThreatSignatures(
    category?: string,
  ): Promise<FederationThreatSignature[]> {
    const params: Record<string, unknown> = {};
    if (category) params.category = category;

    const resp = await this.transport.get(
      `/api/v1/safety/federation/signatures`,
      { params },
    );
    const data = resp.data ?? resp;
    return Array.isArray(data) ? data : (data as any).signatures ?? [];
  }

  // ── Compliance ────────────────────────────────────────────────────────

  /**
   * Get aggregate governance statistics.
   */
  async getGovernanceStats(): Promise<GovernanceStats> {
    const resp = await this.transport.get(`/api/v1/safety/compliance/stats`);
    return (resp.data ?? resp) as GovernanceStats;
  }

  /**
   * Generate a compliance report for a given time range.
   */
  async getComplianceReport(
    startMs: number,
    endMs: number,
  ): Promise<ComplianceReport> {
    const resp = await this.transport.get(`/api/v1/safety/compliance/report`, {
      params: { start: startMs, end: endMs },
    });
    return (resp.data ?? resp) as ComplianceReport;
  }
}

// ── Parsers ──────────────────────────────────────────────────────────────────

function parseHaltRecord(data: Record<string, unknown>): EmergencyHaltRecord {
  return {
    id: String(data.id ?? ""),
    level: Number(data.level ?? 0),
    reason: String(data.reason ?? ""),
    triggeredBy: String(data.triggeredBy ?? ""),
    active: Boolean(data.active),
    targetAgentId: data.targetAgentId as string | undefined,
    targetWorkspaceId: data.targetWorkspaceId as string | undefined,
    affectedAgentIds: Array.isArray(data.affectedAgentIds)
      ? data.affectedAgentIds.map(String)
      : [],
    liftedAt: data.liftedAt ? new Date(data.liftedAt as string) : undefined,
    liftedBy: data.liftedBy as string | undefined,
    createdAt: data.createdAt ? new Date(data.createdAt as string) : undefined,
  };
}

function parseEscalation(data: Record<string, unknown>): EscalationTicket {
  return {
    id: String(data.id ?? ""),
    agentId: String(data.agentId ?? ""),
    action: String(data.action ?? ""),
    riskLevel: String(data.riskLevel ?? ""),
    status: String(data.status ?? ""),
    priority: String(data.priority ?? ""),
    reason: String(data.reason ?? ""),
    context: (data.context as Record<string, unknown>) ?? {},
    deliberationTranscript: data.deliberationTranscript as string | undefined,
    dueBy: data.dueBy ? new Date(data.dueBy as string) : undefined,
    resolvedAt: data.resolvedAt
      ? new Date(data.resolvedAt as string)
      : undefined,
    resolvedBy: data.resolvedBy as string | undefined,
    approvals: Array.isArray(data.approvals) ? data.approvals : undefined,
    createdAt: data.createdAt ? new Date(data.createdAt as string) : undefined,
  };
}
