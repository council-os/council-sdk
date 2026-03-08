/**
 * @council/orchestrator - Governance Protocols
 *
 * Pre-built governance protocols for common decision-making patterns.
 */

import {
  AgentConfig,
  AgentInvoker,
  aggregateCritiques,
  createAgentTransition,
  Critique,
  CritiqueResult,
  Message,
  parseCritique,
  parseVote,
  Result,
  StateTransition,
  tallyVotes,
  Vote,
  VotingConfig,
  VotingResult,
} from "@council/protocol";

import { SessionState } from "./orchestrator";

// =============================================================================
// Voting Protocol
// =============================================================================

/**
 * Configuration for a voting round.
 */
export interface VotingRoundConfig extends VotingConfig {
  /** Question or proposal to vote on */
  question: string;
  /** Voters */
  voters: AgentConfig[];
  /** Invoker */
  invoker: AgentInvoker;
}

/**
 * State extension for voting rounds.
 */
export interface VotingRoundState extends SessionState {
  /** Current votes */
  votes: Vote[];
  /** Voting result */
  votingResult?: VotingResult;
}

/**
 * Create a voting round transition.
 *
 * @example
 * ```typescript
 * const votingRound = createVotingRound({
 *   question: "Should we deploy to production?",
 *   choices: ["yes", "no", "delay"],
 *   voters: [devAgent, opsAgent, securityAgent],
 *   invoker: openRouterInvoker,
 *   consensusThreshold: 0.66
 * });
 *
 * const result = await votingRound(state);
 * if (result.ok && result.value.votingResult?.consensusReached) {
 *   console.log("Decision:", result.value.votingResult.winner);
 * }
 * ```
 */
export const createVotingRound = (
  config: VotingRoundConfig
): StateTransition<VotingRoundState> => {
  return async (state: VotingRoundState): Promise<Result<VotingRoundState>> => {
    const votes: Vote[] = [];
    let currentState = state;

    // Create voting prompt
    const votingPrompt = `
You are participating in a vote.

**Question:** ${config.question}

**Available choices:** ${config.choices.join(", ")}

Please cast your vote using the following format:
VOTE: [your choice] (confidence: 0.X)
[Your reasoning for this vote]

Be specific about your confidence level (0.0 to 1.0).
`;

    // Each voter casts their vote
    for (const voter of config.voters) {
      const voterWithPrompt: AgentConfig = {
        ...voter,
        systemPrompt: `${voter.systemPrompt || ""}\n\n${votingPrompt}`,
      };

      const transition = createAgentTransition<VotingRoundState>(
        voterWithPrompt,
        config.invoker
      );

      const result = await transition(currentState);
      if (!result.ok) return result;

      currentState = result.value;

      // Parse vote from response
      const lastMessage = currentState.history[currentState.history.length - 1];
      const vote = parseVote(
        voter.id,
        voter.name,
        lastMessage.content,
        config.choices
      );

      if (vote) {
        votes.push(vote);
      }
    }

    // Tally votes
    const votingResult = tallyVotes(votes, config);

    // Create announcement message
    const announcement: Message = {
      id: crypto.randomUUID(),
      agentId: "voting-protocol",
      agentName: "Voting Protocol",
      content: formatVotingResult(config.question, votingResult),
      timestamp: Date.now(),
      role: "consensus",
    };

    return Result.ok({
      ...currentState,
      votes,
      votingResult,
      history: [...currentState.history, announcement],
    });
  };
};

/**
 * Format voting result as markdown.
 */
const formatVotingResult = (question: string, result: VotingResult): string => {
  const lines = [`## 🗳️ Voting Results\n`, `**Question:** ${question}\n`];

  // Tally
  lines.push("**Votes:**");
  for (const [choice, count] of Object.entries(result.tally)) {
    const weighted = result.weightedTally[choice].toFixed(2);
    lines.push(`- ${choice}: ${count} votes (weighted: ${weighted})`);
  }
  lines.push("");

  // Result
  if (result.consensusReached) {
    lines.push(`✅ **Consensus Reached:** ${result.winner}`);
  } else {
    lines.push(`⚠️ **No Consensus**`);
    if (result.winner) {
      lines.push(`Leading choice: ${result.winner}`);
    }
  }

  return lines.join("\n");
};

// =============================================================================
// Critique Protocol
// =============================================================================

/**
 * Configuration for a critique round.
 */
