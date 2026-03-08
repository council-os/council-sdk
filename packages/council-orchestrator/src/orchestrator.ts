/**
 * @council/orchestrator - Core Orchestrator
 *
 * The scalable multi-agent orchestrator with governance capabilities.
 * This is the runtime that executes Council workflows.
 */

import {
  AgentConfig,
  AgentInvoker,
  Message,
  Result,
  StateMachine,
  StateTransition,
  WorkflowState,
  createAgentTransition,
} from "@council/protocol";

// =============================================================================
// Session State (Extended WorkflowState)
// =============================================================================

/**
 * Status of a session.
 */
export type SessionStatus =
  | "pending"
  | "active"
  | "paused"
  | "completed"
  | "failed";

/**
 * Mode of operation.
 */
export type SessionMode = "lab" | "arena" | "debate";

/**
 * Cost tracking for a session.
 */
export interface SessionCost {
  /** Total cost in USD */
  totalCostUSD: number;
  /** Total tokens used */
  totalTokens: number;
  /** Number of requests */
  requestCount: number;
  /** Cost breakdown by agent */
  byAgent: Record<
    string,
    {
      costUSD: number;
      tokens: number;
      requests: number;
    }
  >;
}

/**
 * Extended session state with orchestrator-specific fields.
 */
export interface SessionState extends WorkflowState {
  /** Session mode */
  mode: SessionMode;
  /** Cost tracking */
  cost: SessionCost;
  /** Created timestamp */
  createdAt: number;
  /** Owner user ID */
  ownerId?: string;
  /** Owner display name */
  ownerName?: string;
  /** Visibility */
  visibility: "public" | "private";
  /** Turn delay in ms */
  turnDelayMs?: number;
  /** View count */
  viewCount?: number;
  /** Fork count */
  forkCount?: number;
}

/**
 * Configuration for creating a new session.
 */
export interface SessionConfig {
  /** Agents participating */
  agents: AgentConfig[];
  /** Maximum turns */
  maxTurns?: number;
  /** Session mode */
  mode?: SessionMode;
  /** Initial visibility */
  visibility?: "public" | "private";
  /** Delay between turns in ms */
  turnDelayMs?: number;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Session Factory
// =============================================================================

/**
 * Create a new session state.
 */
export const createSession = (
  topic: string,
  config: SessionConfig,
  owner?: { userId: string; userName: string }
): SessionState => {
  return {
    id: crypto.randomUUID(),
    status: "pending",
    topic,
    agents: config.agents,
    history: [],
    turnCount: 0,
    maxTurns: config.maxTurns ?? 20,
    traces: [],
    mode: config.mode ?? "lab",
    cost: {
      totalCostUSD: 0,
      totalTokens: 0,
      requestCount: 0,
      byAgent: {},
    },
    createdAt: Date.now(),
    ownerId: owner?.userId,
    ownerName: owner?.userName,
    visibility: config.visibility ?? "private",
    turnDelayMs: config.turnDelayMs ?? 0,
    metadata: config.metadata,
  };
};

// =============================================================================
// Orchestrator Events
// =============================================================================

/**
 * Events emitted by the orchestrator.
 */
export type OrchestratorEvent =
  | { type: "session:started"; sessionId: string; state: SessionState }
  | { type: "session:paused"; sessionId: string }
  | { type: "session:resumed"; sessionId: string }
  | { type: "session:completed"; sessionId: string; state: SessionState }
  | { type: "session:failed"; sessionId: string; error: Error }
  | {
      type: "turn:started";
      sessionId: string;
      agent: AgentConfig;
      turn: number;
    }
  | {
      type: "turn:completed";
      sessionId: string;
      message: Message;
      turn: number;
    }
  | { type: "message"; sessionId: string; message: Message };

/**
 * Event handler type.
 */
export type OrchestratorEventHandler = (event: OrchestratorEvent) => void;

// =============================================================================
// Orchestrator Hooks
// =============================================================================

/**
 * Lifecycle hooks for customizing orchestrator behavior.
 */
export interface OrchestratorHooks {
  /** Called before each turn */
  beforeTurn?: (state: SessionState, agent: AgentConfig) => Promise<void>;
  /** Called after each turn */
  afterTurn?: (state: SessionState, message: Message) => Promise<void>;
  /** Called when session starts */
  onSessionStart?: (state: SessionState) => Promise<void>;
  /** Called when session ends */
  onSessionEnd?: (state: SessionState) => Promise<void>;
  /** Persistence hook - save state */
  persist?: (state: SessionState) => Promise<void>;
  /** Broadcast hook - send updates */
  broadcast?: (sessionId: string, message: Message) => Promise<void>;
}

// =============================================================================
// Scalable Orchestrator
// =============================================================================

/**
 * Configuration for the orchestrator.
 */
export interface OrchestratorConfig {
  /** Agent invoker function */
  invoker: AgentInvoker;
  /** Lifecycle hooks */
  hooks?: OrchestratorHooks;
  /** Default turn delay */
  defaultTurnDelayMs?: number;
  /** Enable graceful shutdown */
  gracefulShutdown?: boolean;
}

/**
 * The Scalable Orchestrator - runtime for executing multi-agent sessions.
 *
 * @example
 * ```typescript
 * const orchestrator = new ScalableOrchestrator({
 *   invoker: openRouterInvoker,
 *   hooks: {
 *     persist: async (state) => await db.sessions.save(state),
 *     broadcast: async (id, msg) => await ws.broadcast(id, msg)
 *   }
 * });
 *
 * const sessionId = await orchestrator.startSession("What is consciousness?", {
 *   agents: [philosopher, scientist, mystic],
 *   maxTurns: 15
 * });
 *
 * // Later...
 * orchestrator.pauseSession(sessionId);
 * orchestrator.resumeSession(sessionId);
 * orchestrator.stopSession(sessionId);
 * ```
 */
export class ScalableOrchestrator {
  private sessions: Map<string, SessionState> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private eventHandlers: Set<OrchestratorEventHandler> = new Set();
  private isShuttingDown = false;

