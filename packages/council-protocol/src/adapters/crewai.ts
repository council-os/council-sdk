/**
 * @council/protocol - CrewAI Adapter
 *
 * Wrap CrewAI agents and crews as Council StateTransition morphisms.
 * Enables Council to orchestrate CrewAI-based agent teams while
 * capturing traces in TOON format.
 */

import {
  AgentConfig,
  Message,
  Result,
  StateTransition,
  TOON,
  WorkflowState,
} from "../core";

// =============================================================================
// CrewAI Type Definitions (for compatibility without hard dependency)
// =============================================================================

/**
 * Minimal interface for CrewAI Agent.
 */
export interface CrewAIAgent {
  role: string;
  goal: string;
  backstory?: string;
  verbose?: boolean;
  allow_delegation?: boolean;
  tools?: CrewAITool[];
}

/**
 * Minimal interface for CrewAI Task.
 */
export interface CrewAITask {
  description: string;
  agent: CrewAIAgent;
  expected_output?: string;
  context?: CrewAITask[];
}

/**
 * Minimal interface for CrewAI Tool.
 */
export interface CrewAITool {
  name: string;
  description: string;
  func: (input: string) => Promise<string>;
}

/**
 * Minimal interface for CrewAI Crew.
 */
export interface CrewAICrew {
  agents: CrewAIAgent[];
  tasks: CrewAITask[];
  verbose?: boolean;
  kickoff(inputs?: Record<string, unknown>): Promise<CrewAICrewOutput>;
}

/**
 * Output from a CrewAI Crew execution.
 */
export interface CrewAICrewOutput {
  raw: string;
  tasks_output: Array<{
    description: string;
    summary: string;
    raw: string;
    agent: string;
  }>;
}

// =============================================================================
// Trace Capture
// =============================================================================

/**
 * A trace entry from a CrewAI invocation.
 */
export interface CrewAITrace {
  /** Unique trace ID */
  id: string;
  /** Type of CrewAI component */
  type: "agent" | "task" | "crew" | "tool";
  /** Agent role if applicable */
  role?: string;
  /** Task description if applicable */
  task?: string;
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
  /** Error if failed */
  error?: string;
  /** Nested traces for crews */
  children?: CrewAITrace[];
}

/**
 * Convert a CrewAI trace to TOON format for token-efficient storage.
 */
export const traceToToon = (trace: CrewAITrace): string => {
  return TOON.encode({
    id: trace.id,
    type: trace.type,
    role: trace.role || "",
    duration: String(trace.durationMs),
    status: trace.error ? "error" : "ok",
  });
};

// =============================================================================
// Agent Configuration Conversion
// =============================================================================

/**
 * Convert a Council AgentConfig to a CrewAI Agent.
 *
 * @example
 * ```typescript
 * const councilAgent: AgentConfig = {
 *   id: "researcher",
 *   name: "Research Agent",
 *   role: "researcher",
 *   model: "gpt-4",
 *   systemPrompt: "You are a thorough researcher..."
 * };
 *
 * const crewAgent = councilToCrewAIAgent(councilAgent);
 * ```
 */
export const councilToCrewAIAgent = (
  config: AgentConfig,
  options: {
    tools?: CrewAITool[];
    allowDelegation?: boolean;
    verbose?: boolean;
  } = {}
): CrewAIAgent => {
  return {
    role: config.role,
    goal: config.systemPrompt || `Act as ${config.name} in the deliberation`,
    backstory: `You are ${config.name}. ${config.systemPrompt || ""}`,
    verbose: options.verbose ?? false,
    allow_delegation: options.allowDelegation ?? false,
    tools: options.tools,
  };
};

/**
 * Convert a CrewAI Agent to a Council AgentConfig.
 *
 * @example
 * ```typescript
 * const crewAgent: CrewAIAgent = {
 *   role: "researcher",
 *   goal: "Find relevant information",
 *   backstory: "You are an expert researcher..."
 * };
 *
 * const councilAgent = crewAIToCouncilAgent(crewAgent, "gpt-4");
 * ```
 */
export const crewAIToCouncilAgent = (
  agent: CrewAIAgent,
  model: string
): AgentConfig => {
  return {
    id: agent.role.toLowerCase().replace(/\s+/g, "-"),
    name: agent.role,
    role: agent.role,
    model,
    systemPrompt: `${agent.goal}\n\n${agent.backstory || ""}`.trim(),
  };
};

// =============================================================================
// Crew Adapter
// =============================================================================

