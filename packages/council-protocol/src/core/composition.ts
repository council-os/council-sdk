/**
 * @council/protocol - Agent Composition Patterns
 *
 * Pre-built composition patterns for common multi-agent workflows.
 * These are higher-order functions that create configured StateTransitions.
 */

import {
  AgentConfig,
  AgentResponse,
  Message,
  Result,
  StateMachine,
  StateTransition,
  WorkflowState,
} from "./types";

// =============================================================================
// Agent Invocation Types
// =============================================================================

/**
 * Function type for invoking an AI model.
 * This abstraction allows adapting different AI providers.
 */
export type AgentInvoker = (
  agent: AgentConfig,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options?: { signal?: AbortSignal }
) => Promise<AgentResponse>;

/**
 * Factory for creating state transitions from agent configurations.
 */
export type AgentTransitionFactory<S extends WorkflowState = WorkflowState> = (
  agent: AgentConfig,
  invoker: AgentInvoker
) => StateTransition<S>;

// =============================================================================
// Core Agent Transition
// =============================================================================

/**
 * Create a state transition that invokes a single agent.
 *
 * @param agent - The agent configuration
 * @param invoker - Function to call the AI model
 * @param contextBuilder - Optional function to build the prompt context
 *
 * @example
 * ```typescript
 * const critic = createAgentTransition(
 *   { id: "critic", name: "Critic", role: "critic", model: "gpt-4" },
 *   openRouterInvoker
 * );
 * ```
 */
