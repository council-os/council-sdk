/**
 * @council/protocol - Governance Module
 *
 * Re-exports all governance primitives.
 */

export {
  aggregateCritiques,
  announceConsensus,
  checkConsensus,
  collectVotes,
  initConsensusState,
  parseCritique,
  parseVote,
  tallyVotes,
} from "./voting";

export type {
  ConsensusConfig,
  ConsensusState,
  Critique,
  CritiqueIssue,
  CritiqueResult,
  Vote,
  VotingConfig,
  VotingResult,
} from "./voting";