/**
 * Options for the CrewAI Crew adapter.
 */
export interface CrewAIAdapterOptions {
  /** Enable trace capture */
  enableTracing?: boolean;
  /** Custom trace handler */
  onTrace?: (trace: CrewAITrace) => void;
  /** Model to use for converted agents */
  model?: string;
}

/**
 * Create a Council StateTransition from a CrewAI Crew.
 *
 * @example
 * ```typescript
 * const crew = new Crew({
 *   agents: [researchAgent, writerAgent],
 *   tasks: [researchTask, writeTask]
 * });
 *
 * const transition = createCrewAICrewTransition(crew, {
 *   enableTracing: true,
 *   onTrace: (trace) => console.log(trace)
 * });
 *
 * // Use in Council pipeline
 * const pipeline = StateMachine.compose(
 *   initialSetup,
 *   transition,
 *   finalSynthesis
 * );
 * ```
 */
export const createCrewAICrewTransition = <
  S extends WorkflowState = WorkflowState
>(
  crew: CrewAICrew,
  options: CrewAIAdapterOptions = {}
): StateTransition<S> => {
  return async (state: S): Promise<Result<S>> => {
    const startTime = Date.now();
    const traceId = crypto.randomUUID();

    try {
      // Build input from state
      const lastMessage = state.history[state.history.length - 1];
      const input = {
        topic: state.topic,
        context: lastMessage?.content || "",
        history: state.history
          .map((m) => `[${m.agentName}]: ${m.content}`)
          .join("\n\n"),
      };

      // Execute crew
      const output = await crew.kickoff(input);
      const endTime = Date.now();

      // Capture trace
      if (options.enableTracing) {
        const trace: CrewAITrace = {
          id: traceId,
          type: "crew",
          input,
          output: output.raw,
          startTime,
          endTime,
          durationMs: endTime - startTime,
          children: output.tasks_output.map((task, i) => ({
            id: `${traceId}-task-${i}`,
            type: "task" as const,
            role: task.agent,
            task: task.description,
            input: task.description,
            output: task.raw,
            startTime,
            endTime,
            durationMs: 0, // CrewAI doesn't provide per-task timing
          })),
        };

        options.onTrace?.(trace);
      }

      // Create messages for each task output
      const newMessages: Message[] = output.tasks_output.map((task, i) => ({
        id: crypto.randomUUID(),
        agentId: task.agent.toLowerCase().replace(/\s+/g, "-"),
        agentName: task.agent,
        content: task.raw,
        timestamp: Date.now() + i, // Preserve order
        metadata: {
          traceId,
          source: "crewai",
          taskDescription: task.description,
        },
      }));

      // Add final crew output as synthesis
      newMessages.push({
        id: crypto.randomUUID(),
        agentId: "crewai-synthesis",
        agentName: "CrewAI Synthesis",
        content: output.raw,
        timestamp: Date.now() + output.tasks_output.length,
        role: "synthesis",
        metadata: {
          traceId,
          source: "crewai",
          latencyMs: endTime - startTime,
        },
      });

      return Result.ok({
        ...state,
        history: [...state.history, ...newMessages],
        turnCount: state.turnCount + newMessages.length,
        traces: [
          ...state.traces,
          traceToToon({
            id: traceId,
            type: "crew",
            input,
            output: output.raw,
            startTime,
            endTime,
            durationMs: endTime - startTime,
          }),
        ],
      } as S);
    } catch (error) {
      const endTime = Date.now();

      if (options.enableTracing) {
        const trace: CrewAITrace = {
          id: traceId,
          type: "crew",
          input: state.topic,
          output: null,
          startTime,
          endTime,
          durationMs: endTime - startTime,
          error: error instanceof Error ? error.message : String(error),
        };

        options.onTrace?.(trace);
      }

      return Result.err(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  };
};

// =============================================================================
// Task Adapter
// =============================================================================

/**
 * Create a CrewAI Task from a Council workflow step.
 *
 * @example
 * ```typescript
 * const task = createCrewAITask(
 *   "Research the topic thoroughly",
 *   researchAgent,
 *   "A comprehensive research report"
 * );
 * ```
 */
export const createCrewAITask = (
  description: string,
  agent: CrewAIAgent,
  expectedOutput?: string,
  context?: CrewAITask[]
): CrewAITask => {
  return {
    description,
    agent,
    expected_output: expectedOutput,
    context,
  };
};

// =============================================================================
// Tool Adapter
// =============================================================================

/**
 * Wrap a Council StateTransition as a CrewAI Tool.
 * Enables CrewAI agents to invoke Council pipelines as tools.
 *
 * @example
 * ```typescript
 * const councilTool = createCouncilTool(
 *   "council_deliberate",
 *   "Use the Council to deliberate on complex decisions",
 *   councilPipeline
 * );
 *
 * const agent: CrewAIAgent = {
 *   role: "Decision Maker",
 *   goal: "Make well-reasoned decisions",
 *   tools: [councilTool]
 * };
 * ```
 */
export const createCouncilTool = <S extends WorkflowState>(
  name: string,
  description: string,
  transition: StateTransition<S>,
  createInitialState: (input: string) => S
): CrewAITool => {
  return {
    name,
    description,
    func: async (input: string): Promise<string> => {
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

// =============================================================================
// Crew Builder
// =============================================================================

/**
 * Builder for creating CrewAI-style workflows from Council agents.
 *
 * @example
 * ```typescript
 * const workflow = new CouncilCrewBuilder()
 *   .addAgent(researcherConfig, ["search", "summarize"])
 *   .addAgent(writerConfig, ["write"])
 *   .addTask("Research the topic", "researcher")
 *   .addTask("Write the report", "writer", ["Research the topic"])
 *   .build();
 *
 * const result = await workflow(initialState);
 * ```
 */
export class CouncilCrewBuilder<S extends WorkflowState = WorkflowState> {
  private agents: Map<string, { config: AgentConfig; tools: CrewAITool[] }> =
    new Map();
  private tasks: Array<{
    description: string;
    agentId: string;
    expectedOutput?: string;
    dependsOn: string[];
  }> = [];

  /**
   * Add an agent to the crew.
   */
  addAgent(
    config: AgentConfig,
    tools: CrewAITool[] = []
  ): CouncilCrewBuilder<S> {
    this.agents.set(config.id, { config, tools });
    return this;
  }

  /**
   * Add a task to the crew.
   */
  addTask(
    description: string,
    agentId: string,
    dependsOn: string[] = [],
    expectedOutput?: string
  ): CouncilCrewBuilder<S> {
    this.tasks.push({ description, agentId, dependsOn, expectedOutput });
    return this;
  }

  /**
   * Build the crew as a Council StateTransition.
   */
  build(
    invoker: (
      agent: AgentConfig,
      messages: Array<{ role: string; content: string }>
    ) => Promise<{ content: string }>
  ): StateTransition<S> {
    const agents = this.agents;
    const tasks = this.tasks;

    return async (state: S): Promise<Result<S>> => {
      let currentState = state;
      const completedTasks = new Map<string, string>();

      // Execute tasks in dependency order
      for (const task of tasks) {
        // Check dependencies
        const dependencyOutputs: string[] = [];
        for (const dep of task.dependsOn) {
          const output = completedTasks.get(dep);
          if (!output) {
            return Result.err(
              new Error(
                `Dependency not met: ${dep} for task "${task.description}"`
              )
            );
          }
          dependencyOutputs.push(output);
        }

        // Get agent
        const agentData = agents.get(task.agentId);
        if (!agentData) {
          return Result.err(new Error(`Agent not found: ${task.agentId}`));
        }

        // Build context
        const context = [
          { role: "system", content: agentData.config.systemPrompt || "" },
          ...currentState.history.map((m) => ({
            role: m.agentId === task.agentId ? "assistant" : "user",
            content: `[${m.agentName}]: ${m.content}`,
          })),
          {
            role: "user",
            content: `Task: ${task.description}\n\n${
              dependencyOutputs.length > 0
                ? `Context from previous tasks:\n${dependencyOutputs.join(
                    "\n\n"
                  )}`
                : ""
            }`,
          },
        ];

        // Execute
        try {
          const response = await invoker(agentData.config, context);

          // Create message
          const message: Message = {
            id: crypto.randomUUID(),
            agentId: agentData.config.id,
            agentName: agentData.config.name,
            content: response.content,
            timestamp: Date.now(),
            metadata: { task: task.description },
          };

          currentState = {
            ...currentState,
            history: [...currentState.history, message],
            turnCount: currentState.turnCount + 1,
          } as S;

          completedTasks.set(task.description, response.content);
        } catch (error) {
          return Result.err(
            error instanceof Error ? error : new Error(String(error))
          );
        }
      }

      return Result.ok(currentState);
    };
  }
}