  constructor(private config: OrchestratorConfig) {}

  // ===========================================================================
  // Event System
  // ===========================================================================

  /**
   * Subscribe to orchestrator events.
   */
  on(handler: OrchestratorEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: OrchestratorEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error("Event handler error:", error);
      }
    }
  }

  // ===========================================================================
  // Session Lifecycle
  // ===========================================================================

  /**
   * Start a new session.
   */
  async startSession(
    topic: string,
    config: SessionConfig,
    owner?: { userId: string; userName: string }
  ): Promise<string> {
    const state = createSession(topic, config, owner);
    state.status = "active";
    state.turnDelayMs =
      config.turnDelayMs ?? this.config.defaultTurnDelayMs ?? 0;

    this.sessions.set(state.id, state);
    this.abortControllers.set(state.id, new AbortController());

    // Notify hooks
    await this.config.hooks?.onSessionStart?.(state);

    // Emit event
    this.emit({ type: "session:started", sessionId: state.id, state });

    // Start the session loop
    this.runSessionLoop(state.id);

    return state.id;
  }

  /**
   * Pause a running session.
   */
  pauseSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "active") {
      return false;
    }

    // Abort current operation
    this.abortControllers.get(sessionId)?.abort();

    session.status = "paused";
    this.sessions.set(sessionId, session);

    this.emit({ type: "session:paused", sessionId });

    return true;
  }

  /**
   * Resume a paused session.
   */
  resumeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "paused") {
      return false;
    }

    // Create new abort controller
    this.abortControllers.set(sessionId, new AbortController());

    session.status = "active";
    this.sessions.set(sessionId, session);

    this.emit({ type: "session:resumed", sessionId });

    // Restart loop
    this.runSessionLoop(sessionId);

    return true;
  }

  /**
   * Stop a session (complete it).
   */
  async stopSession(
    sessionId: string,
    graceful: boolean = true
  ): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Abort if not graceful
    if (!graceful) {
      this.abortControllers.get(sessionId)?.abort();
    }

    session.status = "completed";
    this.sessions.set(sessionId, session);

    // Notify hooks
    await this.config.hooks?.onSessionEnd?.(session);

    // Persist final state
    await this.config.hooks?.persist?.(session);

    this.emit({ type: "session:completed", sessionId, state: session });

    // Cleanup
    this.abortControllers.delete(sessionId);

    return true;
  }

  /**
   * Get session state.
   */
  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all sessions.
   */
  listSessions(filter?: {
    mode?: SessionMode;
    status?: SessionStatus;
  }): SessionState[] {
    let sessions = Array.from(this.sessions.values());

    if (filter?.mode) {
      sessions = sessions.filter((s) => s.mode === filter.mode);
    }
    if (filter?.status) {
      sessions = sessions.filter((s) => s.status === filter.status);
    }

    return sessions;
  }

  /**
   * Graceful shutdown.
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Abort all sessions
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }

    // Pause all active sessions
    for (const [_sessionId, session] of this.sessions) {
      if (session.status === "active") {
        session.status = "paused";
        await this.config.hooks?.persist?.(session);
      }
    }
  }

  // ===========================================================================
  // Session Loop
  // ===========================================================================

  private async runSessionLoop(sessionId: string): Promise<void> {
    let session = this.sessions.get(sessionId);
    if (!session) return;

    const abortController = this.abortControllers.get(sessionId);

    while (
      session.status === "active" &&
      session.turnCount < session.maxTurns
    ) {
      // Check for abort
      if (abortController?.signal.aborted || this.isShuttingDown) {
        break;
      }

      // Determine current agent
      const agentIndex = session.turnCount % session.agents.length;
      const agent = session.agents[agentIndex];

      // Emit turn started
      this.emit({
        type: "turn:started",
        sessionId,
        agent,
        turn: session.turnCount,
      });

      // Before turn hook
      await this.config.hooks?.beforeTurn?.(session, agent);

      // Create and execute transition
      const transition = createAgentTransition(agent, this.config.invoker);
      const result = await transition(session);

      if (!result.ok) {
        session.status = "failed";
        this.sessions.set(sessionId, session);
        this.emit({
          type: "session:failed",
          sessionId,
          error: result.error,
        });
        break;
      }

      session = result.value as SessionState;
      this.sessions.set(sessionId, session);

      // Get the new message
      const message = session.history[session.history.length - 1];

      // After turn hook
      await this.config.hooks?.afterTurn?.(session, message);

      // Broadcast
      await this.config.hooks?.broadcast?.(sessionId, message);

      // Persist
      await this.config.hooks?.persist?.(session);

      // Emit turn completed
      this.emit({
        type: "turn:completed",
        sessionId,
        message,
        turn: session.turnCount,
      });

      // Emit message
      this.emit({ type: "message", sessionId, message });

      // Delay between turns
      if (session.turnDelayMs && session.turnDelayMs > 0) {
        await this.interruptibleDelay(sessionId, session.turnDelayMs);
      }

      // Re-fetch session in case it was modified
      session = this.sessions.get(sessionId) || session;
    }

    // Session complete
    if (session.status === "active" && session.turnCount >= session.maxTurns) {
      session.status = "completed";
      this.sessions.set(sessionId, session);

      await this.config.hooks?.onSessionEnd?.(session);
      await this.config.hooks?.persist?.(session);

      this.emit({ type: "session:completed", sessionId, state: session });
    }
  }

  private interruptibleDelay(
    sessionId: string,
    ms: number
  ): Promise<void> {
    const controller = this.abortControllers.get(sessionId);
    if (!controller || controller.signal.aborted) return Promise.resolve();

    return new Promise<void>((resolve) => {
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        controller.signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}

// =============================================================================
// Utility Transitions
// =============================================================================

/**
 * Create a persistence transition.
 */