export const createAgentTransition = <S extends WorkflowState = WorkflowState>(
  agent: AgentConfig,
  invoker: AgentInvoker,
  contextBuilder?: (
    state: S
  ) => Array<{ role: "system" | "user" | "assistant"; content: string }>
): StateTransition<S> => {
  return async (state: S): Promise<Result<S>> => {
    try {
      // Build messages from state history or use custom builder
      const messages = contextBuilder
        ? contextBuilder(state)
        : buildDefaultContext(agent, state);

      // Invoke the agent
      const response = await invoker(agent, messages);

      // Create new message
      const message: Message = {
        id: crypto.randomUUID(),
        agentId: agent.id,
        agentName: agent.name,
        content: response.content,
        timestamp: Date.now(),
        metadata: {
          model: response.model,
          usage: response.usage,
          cost: response.cost,
          latencyMs: response.latencyMs,
        },
      };

      // Update state
      const newState = {
        ...state,
        history: [...state.history, message],
        turnCount: state.turnCount + 1,
        traces: [
          ...state.traces,
          `[${agent.name}] Responded in ${response.latencyMs}ms`,
        ],
      } as S;

      return Result.ok(newState);
    } catch (error) {
      return Result.err(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  };
};

/**
 * Build default conversation context from state.
 */
const buildDefaultContext = <S extends WorkflowState>(
  agent: AgentConfig,
  state: S
): Array<{ role: "system" | "user" | "assistant"; content: string }> => {
  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [];

  // System prompt
  if (agent.systemPrompt) {
    messages.push({ role: "system", content: agent.systemPrompt });
  } else {
    messages.push({
      role: "system",
      content: `You are ${agent.name}, a ${agent.role} participating in a deliberation about: ${state.topic}`,
    });
  }

  // Conversation history
  for (const msg of state.history) {
    const role = msg.agentId === agent.id ? "assistant" : "user";
    messages.push({
      role,
      content: `[${msg.agentName}]: ${msg.content}`,
    });
  }

  return messages;
};

// =============================================================================
// Composition Patterns
// =============================================================================

/**
 * Round-robin composition: Agents take turns in order.
 *
 * @example
 * ```typescript
 * const debate = roundRobin(
 *   [proposer, critic, synthesizer],
 *   openRouterInvoker,
 *   { turnsPerAgent: 3 }
 * );
 * ```
 */
export const roundRobin = <S extends WorkflowState = WorkflowState>(
  agents: AgentConfig[],
  invoker: AgentInvoker,
  options: { turnsPerAgent?: number } = {}
): StateTransition<S> => {
  const { turnsPerAgent = 1 } = options;
  const totalTurns = agents.length * turnsPerAgent;

  return async (state: S): Promise<Result<S>> => {
    let currentState = state;

    for (let turn = 0; turn < totalTurns; turn++) {
      if (currentState.status !== "active") break;

      const agentIndex = turn % agents.length;
      const agent = agents[agentIndex];
      const transition = createAgentTransition<S>(agent, invoker);

      const result = await transition(currentState);
      if (!result.ok) return result;
      currentState = result.value;
    }

    return Result.ok(currentState);
  };
};

/**
 * Critique-Response pattern: Agent A proposes, Agent B critiques, Agent A responds.
 *
 * @example
 * ```typescript
 * const pipeline = critiqueResponse(
 *   proposerAgent,
 *   criticAgent,
 *   openRouterInvoker,
 *   { iterations: 2 }
 * );
 * ```
 */
export const critiqueResponse = <S extends WorkflowState = WorkflowState>(
  proposer: AgentConfig,
  critic: AgentConfig,
  invoker: AgentInvoker,
  options: { iterations?: number } = {}
): StateTransition<S> => {
  const { iterations = 1 } = options;

  return async (state: S): Promise<Result<S>> => {
    let currentState = state;

    for (let i = 0; i < iterations; i++) {
      // Proposer generates/refines
      const proposeTransition = createAgentTransition<S>(proposer, invoker);
      const proposeResult = await proposeTransition(currentState);
      if (!proposeResult.ok) return proposeResult;
      currentState = proposeResult.value;

      // Critic evaluates
      const criticTransition = createAgentTransition<S>(critic, invoker);
      const criticResult = await criticTransition(currentState);
      if (!criticResult.ok) return criticResult;
      currentState = criticResult.value;
    }

    return Result.ok(currentState);
  };
};

/**
 * Consensus pattern: Multiple agents vote, then synthesize agreement.
 *
 * @example
 * ```typescript
 * const consensus = buildConsensus(
 *   [agentA, agentB, agentC],
 *   synthesizerAgent,
 *   openRouterInvoker
 * );
 * ```
 */
export const buildConsensus = <S extends WorkflowState = WorkflowState>(
  voters: AgentConfig[],
  synthesizer: AgentConfig,
  invoker: AgentInvoker
): StateTransition<S> => {
  return async (state: S): Promise<Result<S>> => {
    let currentState = state;

    // All voters provide their perspectives in parallel
    const votePromises = voters.map(async (voter) => {
      const transition = createAgentTransition<S>(voter, invoker);
      return transition(currentState);
    });

    const voteResults = await Promise.all(votePromises);

    // Collect all votes into the state
    for (const result of voteResults) {
      if (!result.ok) return result;
      // Merge the latest message from each vote result
      const latestMessage =
        result.value.history[result.value.history.length - 1];
      if (latestMessage) {
        currentState = {
          ...currentState,
          history: [
            ...currentState.history,
            { ...latestMessage, role: "vote" as const },
          ],
          turnCount: currentState.turnCount + 1,
        } as S;
      }
    }

    // Synthesizer creates consensus
    const synthesizerWithPrompt = {
      ...synthesizer,
      systemPrompt: `${
        synthesizer.systemPrompt || ""
      }\n\nYour role is to synthesize the previous votes into a consensus position. Identify areas of agreement and resolve conflicts.`,
    };
    const synthesizeTransition = createAgentTransition<S>(
      synthesizerWithPrompt,
      invoker
    );
    const synthesizeResult = await synthesizeTransition(currentState);
    if (!synthesizeResult.ok) return synthesizeResult;

    // Mark the final message as consensus
    const finalState = synthesizeResult.value;
    if (finalState.history.length > 0) {
      const lastMessage = finalState.history[finalState.history.length - 1];
      finalState.history[finalState.history.length - 1] = {
        ...lastMessage,
        role: "consensus" as const,
      };
    }

    return Result.ok(finalState);
  };
};

/**
 * Expert panel pattern: Specialist agents each contribute, then a chair summarizes.
 *
 * @example
 * ```typescript
 * const panel = expertPanel(
 *   [legalExpert, technicalExpert, ethicsExpert],
 *   chairAgent,
 *   openRouterInvoker
 * );
 * ```
 */
export const expertPanel = <S extends WorkflowState = WorkflowState>(
  experts: AgentConfig[],
  chair: AgentConfig,
  invoker: AgentInvoker
): StateTransition<S> => {
  return StateMachine.compose(
    // Each expert contributes sequentially
    ...experts.map((expert) => createAgentTransition<S>(expert, invoker)),
    // Chair synthesizes
    createAgentTransition<S>(
      {
        ...chair,
        systemPrompt: `${
          chair.systemPrompt || ""
        }\n\nSynthesize the expert opinions above into a comprehensive recommendation.`,
      },
      invoker
    )
  );
};

/**
 * Debate pattern: Two agents argue opposing positions, then a judge decides.
 *
 * @example
 * ```typescript
 * const debate = adversarialDebate(
 *   proAgent,
 *   conAgent,
 *   judgeAgent,
 *   openRouterInvoker,
 *   { rounds: 3 }
 * );
 * ```
 */
export const adversarialDebate = <S extends WorkflowState = WorkflowState>(
  proponent: AgentConfig,
  opponent: AgentConfig,
  judge: AgentConfig,
  invoker: AgentInvoker,
  options: { rounds?: number } = {}
): StateTransition<S> => {
  const { rounds = 2 } = options;

  return async (state: S): Promise<Result<S>> => {
    let currentState = state;

    // Debate rounds
    for (let round = 0; round < rounds; round++) {
      // Proponent argues
      const proTransition = createAgentTransition<S>(
        {
          ...proponent,
          systemPrompt: `${
            proponent.systemPrompt || ""
          }\n\nArgue IN FAVOR of the proposition. Round ${
            round + 1
          } of ${rounds}.`,
        },
        invoker
      );
      const proResult = await proTransition(currentState);
      if (!proResult.ok) return proResult;
      currentState = proResult.value;

      // Opponent argues
      const conTransition = createAgentTransition<S>(
        {
          ...opponent,
          systemPrompt: `${
            opponent.systemPrompt || ""
          }\n\nArgue AGAINST the proposition. Round ${round + 1} of ${rounds}.`,
        },
        invoker
      );
      const conResult = await conTransition(currentState);
      if (!conResult.ok) return conResult;
      currentState = conResult.value;
    }

    // Judge decides
    const judgeTransition = createAgentTransition<S>(
      {
        ...judge,
        systemPrompt: `${
          judge.systemPrompt || ""
        }\n\nEvaluate the debate above. Identify the strongest arguments from each side and provide a reasoned verdict.`,
      },
      invoker
    );

    return judgeTransition(currentState);
  };
};

/**
 * Chain of Thought with Verification pattern:
 * Agent thinks step-by-step, verifier checks each step.
 */
export const chainOfThoughtVerified = <S extends WorkflowState = WorkflowState>(
  thinker: AgentConfig,
  verifier: AgentConfig,
  invoker: AgentInvoker,
  options: { steps?: number } = {}
): StateTransition<S> => {
  const { steps = 3 } = options;

  return async (state: S): Promise<Result<S>> => {
    let currentState = state;

    for (let step = 1; step <= steps; step++) {
      // Thinker produces step
      const thinkTransition = createAgentTransition<S>(
        {
          ...thinker,
          systemPrompt: `${
            thinker.systemPrompt || ""
          }\n\nStep ${step} of ${steps}: Think through this step of the problem.`,
        },
        invoker
      );
      const thinkResult = await thinkTransition(currentState);
      if (!thinkResult.ok) return thinkResult;
      currentState = thinkResult.value;

      // Verifier checks
      const verifyTransition = createAgentTransition<S>(
        {
          ...verifier,
          systemPrompt: `${
            verifier.systemPrompt || ""
          }\n\nVerify the reasoning in the previous step. Point out any errors or issues.`,
        },
        invoker
      );
      const verifyResult = await verifyTransition(currentState);
      if (!verifyResult.ok) return verifyResult;
      currentState = verifyResult.value;
    }

    return Result.ok(currentState);
  };
};
