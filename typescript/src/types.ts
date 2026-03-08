// ── Enums ─────────────────────────────────────────────────────────────────────

export enum AgentStatus {
  Pending = "pending",
  Active = "active",
  Idle = "idle",
  Thinking = "thinking",
  Error = "error",
  Suspended = "suspended",
}

export enum AgentCapability {
  WebSearch = "web_search",
  CodeExecution = "code_execution",
  FileAccess = "file_access",
  DatabaseAccess = "database_access",
  ExternalApi = "external_api",
}

export enum RiskLevel {
  Low = "low",
  Medium = "medium",
  High = "high",
  Critical = "critical",
}

export enum VerdictDecision {
  Approved = "approved",
  Denied = "denied",
  Escalated = "escalated",
}

export enum JurorRole {
  Guardian = "guardian",
  Advocate = "advocate",
  Skeptic = "skeptic",
  Pragmatist = "pragmatist",
  Arbiter = "arbiter",
}

export enum Runtime {
  Python = "python",
  Node = "node",
  Bash = "bash",
  Deno = "deno",
}

export enum ActionType {
  AgentRegistration = "agent_registration",
  AgentExecution = "agent_execution",
  JuryDeliberation = "jury_deliberation",
  CodeExecution = "code_execution",
  ConfigurationChange = "configuration_change",
  AuthEvent = "auth_event",
}

export enum SessionMode {
  Lab = "lab",
  Arena = "arena",
}

// ── Agent Types ───────────────────────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  status: string;
  model?: string;
  provider?: string;
  personality?: string;
  autonomyLevel: number;
  capabilities: string[];
  configuration: Record<string, unknown>;
  metadata: Record<string, unknown>;
  workspaceId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  apiKey?: string;
}

export interface CreateAgentOptions {
  workspaceId: string;
  name: string;
  model?: string;
  provider?: string;
  personality?: string;
  autonomyLevel?: number;
  capabilities?: (string | AgentCapability)[];
  configuration?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateAgentOptions {
  name?: string;
  model?: string;
  personality?: string;
  autonomyLevel?: number;
  capabilities?: (string | AgentCapability)[];
  configuration?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  status?: string;
}

export interface ExecuteAgentOptions {
  action: string;
  context: Record<string, unknown>;
  canvasId?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentAction {
  id: string;
  agentId: string;
  action: string;
  context: Record<string, unknown>;
  response?: string;
  tokensUsed: number;
  cost: number;
  model?: string;
  createdAt?: Date;
}

export interface CostSummary {
  totalCost: number;
  totalTokens: number;
  actionCount: number;
  breakdown: Record<string, unknown>;
}

// ── Jury Types ────────────────────────────────────────────────────────────────

export interface JurorVote {
  jurorRole: string;
  decision: string;
  confidence: number;
  reasoning: string;
}

export interface Verdict {
  id: string;
  decision: string;
  confidence: number;
  reasoning: string;
  votes: JurorVote[];
  conditions: string[];
  deliberationRounds: number;
  createdAt?: Date;
}

export interface DeliberateOptions {
  action: string;
  context: Record<string, unknown>;
  riskLevel?: string | RiskLevel;
  agentId?: string;
}

export interface DeliberationUpdate {
  phase: string;
  deliberationId?: string;
  votesCollected?: number;
  votesNeeded?: number;
  jurorRole?: string;
  decision?: string;
  currentSpeaker?: string;
  round?: number;
  verdict?: Verdict;
}

export interface JuryCase {
  id: string;
  caseId?: string;
  status: string;
  action?: string;
  context: Record<string, unknown>;
  riskLevel?: string;
  deliberation?: Record<string, unknown>;
  createdAt?: Date;
}

// ── Sandbox Types ─────────────────────────────────────────────────────────────

export interface ExecuteCodeOptions {
  code: string;
  runtime?: string | Runtime;
  timeoutMs?: number;
  memoryMb?: number;
  files?: Record<string, string>;
  env?: Record<string, string>;
  agentId?: string;
}

export interface ExecutionResult {
  id: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTimeMs: number;
  memoryUsedMb: number;
  createdAt?: Date;
}

// ── Audit Types ───────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  userId?: string;
  agentId?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  outcome?: string;
  metadata: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp?: Date;
  anchorId?: string;
}

export interface AuditQueryOptions {
  agentId?: string;
  userId?: string;
  actionType?: string | ActionType;
  resource?: string;
  outcome?: string;
  since?: Date;
  until?: Date;
  limit?: number;
}

export interface MerkleProof {
  leaf: string;
  root: string;
  siblings: Array<{ hash: string; position: "left" | "right" }>;
}

export interface VerificationResult {
  isValid: boolean;
  merkleProof: MerkleProof | null;
  onChainVerified: boolean;
  blockNumber: number | null;
  txHash: string | null;
}

export interface Anchor {
  id: string;
  merkleRoot?: string;
  leafCount: number;
  status: string;
  blockNumber?: number;
  txHash?: string;
  submittedAt?: Date;
  confirmedAt?: Date;
}

// ── Workspace / Canvas Types ──────────────────────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  ownerId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Canvas {
  id: string;
  workspaceId?: string;
  name: string;
  description?: string;
  data?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

// ── Result Pattern ────────────────────────────────────────────────────────────

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// ── Streaming ─────────────────────────────────────────────────────────────────

export interface StreamEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp?: Date;
}