export interface CritiqueRoundConfig {
  /** The proposal or content to critique */
  proposal: string;
  /** Reviewers */
  reviewers: AgentConfig[];
  /** Invoker */
  invoker: AgentInvoker;
  /** Whether to iterate until approval */
  iterateUntilApproval?: boolean;
  /** Maximum iterations */
  maxIterations?: number;
}

/**
 * State extension for critique rounds.
 */
export interface CritiqueRoundState extends SessionState {
  /** Current critiques */
  critiques: Critique[];
  /** Aggregated result */
  critiqueResult?: CritiqueResult;
  /** Iteration count */
  critiqueIteration: number;
}

/**
 * Create a critique round transition.
 *
 * @example
 * ```typescript
 * const critiqueRound = createCritiqueRound({
 *   proposal: "We should migrate to microservices",
 *   reviewers: [architectAgent, devOpsAgent, securityAgent],
 *   invoker: openRouterInvoker
 * });
 *
 * const result = await critiqueRound(state);
 * if (result.ok) {
 *   console.log("Overall:", result.value.critiqueResult?.overallAssessment);
 *   console.log("Issues:", result.value.critiqueResult?.allIssues);
 * }
 * ```
 */
export const createCritiqueRound = (
  config: CritiqueRoundConfig
): StateTransition<CritiqueRoundState> => {
  return async (
    state: CritiqueRoundState
  ): Promise<Result<CritiqueRoundState>> => {
    const critiques: Critique[] = [];
    let currentState = state;

    // Create critique prompt
    const critiquePrompt = `
You are reviewing a proposal. Provide a structured critique.

**Proposal:** ${config.proposal}

Please structure your response as follows:

ASSESSMENT: [approve/reject/revise]
SEVERITY: [none/minor/major/critical]

ISSUES:
- [type] Description of issue
- [type] Another issue...

SUGGESTIONS:
1. Improvement suggestion
2. Another suggestion...

Types: logic, fact, clarity, completeness, safety, other
`;

    // Each reviewer provides critique
    for (const reviewer of config.reviewers) {
      const reviewerWithPrompt: AgentConfig = {
        ...reviewer,
        systemPrompt: `${reviewer.systemPrompt || ""}\n\n${critiquePrompt}`,
      };

      const transition = createAgentTransition<CritiqueRoundState>(
        reviewerWithPrompt,
        config.invoker
      );

      const result = await transition(currentState);
      if (!result.ok) return result;

      currentState = result.value;

      // Parse critique from response
      const lastMessage = currentState.history[currentState.history.length - 1];
      const critique = parseCritique(
        reviewer.id,
        reviewer.name,
        lastMessage.content
      );

      if (critique) {
        critiques.push(critique);
      }
    }

    // Aggregate critiques
    const critiqueResult = aggregateCritiques(critiques);

    // Create summary message
    const summary: Message = {
      id: crypto.randomUUID(),
      agentId: "critique-protocol",
      agentName: "Critique Protocol",
      content: formatCritiqueResult(critiqueResult),
      timestamp: Date.now(),
      role: "critique",
    };

    return Result.ok({
      ...currentState,
      critiques,
      critiqueResult,
      critiqueIteration: (currentState.critiqueIteration || 0) + 1,
      history: [...currentState.history, summary],
    });
  };
};

/**
 * Format critique result as markdown.
 */
const formatCritiqueResult = (result: CritiqueResult): string => {
  const lines = [`## 📝 Critique Summary\n`];

  // Overall assessment
  const emoji =
    result.overallAssessment === "approved"
      ? "✅"
      : result.overallAssessment === "rejected"
      ? "❌"
      : "⚠️";
  lines.push(`**Assessment:** ${emoji} ${result.overallAssessment}`);
  lines.push(`**Severity:** ${result.maxSeverity}\n`);

  // Issues
  if (result.allIssues.length > 0) {
    lines.push("**Issues Found:**");
    for (const issue of result.allIssues) {
      lines.push(`- [${issue.type}] ${issue.description}`);
    }
    lines.push("");
  }

  // Suggestions
  if (result.suggestions.length > 0) {
    lines.push("**Suggestions:**");
    for (let i = 0; i < result.suggestions.length; i++) {
      lines.push(`${i + 1}. ${result.suggestions[i]}`);
    }
  }

  return lines.join("\n");
};

// =============================================================================
// Consensus Protocol
// =============================================================================

/**
 * Configuration for consensus building.
 */
export interface ConsensusConfig {
  /** Topic to build consensus on */
  topic: string;
  /** Participants */
  participants: AgentConfig[];
  /** Synthesizer agent */
  synthesizer: AgentConfig;
  /** Invoker */
  invoker: AgentInvoker;
  /** Maximum rounds of discussion */
  maxRounds?: number;
  /** Consensus threshold */
  threshold?: number;
}

