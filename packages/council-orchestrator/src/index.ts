/**
 * @council/orchestrator
 *
 * The governance layer for AI agents - Open source multi-agent orchestrator.
 *
 * This package provides the runtime for executing multi-agent workflows
 * with built-in governance protocols for voting, consensus, and critique.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { ScalableOrchestrator } from "@council/orchestrator";
 *
 * const orchestrator = new ScalableOrchestrator({
 *   invoker: myLLMInvoker,
 *   hooks: {
 *     persist: async (state) => await db.save(state),
 *     broadcast: async (id, msg) => await ws.emit(id, msg)
 *   }
 * });
 *
 * const sessionId = await orchestrator.startSession(
 *   "What is the meaning of life?",
 *   { agents: [philosopher, scientist, poet] }
 * );
 * ```
 *
 * @packageDocumentation
 */

// Core orchestrator
export {
  ScalableOrchestrator,
  buildTurnPipeline,
  createBroadcastTransition,
  createCostTrackingTransition,
  createPersistTransition,
  createSession,
} from "./orchestrator";

export type {
  OrchestratorConfig,
  OrchestratorEvent,
  OrchestratorEventHandler,
  OrchestratorHooks,
  SessionConfig,
  SessionCost,
  SessionMode,
  SessionState,
  SessionStatus,
} from "./orchestrator";

// Governance protocols
export {
  createConsensusProtocol,
  createCritiqueRound,
  createDelphiProtocol,
  createVotingRound,
} from "./protocols";

export type {
  ConsensusConfig,
  ConsensusState,
  CritiqueRoundConfig,
  CritiqueRoundState,
  DelphiConfig,
  DelphiState,
  VotingRoundConfig,
  VotingRoundState,
} from "./protocols";

// Re-export core protocol types for convenience
export {
  Result,
  StateMachine,
  adversarialDebate,
  buildConsensus,
  createAgentTransition,
  critiqueResponse,
  expertPanel,
  roundRobin,
} from "@council/protocol";

export type {
  AgentConfig,
  AgentInvoker,
  Critique,
  CritiqueResult,
  Message,
  StateTransition,
  Vote,
  VotingResult,
  WorkflowState,
} from "@council/protocol";

// Version
export const VERSION = "0.1.0";
