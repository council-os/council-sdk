// ── Option types ──────────────────────────────────────────────────────────────

export interface CouncilErrorOptions {
  code?: string;
  statusCode?: number;
  requestId?: string;
  details?: Record<string, unknown>;
}

type BaseOptions = Pick<CouncilErrorOptions, "requestId" | "details">;

// ── Error Hierarchy ───────────────────────────────────────────────────────────

export class CouncilError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly requestId?: string;
  public readonly details: Record<string, unknown>;

  constructor(message: string, options: CouncilErrorOptions = {}) {
    super(message);
    this.name = "CouncilError";
    this.code = options.code ?? "council_error";
    this.statusCode = options.statusCode;
    this.requestId = options.requestId;
    this.details = options.details ?? {};
  }
}

export class AuthenticationError extends CouncilError {
  constructor(message = "Authentication failed", options: BaseOptions = {}) {
    super(message, {
      ...options,
      code: "authentication_error",
      statusCode: 401,
    });
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends CouncilError {
  constructor(message = "Authorization failed", options: BaseOptions = {}) {
    super(message, {
      ...options,
      code: "authorization_error",
      statusCode: 403,
    });
    this.name = "AuthorizationError";
  }
}

export class ValidationError extends CouncilError {
  public readonly field?: string;

  constructor(
    message = "Validation failed",
    options: BaseOptions & { field?: string } = {},
  ) {
    super(message, { ...options, code: "validation_error", statusCode: 400 });
    this.name = "ValidationError";
    this.field = options.field;
  }
}

export class NotFoundError extends CouncilError {
  constructor(message = "Resource not found", options: BaseOptions = {}) {
    super(message, { ...options, code: "not_found", statusCode: 404 });
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends CouncilError {
  public readonly retryAfter: number;

  constructor(
    message = "Rate limit exceeded",
    options: BaseOptions & { retryAfter?: number } = {},
  ) {
    super(message, {
      ...options,
      code: "rate_limit_exceeded",
      statusCode: 429,
    });
    this.name = "RateLimitError";
    this.retryAfter = options.retryAfter ?? 0;
  }
}

export class JuryDeniedError extends CouncilError {
  public readonly reasoning: string;
  public readonly votes: Record<string, unknown>[];

  constructor(
    message = "Jury denied the action",
    options: BaseOptions & {
      reasoning?: string;
      votes?: Record<string, unknown>[];
      statusCode?: number;
    } = {},
  ) {
    super(message, { ...options, code: "jury_denied" });
    this.name = "JuryDeniedError";
    this.reasoning = options.reasoning ?? "";
    this.votes = options.votes ?? [];
  }
}

export class JuryTimeoutError extends CouncilError {
  constructor(
    message = "Jury deliberation timed out",
    options: BaseOptions = {},
  ) {
    super(message, { ...options, code: "jury_timeout", statusCode: 408 });
    this.name = "JuryTimeoutError";
  }
}

export class SandboxError extends CouncilError {
  constructor(message = "Sandbox execution failed", options: BaseOptions = {}) {
    super(message, { ...options, code: "sandbox_error", statusCode: 500 });
    this.name = "SandboxError";
  }
}

export class SandboxTimeoutError extends SandboxError {
  constructor(
    message = "Sandbox execution timed out",
    options: BaseOptions = {},
  ) {
    super(message, options);
    this.name = "SandboxTimeoutError";
    (this as { code: string }).code = "sandbox_timeout";
  }
}

export class SandboxMemoryError extends SandboxError {
  constructor(
    message = "Sandbox memory limit exceeded",
    options: BaseOptions = {},
  ) {
    super(message, options);
    this.name = "SandboxMemoryError";
    (this as { code: string }).code = "sandbox_memory";
  }
}

export class NetworkError extends CouncilError {
  constructor(
    message = "Network error",
    options: BaseOptions & { statusCode?: number } = {},
  ) {
    super(message, { ...options, code: "network_error" });
    this.name = "NetworkError";
  }
}

// ── Type Guard ────────────────────────────────────────────────────────────────

export function isCouncilError(error: unknown): error is CouncilError {
  return error instanceof CouncilError;
}

// ── Error mapping from HTTP responses ─────────────────────────────────────────

const STATUS_ERROR_MAP: Record<number, typeof CouncilError> = {
  400: ValidationError,
  401: AuthenticationError,
  403: AuthorizationError,
  404: NotFoundError,
  429: RateLimitError,
};

export function raiseForStatus(
  statusCode: number,
  body: Record<string, unknown>,
): never {
  const errorData = body.error ?? body;
  const message =
    typeof errorData === "string"
      ? errorData
      : ((errorData as Record<string, unknown>)?.message ??
        JSON.stringify(errorData));

  const requestId = (body.request_id ?? body.requestId) as string | undefined;
  const details =
    typeof errorData === "object" && errorData !== null
      ? (((errorData as Record<string, unknown>).details as Record<
          string,
          unknown
        >) ?? {})
      : {};

  const ErrorClass = STATUS_ERROR_MAP[statusCode] ?? CouncilError;

  if (ErrorClass === RateLimitError) {
    const retryAfter = Number(body.retry_after ?? body.retryAfter ?? 0);
    throw new RateLimitError(String(message), {
      retryAfter,
      requestId,
      details,
    });
  }

  if (ErrorClass === ValidationError) {
    const field =
      Array.isArray(details) && details.length > 0
        ? ((details[0] as Record<string, unknown>)?.field as string)
        : typeof details === "object"
          ? ((details as Record<string, unknown>)?.field as string)
          : undefined;
    throw new ValidationError(String(message), { field, requestId, details });
  }

  throw new ErrorClass(String(message), { statusCode, requestId, details });
}
