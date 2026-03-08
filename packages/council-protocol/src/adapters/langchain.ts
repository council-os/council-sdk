/**
 * @council/protocol - LangChain Adapter
 *
 * Wrap LangChain agents as Council StateTransition morphisms.
 * Enables Council to orchestrate LangChain-based agents while
 * capturing traces in TOON format.
 */

import {
  AgentConfig,
  AgentInvoker,
  AgentResponse,
  Message,
  Result,
  StateTransition,
  TOON,
  WorkflowState,
} from "../core";

// =============================================================================
// LangChain Type Definitions (for compatibility without hard dependency)
// =============================================================================

/**
 * Minimal interface for LangChain BaseLanguageModel.
 * Users provide the actual LangChain instance.
 */
export interface LangChainLLM {
  invoke(
    input: string | Array<{ role: string; content: string }>,
    options?: { signal?: AbortSignal }
  ): Promise<{ content: string; [key: string]: unknown }>;
}

/**
 * Minimal interface for LangChain Agent.
 */
export interface LangChainAgent {
  invoke(
    input: {
      input: string;
      chat_history?: Array<{ role: string; content: string }>;
    },
    options?: { signal?: AbortSignal }
  ): Promise<{ output: string; [key: string]: unknown }>;
}

/**
 * Minimal interface for LangChain Tool.
 */
export interface LangChainTool {
  name: string;
  description: string;
  invoke(input: string): Promise<string>;
}

/**
 * Minimal interface for LangChain Chain.
 */
export interface LangChainChain {
  invoke(
    input: Record<string, unknown>,
    options?: { signal?: AbortSignal }
  ): Promise<Record<string, unknown>>;
}

// =============================================================================
// Trace Capture
// =============================================================================

/**
 * A trace entry from a LangChain invocation.
 */
export interface LangChainTrace {
  /** Unique trace ID */
  id: string;
  /** Type of LangChain component */
  type: "llm" | "agent" | "tool" | "chain";
  /** Input to the component */
  input: unknown;
  /** Output from the component */
  output: unknown;
  /** Start timestamp */
  startTime: number;
  /** End timestamp */
  endTime: number;
  /** Duration in ms */
  durationMs: number;
  /** Token usage if available */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Error if failed */
  error?: string;
  /** Nested traces for chains/agents */
  children?: LangChainTrace[];
}

/**
 * Convert a LangChain trace to TOON format for token-efficient storage.
 */
export const traceToToon = (trace: LangChainTrace): string => {
  return TOON.encode({
    id: trace.id,
    type: trace.type,
    duration: String(trace.durationMs),
    tokens: trace.usage?.totalTokens?.toString() || "0",
    status: trace.error ? "error" : "ok",
  });
};

// =============================================================================
// LLM Adapter
// =============================================================================

/**
 * Options for the LangChain LLM adapter.
 */
export interface LangChainLLMAdapterOptions {
  /** Enable trace capture */
  enableTracing?: boolean;
  /** Custom trace handler */
  onTrace?: (trace: LangChainTrace) => void;
}

/**
 * Create a Council AgentInvoker from a LangChain LLM.
 *
 * @example
 * ```typescript
 * import { ChatOpenAI } from "@langchain/openai";
 *
 * const llm = new ChatOpenAI({ model: "gpt-4" });
 * const invoker = createLangChainLLMInvoker(llm);
 *
 * // Now use with Council composition patterns
 * const pipeline = roundRobin([agent1, agent2], invoker);
 * ```
 */
export const createLangChainLLMInvoker = (
  llm: LangChainLLM,
  options: LangChainLLMAdapterOptions = {}
): AgentInvoker => {
  return async (
    agent: AgentConfig,
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    invokeOptions?: { signal?: AbortSignal }
  ): Promise<AgentResponse> => {
    const startTime = Date.now();
    const traceId = crypto.randomUUID();

    try {
      // Convert messages to LangChain format
      const langChainMessages = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Invoke LangChain LLM
      const response = await llm.invoke(langChainMessages, {
        signal: invokeOptions?.signal,
      });

      const endTime = Date.now();
      const content =
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);

      // Capture trace if enabled
      if (options.enableTracing) {
        const trace: LangChainTrace = {
          id: traceId,
          type: "llm",
          input: messages,
          output: content,
          startTime,
          endTime,
          durationMs: endTime - startTime,
          usage: response.usage_metadata as LangChainTrace["usage"],
        };

        options.onTrace?.(trace);
      }

      return {
        content,
        latencyMs: endTime - startTime,
        model: agent.model,
        traceId,
        usage: response.usage_metadata as AgentResponse["usage"],
      };
    } catch (error) {
      const endTime = Date.now();

      if (options.enableTracing) {
        const trace: LangChainTrace = {
          id: traceId,
          type: "llm",
          input: messages,
          output: null,
          startTime,
          endTime,
          durationMs: endTime - startTime,
          error: error instanceof Error ? error.message : String(error),
        };

        options.onTrace?.(trace);
      }

      throw error;
    }
  };
};

// =============================================================================
// Agent Adapter
// =============================================================================

/**
 * Options for the LangChain Agent adapter.
 */
export interface LangChainAgentAdapterOptions
  extends LangChainLLMAdapterOptions {
  /** Tools available to the agent */
  tools?: LangChainTool[];
}

/**
 * Create a Council StateTransition from a LangChain Agent.
 *
 * @example
 * ```typescript
 * import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents";
 *
 * const langchainAgent = await createOpenAIFunctionsAgent({ llm, tools, prompt });
 * const executor = AgentExecutor.fromAgentAndTools({ agent: langchainAgent, tools });
 *
 * const transition = createLangChainAgentTransition(executor, {
 *   id: "researcher",
 *   name: "Research Agent",
 *   role: "researcher",
 *   model: "gpt-4"
 * });
 * ```
 */
