/**
 * Vercel AI SDK integration for Council.
 *
 * Wraps AI SDK tools with Council jury approval.
 *
 * @example
 * ```typescript
 * import { Council } from '@council/sdk';
 * import { withCouncilApproval } from '@council/sdk/integrations/vercel-ai';
 * import { tool } from 'ai';
 *
 * const client = new Council();
 *
 * const safeTool = withCouncilApproval(myTool, {
 *   client,
 *   riskLevel: 'high',
 * });
 * ```
 */

import type { Council } from "../client.js";

export interface CouncilApprovalOptions {
  /** Council client instance. */
  client: Council;
  /** Risk level for jury deliberation. */
  riskLevel?: string;
  /** Build context from tool parameters for the jury. */
  contextBuilder?: (params: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Wrap a Vercel AI SDK tool with Council jury approval.
 *
 * The tool's execute function will first request jury approval before running.
 */
export function withCouncilApproval<
  T extends { execute?: (...args: unknown[]) => unknown; description?: string },
>(tool: T, options: CouncilApprovalOptions): T {
  const { client, riskLevel = "medium", contextBuilder } = options;
  const originalExecute = tool.execute;

  if (!originalExecute) {
    return tool;
  }

  const wrappedExecute = async (...args: unknown[]) => {
    const params = (args[0] ?? {}) as Record<string, unknown>;
    const context = contextBuilder ? contextBuilder(params) : params;

    const toolName = tool.description ?? "unknown_tool";

    // Request jury approval
    await client.jury.deliberate({
      action: `tool:${toolName}`,
      context,
      riskLevel,
    });

    // If approved, execute the original tool
    return originalExecute(...args);
  };

  return { ...tool, execute: wrappedExecute } as T;
}

/**
 * Create a Council approval middleware for AI SDK tool calls.
 *
 * @example
 * ```typescript
 * const middleware = createCouncilMiddleware({
 *   client,
 *   riskLevels: { database: 'high', search: 'low' },
 * });
 * ```
 */
export function createCouncilMiddleware(options: {
  client: Council;
  riskLevels?: Record<string, string>;
  defaultRiskLevel?: string;
}) {
  const { client, riskLevels = {}, defaultRiskLevel = "medium" } = options;

  return {
    /**
     * Check tool invocations against Council jury.
     */
    async beforeToolCall(
      toolName: string,
      params: Record<string, unknown>,
    ): Promise<void> {
      const riskLevel = riskLevels[toolName] ?? defaultRiskLevel;

      await client.jury.deliberate({
        action: `tool:${toolName}`,
        context: { params, tool: toolName },
        riskLevel,
      });
    },
  };
}
