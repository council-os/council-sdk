/**
 * @council/protocol - Core Module
 *
 * Re-exports all core types and composition utilities.
 */

// Types and primitives
export {
  ArrayMonoid,
  ProductMonoid,
  Result,
  StateMachine,
  StringMonoid,
  SumMonoid,
  TOON,
  foldMonoid,
} from "./types";

export type {
  AgentConfig,
  AgentResponse,
  Functor,
  Message,
  Monoid,
  StateTransition,
  WorkflowState,
} from "./types";

// Composition patterns
export {
  adversarialDebate,
  buildConsensus,
  chainOfThoughtVerified,
  createAgentTransition,
  critiqueResponse,
  expertPanel,
  roundRobin,
} from "./composition";

export type { AgentInvoker, AgentTransitionFactory } from "./composition";
