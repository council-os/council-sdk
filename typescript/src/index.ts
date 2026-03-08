// Main exports
export { Council } from "./client.js";

// Error classes
export {
  AuthenticationError,
  AuthorizationError,
  CouncilError,
  JuryDeniedError,
  JuryTimeoutError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  SandboxError,
  SandboxMemoryError,
  SandboxTimeoutError,
  ValidationError,
  isCouncilError,
} from "./errors.js";

// Types
export {
  ActionType,
  AgentCapability,
  // Enums
  AgentStatus,
  // Safety types
  HaltLevel,
  JurorRole,
  RiskLevel,
  Runtime,
  SessionMode,
  VerdictDecision,
  // Interfaces
  type AddTrustRootOptions,
  type Agent,
  type AgentAction,
  type Anchor,
  type AuditLog,
  type AuditQueryOptions,
  type Canvas,
  type ComplianceReport,
  type CostSummary,
  type CouncilOptions,
  type CreateAgentOptions,
  type DeliberateOptions,
  type DeliberationUpdate,
  type EmergencyHaltOptions,
  type EmergencyHaltRecord,
  type EmergencyHaltStatus,
  type EscalationDecision,
  type EscalationTicket,
  type ExecuteAgentOptions,
  type ExecuteCodeOptions,
  type ExecutionResult,
  type FederationThreatSignature,
  type GovernanceStats,
  type GovernanceSummary,
  type IssueTrustCertOptions,
  type JurorVote,
  type JuryCase,
  type MerkleInclusionProof,
  type MerkleProof,
  type PublicKeyInfo,
  type Result,
  type SignedTreeHead,
  type StreamEvent,
  type TrustCertificate,
  type TrustDimensions,
  type TrustRoot,
  type UpdateAgentOptions,
  type Verdict,
  type VerificationResult,
  type VerifyTrustCertResult,
  type WatchdogStatus,
  type Workspace,
} from "./types.js";

// Namespaces (for advanced usage)
export { AgentsNamespace } from "./namespaces/agents.js";
export { AuditNamespace } from "./namespaces/audit.js";
export { CommandNamespace } from "./namespaces/command.js";
export { JuryNamespace } from "./namespaces/jury.js";
export { SafetyNamespace } from "./namespaces/safety.js";
export { SandboxNamespace } from "./namespaces/sandbox.js";
export { EventStream } from "./namespaces/streaming.js";
