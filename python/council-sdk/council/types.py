"""Type definitions for the Council SDK."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Enums ──────────────────────────────────────────────────────────────────────


class AgentStatus(str, Enum):
    """Agent lifecycle status."""

    PENDING = "pending"
    ACTIVE = "active"
    IDLE = "idle"
    THINKING = "thinking"
    ERROR = "error"
    SUSPENDED = "suspended"


class AgentCapability(str, Enum):
    """Declared agent capabilities."""

    WEB_SEARCH = "web_search"
    CODE_EXECUTION = "code_execution"
    FILE_ACCESS = "file_access"
    DATABASE_ACCESS = "database_access"
    EXTERNAL_API = "external_api"


class RiskLevel(str, Enum):
    """Risk classification for jury deliberations."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class VerdictDecision(str, Enum):
    """Possible jury decisions."""

    APPROVED = "approved"
    DENIED = "denied"
    ESCALATED = "escalated"


class JurorRole(str, Enum):
    """Roles within a jury panel."""

    GUARDIAN = "guardian"
    ADVOCATE = "advocate"
    SKEPTIC = "skeptic"
    PRAGMATIST = "pragmatist"
    ARBITER = "arbiter"


class Runtime(str, Enum):
    """Sandbox execution runtimes."""

    PYTHON = "python"
    NODE = "node"
    BASH = "bash"
    DENO = "deno"


class ActionType(str, Enum):
    """Types of auditable actions."""

    AGENT_REGISTRATION = "agent_registration"
    AGENT_EXECUTION = "agent_execution"
    JURY_DELIBERATION = "jury_deliberation"
    CODE_EXECUTION = "code_execution"
    CONFIGURATION_CHANGE = "configuration_change"
    AUTH_EVENT = "auth_event"


class SessionMode(str, Enum):
    """Session modes."""

    LAB = "lab"
    ARENA = "arena"


# ── Agent Models ───────────────────────────────────────────────────────────────


class Agent(BaseModel):
    """Registered agent profile."""

    id: str
    name: str
    status: str = "idle"
    model: Optional[str] = None
    provider: Optional[str] = None
    personality: Optional[str] = None
    autonomy_level: int = 3
    capabilities: list[str] = Field(default_factory=list)
    configuration: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    workspace_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    api_key: Optional[str] = None  # Only returned on creation


class AgentAction(BaseModel):
    """Record of an agent action execution."""

    id: str
    agent_id: str
    action: str
    context: dict[str, Any] = Field(default_factory=dict)
    response: Optional[str] = None
    tokens_used: int = 0
    cost: float = 0.0
    model: Optional[str] = None
    created_at: Optional[datetime] = None


class CostSummary(BaseModel):
    """Agent cost summary."""

    total_cost: float = 0.0
    total_tokens: int = 0
    action_count: int = 0
    breakdown: dict[str, Any] = Field(default_factory=dict)


# ── Jury Models ────────────────────────────────────────────────────────────────


class JurorVote(BaseModel):
    """Individual juror vote in a deliberation."""

    juror_role: str
    decision: str
    confidence: float = 0.0
    reasoning: str = ""


class Verdict(BaseModel):
    """Final jury verdict."""

    id: str
    decision: str
    confidence: float = 0.0
    reasoning: str = ""
    votes: list[JurorVote] = Field(default_factory=list)
    conditions: list[str] = Field(default_factory=list)
    deliberation_rounds: int = 1
    created_at: Optional[datetime] = None


class DeliberationUpdate(BaseModel):
    """Streaming update during jury deliberation."""

    phase: str
    deliberation_id: Optional[str] = None
    votes_collected: Optional[int] = None
    votes_needed: Optional[int] = None
    juror_role: Optional[str] = None
    decision: Optional[str] = None
    current_speaker: Optional[str] = None
    round: Optional[int] = None
    verdict: Optional[Verdict] = None


class JuryCase(BaseModel):
    """A submitted jury case."""

    id: str
    case_id: Optional[str] = None
    status: str = "pending"
    action: Optional[str] = None
    context: dict[str, Any] = Field(default_factory=dict)
    risk_level: Optional[str] = None
    deliberation: Optional[dict[str, Any]] = None
    created_at: Optional[datetime] = None


# ── Sandbox Models ─────────────────────────────────────────────────────────────


class ExecutionResult(BaseModel):
    """Result of sandboxed code execution."""

    id: str = ""
    stdout: str = ""
    stderr: str = ""
    exit_code: int = 0
    execution_time_ms: int = 0
    memory_used_mb: float = 0.0
    created_at: Optional[datetime] = None


# ── Audit Models ───────────────────────────────────────────────────────────────


class AuditLog(BaseModel):
    """Audit trail entry."""

    id: str
    user_id: Optional[str] = None
    agent_id: Optional[str] = None
    action: str
    resource: Optional[str] = None
    resource_id: Optional[str] = None
    outcome: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    timestamp: Optional[datetime] = None
    anchor_id: Optional[str] = None


class MerkleProof(BaseModel):
    """Merkle proof for blockchain verification."""

    leaf: str
    root: str
    siblings: list[dict[str, str]] = Field(default_factory=list)


class VerificationResult(BaseModel):
    """Result of audit entry verification."""

    is_valid: bool = False
    merkle_proof: Optional[MerkleProof] = None
    on_chain_verified: bool = False
    block_number: Optional[int] = None
    tx_hash: Optional[str] = None


class Anchor(BaseModel):
    """Blockchain anchor record."""

    id: str
    merkle_root: Optional[str] = None
    leaf_count: int = 0
    status: str = "pending"
    block_number: Optional[int] = None
    tx_hash: Optional[str] = None
    submitted_at: Optional[datetime] = None
    confirmed_at: Optional[datetime] = None


# ── Session Models ─────────────────────────────────────────────────────────────


class SessionAgentConfig(BaseModel):
    """Agent configuration for a session."""

    id: str
    name: str
    role: str
    model: str
    model_name: str
    system_prompt: Optional[str] = None


class Session(BaseModel):
    """Multi-agent deliberation session."""

    id: str
    topic: str
    mode: str = "lab"
    status: str = "pending"
    owner_id: Optional[str] = None
    agent_count: int = 0
    turn_count: int = 0
    message_count: int = 0
    created_at: Optional[datetime] = None


# ── Workspace / Canvas Models ─────────────────────────────────────────────────


class Workspace(BaseModel):
    """A Council workspace."""

    id: str
    name: str
    description: Optional[str] = None
    owner_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class Canvas(BaseModel):
    """A canvas within a workspace."""

    id: str
    workspace_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    data: Optional[dict[str, Any]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ── Result Pattern ─────────────────────────────────────────────────────────────


class Result(BaseModel):
    """Result wrapper for the safe pattern (no exceptions)."""

    ok: bool = True
    value: Any = None
    error: Any = None

    @property
    def is_success(self) -> bool:
        return self.ok

    @classmethod
    def success(cls, value: Any) -> "Result":
        return cls(ok=True, value=value, error=None)

    @classmethod
    def failure(cls, error: Any) -> "Result":
        return cls(ok=False, value=None, error=error)


# ── Streaming Event ────────────────────────────────────────────────────────────


class StreamEvent(BaseModel):
    """Real-time event from WebSocket stream."""

    type: str
    data: dict[str, Any] = Field(default_factory=dict)
    timestamp: Optional[datetime] = None
