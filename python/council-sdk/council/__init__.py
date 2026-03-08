"""Council SDK — Python client for the Council AI Governance Platform."""

from council.client import Council
from council.command import CommandNamespace
from council.errors import (
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
)
from council.safety import (
    CertVerificationResult,
    ComplianceReport,
    EmergencyHaltRecord,
    EmergencyHaltStatus,
    EscalationTicket,
    FederatedThreatSignature,
    GovernanceStats,
    GovernanceSummary,
    HaltLevel,
    MerkleInclusionProof,
    PublicKeyInfo,
    SafetyNamespace,
    SignedTreeHead,
    TrustCertificate,
    TrustDimensions,
    TrustRoot,
    WatchdogStatus,
)
from council.types import (
    ActionType,
    Agent,
    AgentCapability,
    AgentStatus,
    AuditLog,
    ExecutionResult,
    JurorRole,
    JurorVote,
    MerkleProof,
    RiskLevel,
    Runtime,
    Verdict,
    VerdictDecision,
    VerificationResult,
)

__all__ = [
    # Client
    "Council",
    # Errors
    "CouncilError",
    "AuthenticationError",
    "AuthorizationError",
    "ValidationError",
    "NotFoundError",
    "RateLimitError",
    "JuryDeniedError",
    "JuryTimeoutError",
    "SandboxError",
    "SandboxTimeoutError",
    "SandboxMemoryError",
    "NetworkError",
    # Types
    "Agent",
    "AgentStatus",
    "AgentCapability",
    "RiskLevel",
    "VerdictDecision",
    "JurorRole",
    "Runtime",
    "ActionType",
    "JurorVote",
    "Verdict",
    "ExecutionResult",
    "AuditLog",
    "MerkleProof",
    "VerificationResult",
    # Command (AGP)
    "CommandNamespace",
    # Safety
    "SafetyNamespace",
    "HaltLevel",
    "EmergencyHaltRecord",
    "EmergencyHaltStatus",
    "EscalationTicket",
    "WatchdogStatus",
    # Trust Certificates
    "TrustCertificate",
    "TrustDimensions",
    "GovernanceSummary",
    "MerkleInclusionProof",
    "SignedTreeHead",
    "CertVerificationResult",
    "PublicKeyInfo",
    # Federation
    "TrustRoot",
    "FederatedThreatSignature",
    # Compliance
    "GovernanceStats",
    "ComplianceReport",
]

__version__ = "1.0.0"
