/**
 * @council/protocol - Governance Primitives
 *
 * Voting, consensus, and critique protocols for multi-agent governance.
 * These primitives enable democratic decision-making among AI agents.
 */

import { Message, Result, StateTransition, WorkflowState } from "../core/types";

// =============================================================================
// Pre-compiled Regex Patterns (GOV-P1 performance fix)
// =============================================================================

/** Pattern to extract vote choice and optional confidence */
const VOTE_PATTERN = /VOTE:\s*\[?([^\]\n]+)\]?\s*(?:\(confidence:\s*([\d.]+)\))?/i;

/** Pattern to extract reasoning after vote line */
const VOTE_REASONING_PATTERN = /VOTE:.*\n([\s\S]*)/i;

/** Pattern to extract assessment (approve/reject/revise) */
const ASSESSMENT_PATTERN = /ASSESSMENT:\s*(approve|reject|revise)/i;

/** Pattern to extract severity level */
const SEVERITY_PATTERN = /SEVERITY:\s*(none|minor|major|critical)/i;

/** Pattern to extract issues section */
const ISSUES_PATTERN = /ISSUES:\s*([\s\S]*?)(?=SUGGESTIONS:|$)/i;

/** Pattern to extract individual issue with type */
const ISSUE_LINE_PATTERN = /[-*]\s*\[(\w+)\]\s*(.+)/;

/** Pattern to extract suggestions section */
const SUGGESTIONS_PATTERN = /SUGGESTIONS:\s*([\s\S]*?)$/i;

/** Pattern to strip list markers from lines */
const LIST_MARKER_PATTERN = /^[-*\d.]\s*/;

// =============================================================================
// Voting Types
// =============================================================================

/**
 * A vote cast by an agent.
 */
export interface Vote {
  /** ID of the voting agent */
  agentId: string;
  /** Agent name */
  agentName: string;
  /** The choice made */
  choice: string;
  /** Confidence level 0-1 */
  confidence: number;
  /** Reasoning for the vote */
  reasoning?: string;
  /** Timestamp of vote */
  timestamp: number;
}

/**
 * Result of a voting round.
 */
export interface VotingResult {
  /** All votes cast */
  votes: Vote[];
  /** The winning choice, if any */
  winner?: string;
  /** Whether consensus was reached */
  consensusReached: boolean;
  /** Vote counts by choice */
  tally: Record<string, number>;
  /** Confidence-weighted tally */
  weightedTally: Record<string, number>;
}

/**
 * Configuration for voting.
 */
export interface VotingConfig {
  /** Choices available for voting */
  choices: string[];
  /** Threshold for consensus (0-1, default 0.66) */
  consensusThreshold?: number;
  /** Whether to use confidence weighting */
  useConfidenceWeighting?: boolean;
  /** Minimum votes required */
  quorum?: number;
  /** Tie-breaking strategy */
  tieBreaker?: "none" | "first" | "random" | "highest-confidence";
}

// =============================================================================
// Voting Protocol
// =============================================================================

/**
 * Tally votes and determine the result.
 */
export const tallyVotes = (
  votes: Vote[],
  config: VotingConfig
): VotingResult => {
  const { consensusThreshold = 0.66, useConfidenceWeighting = false } = config;

  const tally: Record<string, number> = {};
  const weightedTally: Record<string, number> = {};

  // Initialize tallies
  for (const choice of config.choices) {
    tally[choice] = 0;
    weightedTally[choice] = 0;
  }

  // Count votes
  for (const vote of votes) {
    if (config.choices.includes(vote.choice)) {
      tally[vote.choice]++;
      weightedTally[vote.choice] += vote.confidence;
    }
  }

  // Determine winner
  const totalVotes = votes.length;
  const activeTally = useConfidenceWeighting ? weightedTally : tally;
  const totalWeight = useConfidenceWeighting
    ? Object.values(weightedTally).reduce((a, b) => a + b, 0)
    : totalVotes;

  let maxScore = 0;
  let winner: string | undefined;
  let ties: string[] = [];

  for (const [choice, score] of Object.entries(activeTally)) {
    if (score > maxScore) {
      maxScore = score;
      winner = choice;
      ties = [choice];
    } else if (score === maxScore && score > 0) {
      ties.push(choice);
    }
  }

  // Handle ties
  if (ties.length > 1) {
    switch (config.tieBreaker) {
      case "first":
        winner = ties[0];
        break;
      case "random":
        winner = ties[Math.floor(Math.random() * ties.length)];
        break;
      case "highest-confidence":
        // Find the vote with highest confidence among tied choices
        let highestConfidence = 0;
        for (const vote of votes) {
          if (
            ties.includes(vote.choice) &&
            vote.confidence > highestConfidence
          ) {
            highestConfidence = vote.confidence;
            winner = vote.choice;
          }
        }
        break;
      case "none":
      default:
        winner = undefined; // No winner on tie
    }
  }

  // Check consensus
  const winnerScore = winner ? activeTally[winner] : 0;
  const consensusReached =
    totalWeight > 0 && winnerScore / totalWeight >= consensusThreshold;

  return {
    votes,
    winner: consensusReached ? winner : undefined,
    consensusReached,
    tally,
    weightedTally,
  };
};

