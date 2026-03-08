import { JuryDeniedError, JuryTimeoutError } from "../errors.js";
import { Transport } from "../transport.js";
import type {
  DeliberateOptions,
  DeliberationUpdate,
  JurorVote,
  JuryCase,
  Result,
  Verdict,
} from "../types.js";

/**
 * Jury deliberation namespace — submit cases and receive verdicts.
 */
export class JuryNamespace {
  constructor(private transport: Transport) {}

  /**
   * Submit an action for jury deliberation and await the verdict.
   * Throws JuryDeniedError if deliberation results in denial.
   */
  async deliberate(options: DeliberateOptions): Promise<Verdict> {
    const body: Record<string, unknown> = {
      action: options.action,
      context: options.context,
      riskLevel: options.riskLevel ?? "medium",
    };
    if (options.agentId) body.agentId = options.agentId;

    const resp = await this.transport.post("/api/v1/jury/cases", {
      json: body,
    });
    const caseData = (resp.data ?? resp) as Record<string, unknown>;
    const caseId = String(
      caseData.caseId ?? caseData.case_id ?? caseData.id ?? "",
    );

    // Check if deliberation result is already available
    if (caseData.deliberation && typeof caseData.deliberation === "object") {
      return parseVerdictFromDeliberation(
        caseId,
        caseData.deliberation as Record<string, unknown>,
      );
    }

    // Poll for result
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      const statusResp = await this.transport.get(
        `/api/v1/jury/cases/${caseId}/deliberation`,
      );
      const statusData = (statusResp.data ?? statusResp) as Record<
        string,
        unknown
      >;
      const status = String(statusData.status ?? "");

      if (status === "complete" || status === "completed") {
        const delib = (statusData.deliberation ?? statusData) as Record<
          string,
          unknown
        >;
        const verdict = parseVerdictFromDeliberation(caseId, delib);

        if (verdict.decision === "denied") {
          throw new JuryDeniedError(`Jury denied: ${verdict.reasoning}`, {
            reasoning: verdict.reasoning,
            votes: verdict.votes.map((v) => ({ ...v })),
          });
        }
        return verdict;
      }
    }

    throw new JuryTimeoutError(
      `Deliberation ${caseId} did not complete within timeout`,
    );
  }

  /**
   * Like deliberate(), but returns a Result instead of throwing exceptions.
   */
  async deliberateSafe(
    options: DeliberateOptions,
  ): Promise<Result<Verdict, Error>> {
    try {
      const verdict = await this.deliberate(options);
      return { ok: true, value: verdict };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Stream deliberation updates. Falls back to polling if WebSocket is unavailable.
   */
  async *deliberateStream(
    options: DeliberateOptions,
  ): AsyncIterableIterator<DeliberationUpdate> {
    const body: Record<string, unknown> = {
      action: options.action,
      context: options.context,
      riskLevel: options.riskLevel ?? "medium",
    };
    if (options.agentId) body.agentId = options.agentId;

    const resp = await this.transport.post("/api/v1/jury/cases", {
      json: body,
    });
    const caseData = (resp.data ?? resp) as Record<string, unknown>;
    const caseId = String(
      caseData.caseId ?? caseData.case_id ?? caseData.id ?? "",
    );

    yield { phase: "started", deliberationId: caseId } as DeliberationUpdate;

    let prevStatus = "";
    for (let i = 0; i < 120; i++) {
      await sleep(500);

      let statusData: Record<string, unknown>;
      try {
        const statusResp = await this.transport.get(
          `/api/v1/jury/cases/${caseId}/deliberation`,
        );
        statusData = (statusResp.data ?? statusResp) as Record<string, unknown>;
      } catch {
        continue;
      }

      const status = String(statusData.status ?? "");
      if (status !== prevStatus) {
        prevStatus = status;

        if (status === "voting") {
          yield {
            phase: "voting",
            deliberationId: caseId,
          } as DeliberationUpdate;
        } else if (status === "complete" || status === "completed") {
          const delib = (statusData.deliberation ?? statusData) as Record<
            string,
            unknown
          >;
          const verdict = parseVerdictFromDeliberation(caseId, delib);
          yield {
            phase: "complete",
            deliberationId: caseId,
            verdict,
          } as DeliberationUpdate;
          return;
        }
      }
    }
  }

  /**
   * Submit a case without waiting for the verdict.
   */
  async submitCase(options: DeliberateOptions): Promise<JuryCase> {
    const body: Record<string, unknown> = {
      action: options.action,
      context: options.context,
      riskLevel: options.riskLevel ?? "medium",
    };
    if (options.agentId) body.agentId = options.agentId;

    const resp = await this.transport.post("/api/v1/jury/cases", {
      json: body,
    });
    return parseCase((resp.data ?? resp) as Record<string, unknown>);
  }

  /**
   * Get a jury case by ID.
   */
  async get(caseId: string): Promise<JuryCase> {
    const resp = await this.transport.get(`/api/v1/jury/cases/${caseId}`);
    return parseCase((resp.data ?? resp) as Record<string, unknown>);
  }

  /**
   * Get the deliberation details for a case.
   */
  async getDeliberation(caseId: string): Promise<Record<string, unknown>> {
    const resp = await this.transport.get(
      `/api/v1/jury/cases/${caseId}/deliberation`,
    );
    return (resp.data ?? resp) as Record<string, unknown>;
  }

  /**
   * Get jury deliberation statistics.
   */
  async stats(): Promise<Record<string, unknown>> {
    const resp = await this.transport.get("/api/v1/jury/stats");
    return (resp.data ?? resp) as Record<string, unknown>;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseVerdictFromDeliberation(
  caseId: string,
  delib: Record<string, unknown>,
): Verdict {
  const votesRaw = (delib.votes ?? []) as Record<string, unknown>[];
  const votes: JurorVote[] = votesRaw.map((v) => ({
    jurorRole: String(v.jurorRole ?? v.juror_role ?? v.juror ?? ""),
    decision: String(v.decision ?? ""),
    confidence: Number(v.confidence ?? 0),
    reasoning: String(v.reasoning ?? ""),
  }));

  return {
    id: caseId,
    decision: String(delib.decision ?? delib.verdict ?? ""),
    confidence: Number(delib.confidence ?? 0),
    reasoning: String(delib.reasoning ?? ""),
    votes,
    conditions: (delib.conditions ?? []) as string[],
    deliberationRounds: (delib.deliberationRounds ??
      delib.rounds ??
      1) as number,
    createdAt: delib.createdAt
      ? new Date(delib.createdAt as string)
      : undefined,
  };
}

function parseCase(data: Record<string, unknown>): JuryCase {
  return {
    id: String(data.id ?? ""),
    caseId: (data.caseId ?? data.case_id) as string | undefined,
    status: String(data.status ?? "pending"),
    action: data.action as string | undefined,
    context: (data.context ?? {}) as Record<string, unknown>,
    riskLevel: (data.riskLevel ?? data.risk_level) as string | undefined,
    deliberation: data.deliberation as Record<string, unknown> | undefined,
    createdAt: data.createdAt ? new Date(data.createdAt as string) : undefined,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