export const createPersistTransition = (
  persist: (state: SessionState) => Promise<void>
): StateTransition<SessionState> => {
  return async (state) => {
    try {
      await persist(state);
      return Result.ok(state);
    } catch (error) {
      // Log but don't fail
      console.error("Persistence failed:", error);
      return Result.ok(state);
    }
  };
};

/**
 * Create a broadcast transition.
 */
export const createBroadcastTransition = (
  broadcast: (sessionId: string, message: Message) => Promise<void>
): StateTransition<SessionState> => {
  return async (state) => {
    const lastMessage = state.history[state.history.length - 1];
    if (lastMessage) {
      await broadcast(state.id, lastMessage);
    }
    return Result.ok(state);
  };
};

/**
 * Create a cost tracking transition.
 */
export const createCostTrackingTransition = (costPerToken: {
  prompt: number;
  completion: number;
}): StateTransition<SessionState> => {
  return async (state) => {
    const lastMessage = state.history[state.history.length - 1];
    if (!lastMessage?.metadata?.usage) {
      return Result.ok(state);
    }

    const usage = lastMessage.metadata.usage as {
      promptTokens: number;
      completionTokens: number;
    };

    const cost =
      usage.promptTokens * costPerToken.prompt +
      usage.completionTokens * costPerToken.completion;

    const agentId = lastMessage.agentId;
    const existingAgentCost = state.cost.byAgent[agentId] || {
      costUSD: 0,
      tokens: 0,
      requests: 0,
    };

    return Result.ok({
      ...state,
      cost: {
        totalCostUSD: state.cost.totalCostUSD + cost,
        totalTokens:
          state.cost.totalTokens + usage.promptTokens + usage.completionTokens,
        requestCount: state.cost.requestCount + 1,
        byAgent: {
          ...state.cost.byAgent,
          [agentId]: {
            costUSD: existingAgentCost.costUSD + cost,
            tokens:
              existingAgentCost.tokens +
              usage.promptTokens +
              usage.completionTokens,
            requests: existingAgentCost.requests + 1,
          },
        },
      },
    });
  };
};

// =============================================================================
// Pipeline Builders
// =============================================================================

/**
 * Build a standard turn pipeline with persistence and broadcast.
 */
export const buildTurnPipeline = (
  invoker: AgentInvoker,
  agent: AgentConfig,
  options: {
    persist?: (state: SessionState) => Promise<void>;
    broadcast?: (sessionId: string, message: Message) => Promise<void>;
    costPerToken?: { prompt: number; completion: number };
  } = {}
): StateTransition<SessionState> => {
  const transitions: StateTransition<SessionState>[] = [
    createAgentTransition(agent, invoker),
  ];

  if (options.costPerToken) {
    transitions.push(createCostTrackingTransition(options.costPerToken));
  }

  if (options.persist) {
    transitions.push(createPersistTransition(options.persist));
  }

  if (options.broadcast) {
    transitions.push(createBroadcastTransition(options.broadcast));
  }

  return StateMachine.compose(...transitions);
};