/**
 * Parse a vote from agent response content.
 * Expects format: "VOTE: [choice] (confidence: 0.X)\n[reasoning]"
 *
 * Uses pre-compiled regex patterns for performance (GOV-P1 fix).
 */
export const parseVote = (
  agentId: string,
  agentName: string,
  content: string,
  validChoices: string[]
): Vote | null => {
  // Try to extract structured vote using pre-compiled pattern
  const voteMatch = content.match(VOTE_PATTERN);

  if (!voteMatch) return null;

  const choice = voteMatch[1].trim();
  const confidence = voteMatch[2] ? parseFloat(voteMatch[2]) : 0.8;

  // Validate choice
  const normalizedChoice = validChoices.find(
    (c) => c.toLowerCase() === choice.toLowerCase()
  );
  if (!normalizedChoice) return null;

  // Extract reasoning using pre-compiled pattern
  const reasoningMatch = content.match(VOTE_REASONING_PATTERN);
  const reasoning = reasoningMatch?.[1]?.trim();

  return {
    agentId,
    agentName,
    choice: normalizedChoice,
    confidence: Math.max(0, Math.min(1, confidence)),
    reasoning,
    timestamp: Date.now(),
  };
};

// =============================================================================
// Critique Protocol
// =============================================================================

/**
 * A critique of a proposal or statement.
 */
export interface Critique {
  /** ID of the critiquing agent */
  agentId: string;
  /** Agent name */
  agentName: string;
  /** Overall assessment */
  assessment: "approve" | "reject" | "revise";
  /** Severity of issues found */
  severity: "none" | "minor" | "major" | "critical";
  /** List of issues identified */
  issues: CritiqueIssue[];
  /** Suggested improvements */
  suggestions: string[];
  /** Timestamp */
  timestamp: number;
}

/**
 * An individual issue in a critique.
 */
export interface CritiqueIssue {
  /** Type of issue */
  type: "logic" | "fact" | "clarity" | "completeness" | "safety" | "other";
  /** Description of the issue */
  description: string;
  /** Location or context */
  location?: string;
  /** Suggested fix */
  fix?: string;
}

/**
 * Result of a critique round.
 */
export interface CritiqueResult {
  /** All critiques received */
  critiques: Critique[];
  /** Overall assessment */
  overallAssessment: "approved" | "rejected" | "needs-revision";
  /** Aggregated severity */
  maxSeverity: "none" | "minor" | "major" | "critical";
  /** All issues across critiques */
  allIssues: CritiqueIssue[];
  /** Consolidated suggestions */
  suggestions: string[];
}

/**
 * Parse a critique from agent response content.
 * Expects structured format with ASSESSMENT, ISSUES, and SUGGESTIONS sections.
 *
 * Uses pre-compiled regex patterns for performance (GOV-P1 fix).
 */
export const parseCritique = (
  agentId: string,
  agentName: string,
  content: string
): Critique | null => {
  // Extract assessment using pre-compiled pattern
  const assessmentMatch = content.match(ASSESSMENT_PATTERN);
  const assessment = (assessmentMatch?.[1]?.toLowerCase() || "revise") as
    | "approve"
    | "reject"
    | "revise";

  // Extract severity using pre-compiled pattern
  const severityMatch = content.match(SEVERITY_PATTERN);
  const severity = (severityMatch?.[1]?.toLowerCase() || "minor") as
    | "none"
    | "minor"
    | "major"
    | "critical";

  // Extract issues using pre-compiled pattern
  const issues: CritiqueIssue[] = [];
  const issuesMatch = content.match(ISSUES_PATTERN);
  if (issuesMatch) {
    const issueLines = issuesMatch[1].split("\n").filter((l) => l.trim());
    for (const line of issueLines) {
      const issueMatch = line.match(ISSUE_LINE_PATTERN);
      if (issueMatch) {
        issues.push({
          type: issueMatch[1].toLowerCase() as CritiqueIssue["type"],
          description: issueMatch[2].trim(),
        });
      } else if (line.trim().startsWith("-") || line.trim().startsWith("*")) {
        issues.push({
          type: "other",
          description: line.replace(/^[-*]\s*/, "").trim(),
        });
      }
    }
  }

  // Extract suggestions using pre-compiled pattern
  const suggestions: string[] = [];
  const suggestionsMatch = content.match(SUGGESTIONS_PATTERN);
  if (suggestionsMatch) {
    const suggestionLines = suggestionsMatch[1]
      .split("\n")
      .filter((l) => l.trim());
    for (const line of suggestionLines) {
      const suggestion = line.replace(LIST_MARKER_PATTERN, "").trim();
      if (suggestion) suggestions.push(suggestion);
    }
  }

  return {
    agentId,
    agentName,
    assessment,
    severity,
    issues,
    suggestions,
    timestamp: Date.now(),
  };
};

/**
 * Aggregate multiple critiques into a combined result.
 */
