import { Transport } from "../transport.js";

/**
 * Containment protocol operations — cascade, replay, quarantine,
 * immune memory, and threat assessments.
 *
 * @example
 * ```typescript
 * // Initiate containment cascade
 * const snapshot = await client.containment.initiate({
 *   agentId: "agent_abc",
 *   reason: "Anomalous scope escalation",
 *   severity: "critical",
 * });
 *
 * // List active containments
 * const active = await client.containment.list();
 *
 * // Clear an agent from containment
 * await client.containment.clear(forensicId, agentId);
 *
 * // Start adversarial replay
 * const replay = await client.containment.replay(forensicId);
 *
 * // Quarantine an agent
 * await client.containment.quarantine(agentId, "Under investigation");
 *
 * // Release from quarantine
 * await client.containment.releaseQuarantine(agentId);
 *
 * // Get threat assessment
 * const assessment = await client.containment.assessThreat(agentId);
 *
 * // List known threat signatures
 * const sigs = await client.containment.threatSignatures();
 * ```
 */
export class ContainmentNamespace {
  constructor(private transport: Transport) {}

  // ── Containment Cascade ──────────────────────────────────────────────

  /**
   * Initiate a containment cascade for an adversarial agent.
   */
  async initiate(
    options: ContainmentInitiateOptions,
  ): Promise<ForensicSnapshot> {
    const resp = await this.transport.post(
      "/api/v1/containment/cascade",
      options,
    );
    return (resp.data ?? resp) as ForensicSnapshot;
  }

  /**
   * Get a specific containment record by forensic ID.
   */
  async get(forensicId: string): Promise<ForensicSnapshot> {
    const resp = await this.transport.get(
      `/api/v1/containment/cascade/${forensicId}`,
    );
    return (resp.data ?? resp) as ForensicSnapshot;
  }

  /**
   * List all active containments.
   */
  async list(): Promise<ForensicSnapshot[]> {
    const resp = await this.transport.get("/api/v1/containment/cascade");
    return (resp.data ?? resp) as ForensicSnapshot[];
  }

  /**
   * Clear an agent from containment (requires both jury + human approval).
   */
  async clear(forensicId: string, agentId: string): Promise<void> {
    await this.transport.post(
      `/api/v1/containment/cascade/${forensicId}/clear`,
      { agentId },
    );
  }

  // ── Adversarial Replay ───────────────────────────────────────────────

  /**
   * Start an adversarial replay of a contained agent's actions.
   */
  async replay(
    forensicId: string,
    options?: ReplayOptions,
  ): Promise<ReplayReport> {
    const resp = await this.transport.post(
      `/api/v1/containment/replay/${forensicId}`,
      options ?? {},
    );
    return (resp.data ?? resp) as ReplayReport;
  }

  /**
   * Get a replay report.
   */
  async getReplay(replayId: string): Promise<ReplayReport> {
    const resp = await this.transport.get(
      `/api/v1/containment/replay/${replayId}`,
    );
    return (resp.data ?? resp) as ReplayReport;
  }

  // ── Quarantine ───────────────────────────────────────────────────────

  /**
   * Place an agent into quarantine mode.
   */
  async quarantine(
    agentId: string,
    reason: string,
    config?: Partial<QuarantineConfig>,
  ): Promise<QuarantineRecord> {
    const resp = await this.transport.post(
      `/api/v1/containment/quarantine/${agentId}`,
      { reason, ...config },
    );
    return (resp.data ?? resp) as QuarantineRecord;
  }

  /**
   * Get quarantine record for an agent.
   */
  async getQuarantine(agentId: string): Promise<QuarantineRecord | null> {
    const resp = await this.transport.get(
      `/api/v1/containment/quarantine/${agentId}`,
    );
    return (resp.data ?? resp) as QuarantineRecord | null;
  }

  /**
   * List all currently quarantined agents.
   */
  async quarantineList(): Promise<QuarantineRecord[]> {
    const resp = await this.transport.get("/api/v1/containment/quarantine");
    return (resp.data ?? resp) as QuarantineRecord[];
  }

  /**
   * Approve quarantine release (human admin side).
   */
  async approveRelease(agentId: string): Promise<{ released: boolean }> {
    const resp = await this.transport.post(
      `/api/v1/containment/quarantine/${agentId}/release`,
      {},
    );
    return (resp.data ?? resp) as { released: boolean };
  }

  // ── Immune Memory / Threat Signatures ────────────────────────────────

  /**
   * Assess an agent against known threat signatures.
   */
  async assessThreat(agentId: string): Promise<ThreatAssessment> {
    const resp = await this.transport.get(
      `/api/v1/containment/threats/assess/${agentId}`,
    );
    return (resp.data ?? resp) as ThreatAssessment;
  }

  /**
   * List all active threat signatures.
   */
  async threatSignatures(): Promise<ThreatSignature[]> {
    const resp = await this.transport.get(
      "/api/v1/containment/threats/signatures",
    );
    return (resp.data ?? resp) as ThreatSignature[];
  }

  /**
   * Deactivate a threat signature.
   */
  async deactivateSignature(signatureId: string): Promise<void> {
    await this.transport.post(
      `/api/v1/containment/threats/signatures/${signatureId}/deactivate`,
      {},
    );
  }
}

// =============================================================================
// SDK types (mirror backend types)
// =============================================================================

export interface ContainmentInitiateOptions {
  agentId: string;
  reason: string;
  severity: "high" | "critical";
  evidence?: Record<string, unknown>;
}

export interface ForensicSnapshot {
  id: string;
  agentId: string;
  blastRadiusAgentIds: string[];
  status: string;
  containedAt: string;
  snapshotCompletedAt?: string;
  juryVerdictAt?: string;
  reportPushedAt?: string;
  juryVerdict?: {
    decision: string;
    confidence: number;
    reasoning: string;
  };
}

export interface ReplayOptions {
  maxActions?: number;
  actionTimeoutMs?: number;
  totalTimeoutMs?: number;
}

export interface ReplayReport {
  id: string;
  forensicId: string;
  agentId: string;
  status: string;
  summary: {
    totalActions: number;
    successfulActions: number;
    failedActions: number;
    divergentActions: number;
    averageAnomalyScore: number;
    maxAnomalyScore: number;
    suspiciousPatterns: string[];
  };
  startedAt: string;
  completedAt?: string;
}

export interface QuarantineConfig {
  allowedCommunicationTargets?: string[];
  actionRateLimit?: number;
  sandboxOnly?: boolean;
  requireJuryApproval?: boolean;
}

export interface QuarantineRecord {
  agentId: string;
  config: QuarantineConfig & { reason: string; quarantinedBy: string };
  startedAt: string;
  actionCount: number;
  blockedCount: number;
  juryApprovedRelease: boolean;
  humanApprovedRelease: boolean;
}

export interface ThreatAssessment {
  threatLevel: "none" | "low" | "medium" | "high" | "critical";
  score: number;
  matchedSignatures: Array<{
    signatureId: string;
    label: string;
    matchScore: number;
    matchedDimensions: string[];
  }>;
  assessedAt: string;
}

export interface ThreatSignature {
  id: string;
  label: string;
  createdAt: string;
  forensicId: string;
  confidence: number;
  matchCount: number;
  lastMatchedAt?: string;
  active: boolean;
}
