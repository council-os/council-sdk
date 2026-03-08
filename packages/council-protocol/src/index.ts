/**
 * @council/protocol
 *
 * Category Theory-based protocol for multi-agent AI orchestration and governance.
 *
 * This package provides the foundational primitives for building composable,
 * type-safe multi-agent workflows with built-in governance capabilities.
 *
 * ## Core Concepts
 *
 * - **Result Monad**: Error handling without exceptions
 * - **StateTransition**: Composable async state transformations
 * - **StateMachine**: Category-theoretic composition (identity + compose)
 * - **Monoid**: Aggregation patterns for traces and logs
 *
 * ## Quick Start
 *
 * ```typescript
 * import {
 *   Result,
 *   StateMachine,
 *   createAgentTransition,
 *   roundRobin,
 *   buildConsensus
 * } from "@council/protocol";
 *
 * // Define agents
 * const critic: AgentConfig = {
 *   id: "critic",
 *   name: "The Critic",
 *   role: "critic",
 *   model: "gpt-4"
 * };
 *
 * const synthesizer: AgentConfig = {
 *   id: "synthesizer",
 *   name: "The Synthesizer",
 *   role: "synthesizer",
 *   model: "claude-3-opus"
 * };
 *
 * // Create a multi-agent pipeline
 * const pipeline = StateMachine.compose(
 *   createAgentTransition(critic, invoker),
 *   createAgentTransition(synthesizer, invoker),
 *   persistState,
 *   broadcastUpdate
 * );
 *
 * // Execute
 * const result = await pipeline(initialState);
 * if (result.ok) {
 *   console.log("Final state:", result.value);
 * } else {
 *   console.error("Error:", result.error);
 * }
 * ```
 *
 * ## Composition Patterns
 *
 * The package includes several pre-built composition patterns:
 *
 * - `roundRobin`: Agents take turns in order
 * - `critiqueResponse`: Propose → Critique → Revise loop
 * - `buildConsensus`: Vote → Synthesize agreement
 * - `expertPanel`: Multiple specialists → Chair summary
 * - `adversarialDebate`: Pro vs Con → Judge verdict
 * - `chainOfThoughtVerified`: Think → Verify each step
 *
 * ## Governance
 *
 * Import governance primitives from the governance submodule:
 *
 * ```typescript
 * import {
 *   tallyVotes,
 *   parseVote,
 *   aggregateCritiques,
 *   collectVotes,
 *   announceConsensus
 * } from "@council/protocol/governance";
 * ```
 *
 * ## External Framework Adapters
 *
 * Connect Council to other agent frameworks:
 *
 * ```typescript
 * import {
 *   createLangChainLLMInvoker,
 *   createCrewAICrewTransition
 * } from "@council/protocol/adapters";
 * ```
 *
 * @packageDocumentation
 */

// Core exports
export {
  // Monoids
  ArrayMonoid,
  ProductMonoid,
  // Result monad
  Result,
  // State machine composition
  StateMachine,
  StringMonoid,
  SumMonoid,
  // TOON encoding
  TOON,
  adversarialDebate,
  buildConsensus,
  chainOfThoughtVerified,
  // Composition patterns
  createAgentTransition,
  critiqueResponse,
  expertPanel,
  foldMonoid,
  roundRobin,
} from "./core";

// Core types
export type {
  AgentConfig,
  AgentInvoker,
  AgentResponse,
  AgentTransitionFactory,
  Functor,
  Message,
  Monoid,
  StateTransition,
  WorkflowState,
} from "./core";

// Convenience re-exports of governance and adapters at top level
// Users can also import from submodules for tree-shaking

// Governance primitives
export {
  aggregateCritiques,
  announceConsensus,
  checkConsensus,
  collectVotes,
  initConsensusState,
  parseCritique,
  parseVote,
  tallyVotes,
} from "./governance";

export type {
  ConsensusConfig,
  ConsensusState,
  Critique,
  CritiqueIssue,
  CritiqueResult,
  Vote,
  VotingConfig,
  VotingResult,
} from "./governance";

// Version
export const VERSION = "0.1.0";
