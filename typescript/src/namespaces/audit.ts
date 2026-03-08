import { Transport } from "../transport.js";
import type {
  Anchor,
  AuditLog,
  AuditQueryOptions,
  MerkleProof,
  VerificationResult,
} from "../types.js";

/**
 * Audit namespace — query audit logs and verify blockchain anchors.
 */
export class AuditNamespace {
  constructor(private transport: Transport) {}

  /**
   * Query audit logs with optional filters.
   */
  async *query(
    options: AuditQueryOptions = {},
  ): AsyncIterableIterator<AuditLog> {
    const params: Record<string, unknown> = { limit: options.limit ?? 100 };
    if (options.agentId) params.agentId = options.agentId;
    if (options.userId) params.userId = options.userId;
    if (options.actionType) params.actionType = options.actionType;
    if (options.resource) params.resource = options.resource;
    if (options.outcome) params.outcome = options.outcome;
    if (options.since) params.since = options.since.toISOString();
    if (options.until) params.until = options.until.toISOString();

    const resp = await this.transport.get("/api/audit/logs", { params });
    const data = resp.data;
    const items = Array.isArray(data) ? data : [data];

    for (const item of items) {
      yield parseAuditLog(item as Record<string, unknown>);
    }
  }

  /**
   * Get a single audit log entry by ID.
   */
  async get(entryId: string): Promise<AuditLog> {
    const resp = await this.transport.get(`/api/audit/logs/${entryId}`);
    return parseAuditLog((resp.data ?? resp) as Record<string, unknown>);
  }

  /**
   * Verify an audit entry against a blockchain anchor.
   */
  async verify(options: {
    entryId: string;
    anchorId: string;
  }): Promise<VerificationResult> {
    const resp = await this.transport.post("/api/audit/verify", {
      json: { entryId: options.entryId, anchorId: options.anchorId },
    });
    const data = (resp.data ?? resp) as Record<string, unknown>;
    return parseVerification(data);
  }

  /**
   * Get details of a blockchain anchor.
   */
  async getAnchor(anchorId: string): Promise<Anchor> {
    const resp = await this.transport.get(`/api/audit/anchors/${anchorId}`);
    return parseAnchor((resp.data ?? resp) as Record<string, unknown>);
  }

  /**
   * List blockchain anchors.
   */
  async *listAnchors(
    options: {
      status?: string;
      since?: Date;
      limit?: number;
    } = {},
  ): AsyncIterableIterator<Anchor> {
    const params: Record<string, unknown> = { limit: options.limit ?? 50 };
    if (options.status) params.status = options.status;
    if (options.since) params.since = options.since.toISOString();

    const resp = await this.transport.get("/api/audit/anchors", { params });
    const data = resp.data;
    const items = Array.isArray(data) ? data : [data];

    for (const item of items) {
      yield parseAnchor(item as Record<string, unknown>);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAuditLog(data: Record<string, unknown>): AuditLog {
  return {
    id: String(data.id ?? ""),
    userId: (data.userId ?? data.user_id) as string | undefined,
    agentId: (data.agentId ?? data.agent_id) as string | undefined,
    action: String(data.action ?? ""),
    resource: data.resource as string | undefined,
    resourceId: (data.resourceId ?? data.resource_id) as string | undefined,
    outcome: data.outcome as string | undefined,
    metadata: (data.metadata ?? {}) as Record<string, unknown>,
    ipAddress: (data.ipAddress ?? data.ip_address) as string | undefined,
    userAgent: (data.userAgent ?? data.user_agent) as string | undefined,
    timestamp: data.timestamp
      ? new Date(data.timestamp as string)
      : data.createdAt
        ? new Date(data.createdAt as string)
        : undefined,
    anchorId: (data.anchorId ?? data.anchor_id) as string | undefined,
  };
}

function parseVerification(data: Record<string, unknown>): VerificationResult {
  const proofData = (data.merkleProof ?? data.merkle_proof) as Record<
    string,
    unknown
  > | null;
  let proof: MerkleProof | null = null;

  if (proofData) {
    proof = {
      leaf: String(proofData.leaf ?? ""),
      root: String(proofData.root ?? ""),
      siblings: (proofData.siblings ?? []) as Array<{
        hash: string;
        position: "left" | "right";
      }>,
    };
  }

  return {
    isValid: Boolean(data.isValid ?? data.is_valid ?? false),
    merkleProof: proof,
    onChainVerified: Boolean(
      data.onChainVerified ?? data.on_chain_verified ?? false,
    ),
    blockNumber: (data.blockNumber ?? data.block_number ?? null) as
      | number
      | null,
    txHash: (data.txHash ?? data.tx_hash ?? null) as string | null,
  };
}

function parseAnchor(data: Record<string, unknown>): Anchor {
  return {
    id: String(data.id ?? ""),
    merkleRoot: (data.merkleRoot ?? data.merkle_root) as string | undefined,
    leafCount: (data.leafCount ?? data.leaf_count ?? 0) as number,
    status: String(data.status ?? "pending"),
    blockNumber: (data.blockNumber ?? data.block_number) as number | undefined,
    txHash: (data.txHash ?? data.tx_hash) as string | undefined,
    submittedAt: data.submittedAt
      ? new Date(data.submittedAt as string)
      : undefined,
    confirmedAt: data.confirmedAt
      ? new Date(data.confirmedAt as string)
      : undefined,
  };
}