/**
 * State extension for consensus building.
 */
export interface ConsensusState extends SessionState {
  /** Current consensus round */
  consensusRound: number;
  /** Whether consensus was reached */
  consensusReached: boolean;
  /** Final consensus statement */
  consensusStatement?: string;
}

/**
 * Create a consensus building protocol.
 *
 * @example
 * ```typescript
 * const consensus = createConsensusProtocol({
 *   topic: "What should our AI ethics policy include?",
 *   participants: [ethicist, engineer, lawyer],
 *   synthesizer: facilitator,
 *   invoker: openRouterInvoker,
 *   maxRounds: 3
 * });
 *
 * const result = await consensus(state);
 * if (result.ok && result.value.consensusReached) {
 *   console.log("Consensus:", result.value.consensusStatement);
 * }
 * ```
 */
export const createConsensusProtocol = (
  config: ConsensusConfig
): StateTransition<ConsensusState> => {
  const { maxRounds = 3, threshold = 0.66 } = config;

  return async (state: ConsensusState): Promise<Result<ConsensusState>> => {
    let currentState = state;
    const participantCount = config.participants.length;

    for (let round = 0; round < maxRounds; round++) {
      let agreementCount = 0;

      // Each participant contributes
      for (const participant of config.participants) {
        const prompt =
          round === 0
            ? `Share your perspective on: ${config.topic}`
            : `Based on the discussion so far, provide your updated perspective. Highlight areas of agreement and remaining concerns. If you agree with the emerging consensus, say "I AGREE" at the start.`;

        const participantWithPrompt: AgentConfig = {
          ...participant,
          systemPrompt: `${participant.systemPrompt || ""}\n\n${prompt}`,
        };

        const transition = createAgentTransition<ConsensusState>(
          participantWithPrompt,
          config.invoker
        );

        const result = await transition(currentState);
        if (!result.ok) return result;

        currentState = result.value;

        // Check if participant explicitly agrees
        const lastMsg = currentState.history[currentState.history.length - 1];
        if (lastMsg.content.toUpperCase().startsWith("I AGREE")) {
          agreementCount++;
        }
      }

      // Check if threshold agreement reached through participant responses
      const agreementRatio = agreementCount / participantCount;
      if (round > 0 && agreementRatio >= threshold) {
        return Result.ok({
          ...currentState,
          consensusRound: round + 1,
          consensusReached: true,
          consensusStatement: `Consensus reached with ${Math.round(
            agreementRatio * 100
          )}% agreement on: ${config.topic}`,
        });
      }

      // Synthesizer attempts to build consensus
      const synthesizerWithPrompt: AgentConfig = {
        ...config.synthesizer,
        systemPrompt: `${config.synthesizer.systemPrompt || ""}

You are a facilitator trying to build consensus.

Review the discussion above and:
1. Identify areas of agreement
2. Identify remaining disagreements
3. Propose a consensus statement that all parties might accept

If you believe consensus has been reached, start your response with:
CONSENSUS REACHED: [summary statement]

If not, start with:
CONSENSUS PENDING: [key disagreements]`,
      };

      const synthesisTransition = createAgentTransition<ConsensusState>(
        synthesizerWithPrompt,
        config.invoker
      );

      const synthesisResult = await synthesisTransition(currentState);
      if (!synthesisResult.ok) return synthesisResult;

      currentState = synthesisResult.value;

      // Check if consensus was reached
      const lastMessage = currentState.history[currentState.history.length - 1];
      if (lastMessage.content.startsWith("CONSENSUS REACHED:")) {
        const statement = lastMessage.content
          .replace("CONSENSUS REACHED:", "")
          .trim();

        return Result.ok({
          ...currentState,
          consensusRound: round + 1,
          consensusReached: true,
          consensusStatement: statement,
        });
      }

      currentState = {
        ...currentState,
        consensusRound: round + 1,
      };
    }

    // No consensus after max rounds
    return Result.ok({
      ...currentState,
      consensusReached: false,
    });
  };
};

// =============================================================================
// Delphi Protocol
// =============================================================================

/**
 * The Delphi method: Iterative anonymous expert forecasting.
 */
export interface DelphiConfig {
  /** Question to forecast */
  question: string;
  /** Expert agents */
  experts: AgentConfig[];
  /** Invoker */
  invoker: AgentInvoker;
  /** Number of rounds */
  rounds?: number;
}

