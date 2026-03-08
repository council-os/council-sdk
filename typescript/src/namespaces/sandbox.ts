import { Transport } from "../transport.js";
import type { ExecuteCodeOptions, ExecutionResult, Runtime } from "../types.js";

/**
 * Sandbox namespace — execute code in isolated environments.
 */
export class SandboxNamespace {
  constructor(private transport: Transport) {}

  /**
   * Execute code in an isolated sandbox.
   */
  async execute(options: ExecuteCodeOptions): Promise<ExecutionResult> {
    const body: Record<string, unknown> = {
      code: options.code,
      runtime: options.runtime ?? "python",
      timeoutMs: options.timeoutMs ?? 5000,
      memoryMb: options.memoryMb ?? 256,
    };
    if (options.files) body.files = options.files;
    if (options.env) body.env = options.env;
    if (options.agentId) body.agentId = options.agentId;

    const resp = await this.transport.post("/api/tools/execute", {
      json: body,
    });
    return parseExecutionResult((resp.data ?? resp) as Record<string, unknown>);
  }

  /**
   * Get a previous execution result by ID.
   */
  async get(executionId: string): Promise<ExecutionResult> {
    const resp = await this.transport.get(
      `/api/tools/executions/${executionId}`,
    );
    return parseExecutionResult((resp.data ?? resp) as Record<string, unknown>);
  }

  /**
   * List recent code executions.
   */
  async *list(
    options: {
      runtime?: string | Runtime;
      since?: string;
      limit?: number;
    } = {},
  ): AsyncIterableIterator<ExecutionResult> {
    const params: Record<string, unknown> = { limit: options.limit ?? 50 };
    if (options.runtime) params.runtime = options.runtime;
    if (options.since) params.since = options.since;

    const resp = await this.transport.get("/api/tools/executions", { params });
    const data = resp.data;
    const items = Array.isArray(data) ? data : [data];

    for (const item of items) {
      yield parseExecutionResult(item as Record<string, unknown>);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseExecutionResult(data: Record<string, unknown>): ExecutionResult {
  return {
    id: String(data.id ?? ""),
    stdout: String(data.stdout ?? data.output ?? ""),
    stderr: String(data.stderr ?? ""),
    exitCode: (data.exitCode ?? data.exit_code ?? 0) as number,
    executionTimeMs: (data.executionTimeMs ??
      data.execution_time_ms ??
      0) as number,
    memoryUsedMb: (data.memoryUsedMb ?? data.memory_used_mb ?? 0) as number,
    createdAt: data.createdAt ? new Date(data.createdAt as string) : undefined,
  };
}
