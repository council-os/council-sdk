/**
 * @council/protocol - Core Types
 *
 * Foundational type definitions for multi-agent orchestration.
 * These types represent the categorical abstractions that enable
 * composable, type-safe agent workflows.
 */

// =============================================================================
// Result Monad - Handling Success/Failure Without Exceptions
// =============================================================================

/**
 * A discriminated union representing success or failure.
 * Equivalent to the 'Either' monad in Haskell, but with ergonomic TypeScript patterns.
 *
 * @typeParam T - The type of the success value
 * @typeParam E - The type of the error (defaults to Error)
 *
 * @example
 * ```typescript
 * const success: Result<number> = { ok: true, value: 42 };
 * const failure: Result<number> = { ok: false, error: new Error("oops") };
 * ```
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Static methods for working with Result values.
 * Provides functor (map), monad (bind/flatMap), and applicative operations.
 */
export const Result = {
  /**
   * Wrap a value in a successful Result.
   */
  ok: <T>(value: T): Result<T, never> => ({ ok: true, value }),

  /**
   * Wrap an error in a failed Result.
   */
  err: <E>(error: E): Result<never, E> => ({ ok: false, error }),

  /**
   * Functor: Transform the success value, leaving errors unchanged.
   *
   * @example
   * ```typescript
   * const doubled = Result.map(Result.ok(21), x => x * 2);
   * // { ok: true, value: 42 }
   * ```
   */
  map: <T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> =>
    result.ok ? Result.ok(fn(result.value)) : result,

  /**
   * Monad: Chain operations that might fail.
   * Also known as flatMap or bind (>>=).
   *
   * @example
   * ```typescript
   * const parsed = Result.bind(
   *   readFile(path),
   *   content => parseJSON(content)
   * );
   * ```
   */
  bind: <T, U, E>(
    result: Result<T, E>,
    fn: (value: T) => Result<U, E>
  ): Result<U, E> => (result.ok ? fn(result.value) : result),

  /**
   * Extract a value from Result using pattern matching.
   */
  fold: <T, E, R>(
    result: Result<T, E>,
    onOk: (value: T) => R,
    onErr: (error: E) => R
  ): R => (result.ok ? onOk(result.value) : onErr(result.error)),

  /**
   * Transform the error value, leaving successes unchanged.
   */
  mapError: <T, E, F>(
    result: Result<T, E>,
    fn: (error: E) => F
  ): Result<T, F> => (result.ok ? result : Result.err(fn(result.error))),

  /**
   * Combine multiple Results into a single Result containing an array.
   * Short-circuits on first error.
   */
  all: <T, E>(results: Result<T, E>[]): Result<T[], E> => {
    const values: T[] = [];
    for (const result of results) {
      if (!result.ok) return result;
      values.push(result.value);
    }
    return Result.ok(values);
  },

  /**
   * Execute a function that might throw and wrap the result.
   */
  fromThrowable: <T>(fn: () => T): Result<T, Error> => {
    try {
      return Result.ok(fn());
    } catch (error) {
      return Result.err(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  },

  /**
   * Execute an async function that might throw and wrap the result.
   */
  fromPromise: async <T>(promise: Promise<T>): Promise<Result<T, Error>> => {
    try {
      return Result.ok(await promise);
    } catch (error) {
      return Result.err(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  },

  /**
   * Unwrap a Result, throwing the error if it's a failure.
   */
  unwrap: <T, E>(result: Result<T, E>): T => {
    if (result.ok) return result.value;
    throw result.error;
  },

  /**
   * Unwrap a Result with a default value for failures.
   */
  unwrapOr: <T, E>(result: Result<T, E>, defaultValue: T): T =>
    result.ok ? result.value : defaultValue,

  /**
   * Check if a Result is a success.
   */
  isOk: <T, E>(result: Result<T, E>): result is { ok: true; value: T } =>
    result.ok,

  /**
   * Check if a Result is a failure.
   */
  isErr: <T, E>(result: Result<T, E>): result is { ok: false; error: E } =>
    !result.ok,
} as const;

// =============================================================================
// State Transitions - The Core Morphism Type
// =============================================================================

/**
 * A state transition function representing an asynchronous operation
 * that transforms state and might fail.
 *
 * This is the fundamental building block for agent workflows.
 * In category theory terms, this is a Kleisli arrow in the
 * category of async Result-returning functions.
 *
 * @typeParam S - The state type
 * @typeParam E - The error type (defaults to Error)
 *
 * @example
 * ```typescript
 * const validateInput: StateTransition<AgentState> = async (state) => {
 *   if (!state.input) {
 *     return Result.err(new Error("No input provided"));
 *   }
 *   return Result.ok({ ...state, validated: true });
 * };
 * ```
 */
export type StateTransition<S, E = Error> = (state: S) => Promise<Result<S, E>>;

/**
 * Static methods for composing state transitions.
 * Provides the category structure: identity and composition.
 */
export const StateMachine = {
  /**
   * Identity morphism: A transition that does nothing.
   * This is the identity element for composition.
   */
  id:
    <S, E = Error>(): StateTransition<S, E> =>
    async (state) =>
      Result.ok(state),

  /**
   * Compose multiple transitions into a single transition.
   * Executes transitions sequentially, short-circuiting on first failure.
   *
   * This is the fundamental composition operation, analogous to
   * (.) in Haskell or >>> in arrows.
   *
   * @example
   * ```typescript
   * const pipeline = StateMachine.compose(
   *   validateInput,
   *   processWithAgent,
   *   formatOutput
   * );
   * ```
   */
  compose:
    <S, E = Error>(
      ...transitions: StateTransition<S, E>[]
    ): StateTransition<S, E> =>
    async (initialState: S) => {
      let currentState: Result<S, E> = Result.ok(initialState);

      for (const transition of transitions) {
        if (!currentState.ok) return currentState;
        currentState = await transition(currentState.value);
      }

      return currentState;
    },

  /**
   * Lift a pure synchronous function into a state transition.
   */
  lift:
    <S, E = Error>(fn: (state: S) => S): StateTransition<S, E> =>
    async (state) =>
      Result.ok(fn(state)),

  /**
   * Lift an async function that doesn't fail into a state transition.
   */
  liftAsync:
    <S, E = Error>(fn: (state: S) => Promise<S>): StateTransition<S, E> =>
    async (state) =>
      Result.ok(await fn(state)),

  /**
   * Create a conditional transition that only runs if predicate is true.
   */
  when:
    <S, E = Error>(
      predicate: (state: S) => boolean,
      transition: StateTransition<S, E>
    ): StateTransition<S, E> =>
    async (state) =>
      predicate(state) ? transition(state) : Result.ok(state),

  /**
   * Create a transition that branches based on a predicate.
   */
  branch:
    <S, E = Error>(
      predicate: (state: S) => boolean,
      onTrue: StateTransition<S, E>,
      onFalse: StateTransition<S, E>
    ): StateTransition<S, E> =>
    async (state) =>
      predicate(state) ? onTrue(state) : onFalse(state),

  /**
   * Run multiple transitions in parallel and merge results.
   * Uses a merge function to combine the parallel states.
   */
  parallel:
    <S, E = Error>(
      transitions: StateTransition<S, E>[],
      merge: (states: S[]) => S
    ): StateTransition<S, E> =>
    async (state) => {
      const results = await Promise.all(transitions.map((t) => t(state)));
      const values: S[] = [];

      for (const result of results) {
        if (!result.ok) return result;
        values.push(result.value);
      }

      return Result.ok(merge(values));
    },

  /**
   * Retry a transition up to N times on failure.
   */
  retry:
    <S, E = Error>(
      transition: StateTransition<S, E>,
      maxAttempts: number,
      delayMs: number = 0
    ): StateTransition<S, E> =>
    async (state) => {
      let lastError: E | undefined;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const result = await transition(state);
        if (result.ok) return result;

        lastError = result.error;
        if (attempt < maxAttempts - 1 && delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      return Result.err(lastError!);
    },

  /**
   * Add a timeout to a transition.
   */
  withTimeout:
    <S, E = Error>(
      transition: StateTransition<S, E>,
      timeoutMs: number,
      timeoutError: E
    ): StateTransition<S, E> =>
    async (state) => {
      const timeoutPromise = new Promise<Result<S, E>>((_, reject) =>
        setTimeout(() => reject(timeoutError), timeoutMs)
      );

      try {
        return await Promise.race([transition(state), timeoutPromise]);
      } catch (error) {
        return Result.err(error as E);
      }
    },

  /**
   * Wrap a transition with before/after hooks.
   */
  tap:
    <S, E = Error>(
      transition: StateTransition<S, E>,
      options: {
        before?: (state: S) => void | Promise<void>;
        after?: (result: Result<S, E>) => void | Promise<void>;
      }
    ): StateTransition<S, E> =>
    async (state) => {
      if (options.before) await options.before(state);
      const result = await transition(state);
      if (options.after) await options.after(result);
      return result;
    },

  /**
   * Recover from errors with a fallback transition.
   */
  recover:
    <S, E = Error>(
      transition: StateTransition<S, E>,
      fallback: (error: E, state: S) => StateTransition<S, E>
    ): StateTransition<S, E> =>
    async (state) => {
      const result = await transition(state);
      if (result.ok) return result;
      return fallback(result.error, state)(state);
    },
} as const;

// =============================================================================
// Monoid - For Composable Aggregation
// =============================================================================

/**
 * A monoid is a type with an identity element and an associative operation.
 * Used for composable aggregation of traces, logs, and metrics.
 *
 * @typeParam T - The type being aggregated
 */
export interface Monoid<T> {
  /** The identity element (empty value) */
  empty: T;
  /** Associative binary operation */
  concat: (a: T, b: T) => T;
}

/**
 * Monoid instance for string arrays (e.g., log aggregation).
 */
export const ArrayMonoid = <T>(): Monoid<T[]> => ({
  empty: [],
  concat: (a, b) => [...a, ...b],
});

/**
 * Monoid instance for strings (concatenation).
 */
export const StringMonoid: Monoid<string> = {
  empty: "",
  concat: (a, b) => a + b,
};

/**
 * Monoid instance for numbers (addition).
 */
export const SumMonoid: Monoid<number> = {
  empty: 0,
  concat: (a, b) => a + b,
};

/**
 * Monoid instance for numbers (multiplication).
 */
export const ProductMonoid: Monoid<number> = {
  empty: 1,
  concat: (a, b) => a * b,
};

/**
 * Combine all values in an array using a monoid.
 */
export const foldMonoid = <T>(monoid: Monoid<T>, values: T[]): T =>
  values.reduce(monoid.concat, monoid.empty);

// =============================================================================
// Functor - For Mapping Over Structures
// =============================================================================

/**
 * A functor is a type constructor that can be mapped over.
 * Provides structure-preserving transformations.
 *
 * @typeParam F - The container type (as a type constructor pattern)
 */
export interface Functor<T> {
  map<U>(fn: (value: T) => U): Functor<U>;
}

// =============================================================================
// Agent Types - Domain Model
// =============================================================================

/**
 * Configuration for an AI agent.
 */
export interface AgentConfig {
  /** Unique identifier for the agent */
  id: string;
  /** Human-readable name */
  name: string;
  /** Role in the council (e.g., "critic", "synthesizer") */
  role: string;
  /** AI model identifier (e.g., "gpt-4", "claude-3-opus") */
  model: string;
  /** System prompt defining agent behavior */
  systemPrompt?: string;
  /** Temperature for generation */
  temperature?: number;
  /** Maximum tokens for response */
  maxTokens?: number;
  /** Additional model-specific parameters */
  parameters?: Record<string, unknown>;
}

/**
 * A message in the council deliberation.
 */
export interface Message {
  /** Unique identifier */
  id: string;
  /** Agent that produced this message */
  agentId: string;
  /** Agent name for display */
  agentName: string;
  /** Message content */
  content: string;
  /** Unix timestamp */
  timestamp: number;
  /** Optional role annotation */
  role?: "critique" | "proposal" | "vote" | "consensus" | "synthesis";
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * The state of an agent workflow/session.
 * This is the S in StateTransition<S>.
 */
export interface WorkflowState {
  /** Unique session identifier */
  id: string;
  /** Current workflow status */
  status: "pending" | "active" | "paused" | "completed" | "failed";
  /** Topic or objective of the workflow */
  topic: string;
  /** Participating agents */
  agents: AgentConfig[];
  /** Conversation history */
  history: Message[];
  /** Current turn count */
  turnCount: number;
  /** Maximum turns allowed */
  maxTurns: number;
  /** Accumulated traces for debugging/RLHF */
  traces: string[];
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of a single agent invocation.
 */
export interface AgentResponse {
  /** The generated content */
  content: string;
  /** Usage statistics */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Cost in USD */
  cost?: number;
  /** Latency in milliseconds */
  latencyMs?: number;
  /** Model used */
  model?: string;
  /** Trace ID for debugging */
  traceId?: string;
}

// =============================================================================
// TOON Format - Token-Optimized Object Notation
// =============================================================================

// Try to load the Rust WASM implementation for ~10x faster codec performance.
// Falls back to the JS implementation if WASM is unavailable.
let wasmToonEncode: ((json: string) => string) | null = null;
let wasmToonDecode: ((toon: string) => string) | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const wasm = require("@council/native-protocol");
  if (typeof wasm.toon_encode === "function") {
    wasmToonEncode = wasm.toon_encode;
    wasmToonDecode = wasm.toon_decode;
  }
} catch {
  // WASM not available — JS fallback will be used
}

/**
 * Flatten an object for WASM encoding: stringify values, recursively
 * encode nested objects into TOON format.
 */
function flattenForToon(obj: Record<string, unknown>): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    flat[key] =
      typeof value === "object" && value !== null
        ? TOON.encode(value as Record<string, unknown>)
        : String(value);
  }
  return flat;
}

/**
 * JS fallback: encode an object to TOON format.
 */
function jsToonEncode(obj: Record<string, unknown>): string {
  const entries = Object.entries(obj)
    .map(([key, value]) => {
      const encodedValue =
        typeof value === "object" && value !== null
          ? jsToonEncode(value as Record<string, unknown>)
          : String(value);
      return `${key}:${encodedValue}`;
    })
    .join("|");
  return `{${entries}}`;
}

/**
 * JS fallback: decode a TOON string back to an object.
 */
function jsToonDecode(toon: string): Record<string, string> {
  const content = toon.slice(1, -1); // Remove { }
  const result: Record<string, string> = {};

  let current = "";
  let depth = 0;
  let key = "";

  for (const char of content) {
    if (char === "{") depth++;
    if (char === "}") depth--;

    if (char === ":" && depth === 0 && !key) {
      key = current;
      current = "";
    } else if (char === "|" && depth === 0) {
      result[key] = current;
      key = "";
      current = "";
    } else {
      current += char;
    }
  }

  if (key) result[key] = current;
  return result;
}

/**
 * TOON (Token-Optimized Object Notation) encoder/decoder.
 * Reduces token usage by ~40% compared to JSON for structured data.
 *
 * Uses Rust WASM implementation when available (~10x faster),
 * with automatic JS fallback.
 */
export const TOON = {
  /**
   * Encode an object to TOON format.
   */
  encode: (obj: Record<string, unknown>): string => {
    if (wasmToonEncode) {
      const flat = flattenForToon(obj);
      return wasmToonEncode(JSON.stringify(flat));
    }
    return jsToonEncode(obj);
  },

  /**
   * Decode a TOON string back to an object.
   */
  decode: (toon: string): Record<string, string> => {
    if (wasmToonDecode) {
      return JSON.parse(wasmToonDecode(toon));
    }
    return jsToonDecode(toon);
  },

  /** Whether the native WASM implementation is active. */
  get native(): boolean {
    return wasmToonEncode !== null;
  },
} as const;