/**
 * State for Delphi protocol.
 */
export interface DelphiState extends SessionState {
  /** Forecasts by round */
  forecasts: Array<{
    round: number;
    estimates: Array<{
      expertId: string;
      estimate: number;
      confidence: number;
      reasoning: string;
    }>;
    median: number;
    standardDeviation: number;
  }>;
}

/**
 * Create a Delphi forecasting protocol.
 *
 * @example
 * ```typescript
 * const delphi = createDelphiProtocol({
 *   question: "What percentage of code will be AI-generated by 2030?",
 *   experts: [aiResearcher, softwareEngineer, economist],
 *   invoker: openRouterInvoker,
 *   rounds: 3
 * });
 *
 * const result = await delphi(state);
 * if (result.ok) {
 *   const finalRound = result.value.forecasts[result.value.forecasts.length - 1];
 *   console.log("Final median:", finalRound.median);
 * }
 * ```
 */
export const createDelphiProtocol = (
  config: DelphiConfig
): StateTransition<DelphiState> => {
  const { rounds = 3 } = config;

  return async (state: DelphiState): Promise<Result<DelphiState>> => {
    let currentState: DelphiState = { ...state, forecasts: [] };

    for (let round = 0; round < rounds; round++) {
      const estimates: DelphiState["forecasts"][0]["estimates"] = [];
      const previousRound = currentState.forecasts[round - 1];

      for (const expert of config.experts) {
        let prompt = `
You are participating in a Delphi forecasting exercise.

**Question:** ${config.question}

Please provide:
ESTIMATE: [your numerical estimate as a percentage 0-100]
CONFIDENCE: [your confidence 0.0-1.0]
REASONING: [brief explanation]
`;

        if (previousRound) {
          prompt += `
**Previous Round Results:**
- Median: ${previousRound.median.toFixed(1)}%
- Standard Deviation: ${previousRound.standardDeviation.toFixed(1)}
- Range: ${Math.min(
            ...previousRound.estimates.map((e) => e.estimate)
          )} - ${Math.max(...previousRound.estimates.map((e) => e.estimate))}

Consider the group's previous estimates when refining your forecast.
`;
        }

        const expertWithPrompt: AgentConfig = {
          ...expert,
          systemPrompt: `${expert.systemPrompt || ""}\n\n${prompt}`,
        };

        const transition = createAgentTransition<DelphiState>(
          expertWithPrompt,
          config.invoker
        );

        const result = await transition(currentState);
        if (!result.ok) return result;

        currentState = result.value;

        // Parse estimate
        const lastMessage =
          currentState.history[currentState.history.length - 1];
        const estimateMatch =
          lastMessage.content.match(/ESTIMATE:\s*([\d.]+)/i);
        const confidenceMatch = lastMessage.content.match(
          /CONFIDENCE:\s*([\d.]+)/i
        );
        const reasoningMatch = lastMessage.content.match(
          /REASONING:\s*(.+?)(?=ESTIMATE:|CONFIDENCE:|$)/is
        );

        if (estimateMatch) {
          estimates.push({
            expertId: expert.id,
            estimate: parseFloat(estimateMatch[1]),
            confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5,
            reasoning: reasoningMatch?.[1]?.trim() || "",
          });
        }
      }

      // Calculate statistics
      const values = estimates.map((e) => e.estimate);
      const median = calculateMedian(values);
      const standardDeviation = calculateStdDev(values);

      currentState = {
        ...currentState,
        forecasts: [
          ...currentState.forecasts,
          { round: round + 1, estimates, median, standardDeviation },
        ],
      };

      // Add round summary message
      const summary: Message = {
        id: crypto.randomUUID(),
        agentId: "delphi-protocol",
        agentName: "Delphi Protocol",
        content: `## Round ${
          round + 1
        } Results\n\n- **Median:** ${median.toFixed(
          1
        )}%\n- **Std Dev:** ${standardDeviation.toFixed(
          1
        )}\n- **Estimates:** ${estimates
          .map((e) => `${e.estimate}%`)
          .join(", ")}`,
        timestamp: Date.now(),
      };

      currentState = {
        ...currentState,
        history: [...currentState.history, summary],
      };
    }

    return Result.ok(currentState);
  };
};

// Helper functions
const calculateMedian = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
};

const calculateStdDev = (values: number[]): number => {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squareDiffs = values.map((value) => Math.pow(value - mean, 2));
  const avgSquareDiff =
    squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
  return Math.sqrt(avgSquareDiff);
};