export const aggregateCritiques = (critiques: Critique[]): CritiqueResult => {
  // Determine overall assessment
  const hasRejection = critiques.some((c) => c.assessment === "reject");
  const allApproved = critiques.every((c) => c.assessment === "approve");

  const overallAssessment = hasRejection
    ? "rejected"
    : allApproved
    ? "approved"
    : "needs-revision";

  // Find max severity
  const severityOrder = ["none", "minor", "major", "critical"] as const;
  let maxSeverityIndex = 0;
  for (const critique of critiques) {
    const index = severityOrder.indexOf(critique.severity);
    if (index > maxSeverityIndex) maxSeverityIndex = index;
  }

  // Aggregate issues and suggestions
  const allIssues = critiques.flatMap((c) => c.issues);
  const suggestions = [...new Set(critiques.flatMap((c) => c.suggestions))];

  return {
    critiques,
    overallAssessment,
    maxSeverity: severityOrder[maxSeverityIndex],
    allIssues,
    suggestions,
  };
};

// =============================================================================
// Consensus Protocol
// =============================================================================

/**
 * Configuration for consensus building.
 */
export interface ConsensusConfig {
  /** Minimum agreement level (0-1) */
  threshold: number;
  /** Maximum rounds of discussion */
  maxRounds: number;
  /** Strategy for building consensus */
  strategy: "deliberation" | "mediation" | "delphi";
}

/**
 * State extension for consensus-enabled workflows.
 */
export interface ConsensusState extends WorkflowState {
  /** Current consensus round */
  consensusRound: number;
  /** Votes cast this round */
  currentVotes: Vote[];
  /** History of voting results */
  votingHistory: VotingResult[];
  /** Whether consensus has been reached */
  consensusReached: boolean;
}

/**
 * Create an initial consensus state from a base workflow state.
 */
export const initConsensusState = <S extends WorkflowState>(
  state: S
): S & ConsensusState => ({
  ...state,
  consensusRound: 0,
  currentVotes: [],
  votingHistory: [],
  consensusReached: false,
});

/**
 * Create a transition that collects votes from the last agent responses.
 */
export const collectVotes = <S extends ConsensusState>(
  config: VotingConfig
): StateTransition<S> => {
  return async (state: S): Promise<Result<S>> => {
    // Parse votes from recent messages
    const recentMessages = state.history.slice(-state.agents.length);
    const votes: Vote[] = [];

    for (const msg of recentMessages) {
      const vote = parseVote(
        msg.agentId,
        msg.agentName,
        msg.content,
        config.choices
      );
      if (vote) votes.push(vote);
    }

    // Check quorum
    if (config.quorum && votes.length < config.quorum) {
      return Result.ok({
        ...state,
        currentVotes: votes,
        consensusReached: false,
      });
    }

    // Tally and record
    const result = tallyVotes(votes, config);

    return Result.ok({
      ...state,
      currentVotes: votes,
      votingHistory: [...state.votingHistory, result],
      consensusRound: state.consensusRound + 1,
      consensusReached: result.consensusReached,
      status: result.consensusReached ? "completed" : state.status,
    });
  };
};

// =============================================================================
// Governance State Transitions
// =============================================================================

/**
 * Create a transition that checks if consensus has been reached.
 */
export const checkConsensus = <S extends ConsensusState>(
  threshold: number = 0.66
): StateTransition<S> => {
  return async (state: S): Promise<Result<S>> => {
    if (state.votingHistory.length === 0) {
      return Result.ok(state);
    }

    const lastResult = state.votingHistory[state.votingHistory.length - 1];

    // Use threshold to determine consensus (agreement ratio >= threshold)
    const consensusMet =
      lastResult.consensusReached &&
      lastResult.tally.agree /
        (lastResult.tally.agree +
          lastResult.tally.disagree +
          lastResult.tally.abstain) >=
        threshold;

    return Result.ok({
      ...state,
      consensusReached: consensusMet,
      status: consensusMet ? "completed" : state.status,
    });
  };
};

/**
 * Create a transition that announces the consensus result.
 */
export const announceConsensus = <
  S extends ConsensusState
>(): StateTransition<S> => {
  return async (state: S): Promise<Result<S>> => {
    if (state.votingHistory.length === 0) {
      return Result.ok(state);
    }

    const lastResult = state.votingHistory[state.votingHistory.length - 1];

    const announcement: Message = {
      id: crypto.randomUUID(),
      agentId: "governance",
      agentName: "Governance Protocol",
      content: lastResult.consensusReached
        ? `✅ **Consensus Reached**\n\nThe council has agreed on: **${
            lastResult.winner
          }**\n\nVotes: ${JSON.stringify(lastResult.tally, null, 2)}`
        : `⚠️ **No Consensus**\n\nThe council could not reach agreement.\n\nVotes: ${JSON.stringify(
            lastResult.tally,
            null,
            2
          )}`,
      timestamp: Date.now(),
      role: "consensus",
    };

    return Result.ok({
      ...state,
      history: [...state.history, announcement],
    });
  };
};