// ── Client Options ────────────────────────────────────────────────────────────

export interface CouncilOptions {
  apiKey?: string;
  jwtToken?: string;
  baseUrl?: string;
  timeout?: number;
  fetch?: typeof globalThis.fetch;
}

// ── Safety / Emergency Halt ──────────────────────────────────────────────────

export enum HaltLevel {
  Agent = 1,
  Workspace = 2,
  Global = 3,
}

export interface EmergencyHaltOptions {
  /** 1 = agent, 2 = workspace, 3 = global */
  level: HaltLevel | 1 | 2 | 3;
  reason: string;
  /** Required when level = 1 */
  agentId?: string;
  /** Required when level = 2 */
  workspaceId?: string;
}

export interface EmergencyHaltRecord {
  id: string;
  level: number;
  reason: string;
  triggeredBy: string;
  active: boolean;
  targetAgentId?: string;
  targetWorkspaceId?: string;
  affectedAgentIds: string[];
  liftedAt?: Date;
  liftedBy?: string;
  createdAt?: Date;
}

export interface EmergencyHaltStatus {
  globalHaltActive: boolean;
  activeHalts: EmergencyHaltRecord[];
  totalActive: number;
}

// ── Escalations ──────────────────────────────────────────────────────────────

export interface EscalationTicket {
  id: string;
  agentId: string;
  action: string;
  riskLevel: string;
  status: string;
  priority: string;
  reason: string;
  context: Record<string, unknown>;
  deliberationTranscript?: string;
  dueBy?: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  approvals?: unknown[];
  createdAt?: Date;
}

export interface EscalationDecision {
  notes?: string;
  conditions?: string[];
}

// ── Watchdog ─────────────────────────────────────────────────────────────────

export interface WatchdogStatus {
  enabled: boolean;
  active: boolean;
  lastAcknowledgedAt?: string;
  timeRemainingMs?: number;
  overdue: boolean;
}

// ── Trust Certificates ──────────────────────────────────────────────────────

export interface TrustDimensions {
  provenance: number;
  code: number;
  hardware: number;
  network: number;
  behavioral: number;
}

export interface GovernanceSummary {
  totalActions: number;
  autoApproved: number;
  juryReviewed: number;
  denied: number;
  halts: number;
}

export interface MerkleInclusionProof {
  leaf: string;
  root: string;
  index: number;
  siblings: string[];
}

export interface SignedTreeHead {
  treeSize: number;
  rootHash: string;
  signature: string;
  timestamp: string;
}

export interface TrustCertificate {
  id: string;
  agentId: string;
  orgId: string;
  trustDimensions: TrustDimensions;
  compositeTrust: number;
  governanceSummary: GovernanceSummary;
  issuedAt: string;
  expiresAt: string;
  signature: string;
  merkleProof?: MerkleInclusionProof;
  signedTreeHead?: SignedTreeHead;
}

export interface IssueTrustCertOptions {
  agentId: string;
  orgId: string;
  trustDimensions: TrustDimensions;
  governanceSummary: GovernanceSummary;
  validityHours?: number;
}

export interface VerifyTrustCertResult {
  valid: boolean;
  reason?: string;
}

export interface PublicKeyInfo {
  publicKey: string;
  algorithm: string;
}

// ── Federation ──────────────────────────────────────────────────────────────

export interface TrustRoot {
  id: string;
  orgId: string;
  publicKey: string;
  label: string;
  addedAt: string;
}

export interface AddTrustRootOptions {
  orgId: string;
  publicKey: string;
  label: string;
}

export interface FederationThreatSignature {
  id: string;
  category: string;
  pattern: string;
  severity: string;
  sourceOrgId: string;
  createdAt: string;
}

// ── Compliance ──────────────────────────────────────────────────────────────

export interface GovernanceStats {
  totalActions: number;
  autoApproved: number;
  juryReviewed: number;
  denied: number;
  halts: number;
  escalations: number;
  averageTrust: number;
}

export interface ComplianceReport {
  startMs: number;
  endMs: number;
  stats: GovernanceStats;
  trustDistribution: Record<string, number>;
  topViolations: Array<{
    type: string;
    count: number;
    severity: string;
  }>;
  generatedAt: string;
}