export const createLangChainAgentTransition = <
  S extends WorkflowState = WorkflowState
>(
  agent: LangChainAgent,
  config: AgentConfig,
  options: LangChainAgentAdapterOptions = {}
): StateTransition<S> => {
  return async (state: S): Promise<Result<S>> => {
    const startTime = Date.now();
    const traceId = crypto.randomUUID();

    try {
      // Build input from state
      const lastMessage = state.history[state.history.length - 1];
      const input = lastMessage?.content || state.topic;

      // Build chat history
      const chatHistory = state.history.slice(0, -1).map((m) => ({
        role: m.agentId === config.id ? "assistant" : "user",
        content: `[${m.agentName}]: ${m.content}`,
      }));

      // Invoke LangChain agent
      const response = await agent.invoke({
        input,
        chat_history: chatHistory,
      });

      const endTime = Date.now();

      // Capture trace
      if (options.enableTracing) {
        const trace: LangChainTrace = {
          id: traceId,
          type: "agent",
          input: { input, chatHistory },
          output: response.output,
          startTime,
          endTime,
          durationMs: endTime - startTime,
        };

        options.onTrace?.(trace);
      }

      // Create message
      const message: Message = {
        id: crypto.randomUUID(),
        agentId: config.id,
        agentName: config.name,
        content: response.output,
        timestamp: Date.now(),
        metadata: {
          traceId,
          latencyMs: endTime - startTime,
          source: "langchain",
        },
      };

      return Result.ok({
        ...state,
        history: [...state.history, message],
        turnCount: state.turnCount + 1,
        traces: [
          ...state.traces,
          traceToToon({
            id: traceId,
            type: "agent",
            input,
            output: response.output,
            startTime,
            endTime,
            durationMs: endTime - startTime,
          }),
        ],
      } as S);
    } catch (error) {
      return Result.err(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  };
};

// =============================================================================
// Chain Adapter
// =============================================================================

/**
 * Create a Council StateTransition from a LangChain Chain.
 *
 * @example
 * ```typescript
 * import { LLMChain } from "langchain/chains";
 *
 * const chain = new LLMChain({ llm, prompt });
 * const transition = createLangChainChainTransition(chain, {
 *   inputKey: "topic",
 *   outputKey: "response"
 * });
 * ```
 */
export const createLangChainChainTransition = <
  S extends WorkflowState = WorkflowState
>(
  chain: LangChainChain,
  options: {
    /** Key in the chain input for the current topic/message */
    inputKey?: string;
    /** Key in the chain output for the response */
    outputKey?: string;
    /** Agent config to attribute the response to */
    agentConfig?: AgentConfig;
    /** Enable tracing */
    enableTracing?: boolean;
    /** Trace handler */
    onTrace?: (trace: LangChainTrace) => void;
  } = {}
): StateTransition<S> => {
  const {
    inputKey = "input",
    outputKey = "output",
    agentConfig = {
      id: "langchain-chain",
      name: "LangChain Chain",
      role: "chain",
      model: "unknown",
    },
    enableTracing = false,
    onTrace,
  } = options;

  return async (state: S): Promise<Result<S>> => {
    const startTime = Date.now();
    const traceId = crypto.randomUUID();

    try {
      // Build input
      const lastMessage = state.history[state.history.length - 1];
      const input = {
        [inputKey]: lastMessage?.content || state.topic,
        history: state.history
          .map((m) => `[${m.agentName}]: ${m.content}`)
          .join("\n"),
      };

      // Invoke chain
      const response = await chain.invoke(input);
      const endTime = Date.now();

      const content = String(
        response[outputKey] || response.text || JSON.stringify(response)
      );

      // Capture trace
      if (enableTracing) {
        const trace: LangChainTrace = {
          id: traceId,
          type: "chain",
          input,
          output: content,
          startTime,
          endTime,
          durationMs: endTime - startTime,
        };

        onTrace?.(trace);
      }

      // Create message
      const message: Message = {
        id: crypto.randomUUID(),
        agentId: agentConfig.id,
        agentName: agentConfig.name,
        content,
        timestamp: Date.now(),
        metadata: {
          traceId,
          latencyMs: endTime - startTime,
          source: "langchain-chain",
        },
      };

      return Result.ok({
        ...state,
        history: [...state.history, message],
        turnCount: state.turnCount + 1,
      } as S);
    } catch (error) {
      return Result.err(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  };
};

// =============================================================================
// Tool Adapter
// =============================================================================

/**
 * Wrap Council agent as a LangChain Tool.
 * Enables LangChain agents to call Council agents as tools.
 *
 * @example
 * ```typescript
 * const councilTool = createCouncilTool(
 *   "council_deliberate",
 *   "Use the Council to deliberate on complex decisions",
 *   councilPipeline
 * );
 *
 * // Add to LangChain agent's tools
 * const agent = await createOpenAIFunctionsAgent({ llm, tools: [councilTool, ...otherTools] });
 * ```
 */
export const createCouncilTool = <S extends WorkflowState>(
  name: string,
  description: string,
  transition: StateTransition<S>,
  createInitialState: (input: string) => S
): LangChainTool => {
  return {
    name,
    description,
    invoke: async (input: string): Promise<string> => {
      const initialState = createInitialState(input);
      const result = await transition(initialState);

      if (!result.ok) {
        return `Error: ${result.error.message}`;
      }

      // Return the last message content
      const lastMessage = result.value.history[result.value.history.length - 1];
      return lastMessage?.content || "No response generated";
    },
  };
};
